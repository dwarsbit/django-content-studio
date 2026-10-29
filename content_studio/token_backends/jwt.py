"""
Content Studio's own JSON Web Token backend.

The access token authenticates API requests through the
``Authorization: Bearer <token>`` header and is short-lived. The matching
refresh token lives in an httpOnly cookie scoped to the token endpoints and
never reaches the browser, so a compromised page cannot steal it.

Tokens are revoked server-side through Django's cache (``TOKEN_CACHE``,
which must be shared across processes and servers):

- Refreshing rotates the refresh token and marks the presented one as
  used. A used refresh token presented again is a sign it leaked, so the
  whole session (every token sharing its ``sid``) is revoked.
- Logging out revokes the session, the presented refresh token and the
  current access token, each for the rest of its lifetime.
- Every refresh token carries the moment the user logged in
  (``auth_time``); past ``MAX_SESSION_LIFETIME`` refresh is refused, so a
  session cannot be renewed forever.

Tokens issued before ``sid`` and ``auth_time`` existed keep working: their
``iat`` counts as the login time and they are revoked by ``jti`` only.

All configuration lives in the ``CONTENT_STUDIO`` settings namespace and the
tokens are signed with the project's own key, so consuming projects that run
their own JWT stack (e.g. djangorestframework-simplejwt) never conflict with
Content Studio.
"""

import time
import uuid
from datetime import datetime, timedelta, timezone as dt_timezone

import jwt as pyjwt
from django.conf import settings
from django.core.cache import caches
from django.utils.crypto import constant_time_compare, salted_hmac
from django.contrib.auth import get_user_model
from django.urls import NoReverseMatch, reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.authentication import (
    BaseAuthentication,
    get_authorization_header,
)
from rest_framework.decorators import action
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from ..settings import cs_settings

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"

REFRESH_COOKIE_NAME = "__dcs-refresh__"
REFRESH_ROUTE_NAME = "content_studio_token_backend_jsonwebtokenbackend-refresh"
REFRESH_URL_SUFFIX = "refresh"

REVOKED_KEY_PREFIX = "content_studio:jwt:revoked"


def _signing_key():
    return cs_settings.TOKEN_SIGNING_KEY or settings.SECRET_KEY


def _secret_key_fallbacks():
    return list(getattr(settings, "SECRET_KEY_FALLBACKS", None) or [])


def _verification_keys():
    """
    The keys a token may be signed with: the signing key and, when that
    is Django's SECRET_KEY, its SECRET_KEY_FALLBACKS — so rotating the
    key the way Django documents keeps the sessions it signed.
    """
    if cs_settings.TOKEN_SIGNING_KEY:
        return [cs_settings.TOKEN_SIGNING_KEY]

    return [settings.SECRET_KEY, *_secret_key_fallbacks()]


def _encode(payload):
    return pyjwt.encode(payload, _signing_key(), algorithm=cs_settings.TOKEN_ALGORITHM)


def _decode(token):
    keys = _verification_keys()

    for index, key in enumerate(keys):
        try:
            return pyjwt.decode(
                token,
                key,
                algorithms=[cs_settings.TOKEN_ALGORITHM],
                options={
                    "require": ["exp", "iat", "token_type", "user_id", "jti", "pwd"]
                },
            )
        except pyjwt.InvalidSignatureError as e:
            # Signed with none of the keys: invalid. Otherwise try the
            # next key.
            if index == len(keys) - 1:
                raise AuthenticationFailed("Invalid or expired token.") from e
        except pyjwt.InvalidTokenError as e:
            raise AuthenticationFailed("Invalid or expired token.") from e


def _password_fingerprint(user, secret=None):
    """
    A short HMAC of the user's password hash. Tokens carry it, so changing
    or resetting the password invalidates every token issued before —
    like Django's session auth hash does for sessions. Keyed with
    SECRET_KEY unless a secret is given.
    """
    return salted_hmac(
        "content_studio.token_backends.jwt",
        user.password,
        secret=secret,
        algorithm="sha256",
    ).hexdigest()[:32]


def _password_fingerprint_matches(user, fingerprint):
    """
    Whether the fingerprint was made from the user's current password,
    with SECRET_KEY or one of its SECRET_KEY_FALLBACKS — like Django's
    session auth hash, so a key rotation does not end the sessions.
    """
    secrets = [settings.SECRET_KEY, *_secret_key_fallbacks()]

    return any(
        constant_time_compare(fingerprint, _password_fingerprint(user, secret))
        for secret in secrets
    )


def _create_token(user, token_type, lifetime, **claims):
    now = timezone.now()
    return _encode(
        {
            "token_type": token_type,
            "user_id": str(user.pk),
            "iat": now,
            "exp": now + lifetime,
            "jti": uuid.uuid4().hex,
            "pwd": _password_fingerprint(user),
            **claims,
        }
    )


def _new_session():
    return {"sid": uuid.uuid4().hex, "auth_time": int(time.time())}


def create_access_token(user, sid=None):
    claims = {"sid": sid} if sid else {}
    return _create_token(
        user,
        ACCESS_TOKEN_TYPE,
        timedelta(seconds=cs_settings.TOKEN_LIFETIME),
        **claims,
    )


def create_refresh_token(user, sid=None, auth_time=None):
    """
    A refresh token for a session. Without ``sid`` and ``auth_time`` it
    starts a new session (a login); a refresh passes the old token's, so
    the session keeps its identity and its absolute expiry.
    """
    session = _new_session()
    sid = sid or session["sid"]
    auth_time = session["auth_time"] if auth_time is None else int(auth_time)

    lifetime = timedelta(seconds=cs_settings.REFRESH_TOKEN_LIFETIME)
    if cs_settings.MAX_SESSION_LIFETIME is not None:
        session_end = datetime.fromtimestamp(
            auth_time + cs_settings.MAX_SESSION_LIFETIME, tz=dt_timezone.utc
        )
        lifetime = max(min(lifetime, session_end - timezone.now()), timedelta(0))

    return _create_token(
        user, REFRESH_TOKEN_TYPE, lifetime, sid=sid, auth_time=auth_time
    )


def _token_cache():
    return caches[cs_settings.TOKEN_CACHE]


def _revoked_key(kind, value):
    return f"{REVOKED_KEY_PREFIX}:{kind}:{value}"


def _remaining(exp):
    # At least a second: a timeout of 0 means "never expire" for some
    # cache backends.
    return max(int(exp - time.time()) + 1, 1)


def _revoke_jti(payload):
    _token_cache().set(
        _revoked_key("jti", payload["jti"]), True, _remaining(payload["exp"])
    )


def _revoke_session(payload):
    """
    Revokes every token of the session for as long as one of them can
    still be valid: the session's absolute end, or the longest token
    lifetime when there is no maximum.
    """
    sid = payload.get("sid")
    if not sid:
        return

    lifetimes = [cs_settings.REFRESH_TOKEN_LIFETIME, cs_settings.TOKEN_LIFETIME]
    timeout = max(lifetimes) + 1
    if cs_settings.MAX_SESSION_LIFETIME is not None and "auth_time" in payload:
        session_end = int(payload["auth_time"]) + cs_settings.MAX_SESSION_LIFETIME
        timeout = min(timeout, _remaining(session_end))

    _token_cache().set(_revoked_key("sid", sid), True, max(timeout, 1))


def _check_not_revoked(payload, check_jti=True):
    keys = [_revoked_key("jti", payload["jti"])] if check_jti else []
    if payload.get("sid"):
        keys.append(_revoked_key("sid", payload["sid"]))

    if _token_cache().get_many(keys):
        raise AuthenticationFailed("Invalid or expired token.")


def _consume_refresh_token(payload):
    """
    Marks a refresh token as used. ``cache.add`` only writes a missing
    key, so of two requests presenting the same token only one wins;
    the other is treated as reuse and ends the session.
    """
    if not _token_cache().add(
        _revoked_key("jti", payload["jti"]), True, _remaining(payload["exp"])
    ):
        _revoke_session(payload)
        raise AuthenticationFailed("Invalid or expired token.")


def _check_session_age(payload):
    if cs_settings.MAX_SESSION_LIFETIME is None:
        return

    auth_time = payload.get("auth_time", payload["iat"])
    try:
        auth_time = int(auth_time)
    except (TypeError, ValueError):
        raise AuthenticationFailed("Invalid or expired token.")

    if time.time() - auth_time > cs_settings.MAX_SESSION_LIFETIME:
        raise AuthenticationFailed("Session expired.")


def _get_user(payload):
    try:
        user = get_user_model().objects.get(pk=payload["user_id"])
    except (get_user_model().DoesNotExist, ValueError, TypeError):
        raise AuthenticationFailed("User not found.")

    # The Django admin's gate: tokens only work for active staff users,
    # so revoking staff status or deactivating a user ends their access.
    if not (user.is_active and user.is_staff):
        raise AuthenticationFailed("User account is disabled.")

    if not _password_fingerprint_matches(user, payload["pwd"]):
        raise AuthenticationFailed("Invalid or expired token.")

    return user


class JsonWebTokenAuthentication(BaseAuthentication):
    """
    Authenticates requests carrying ``Authorization: Bearer <access token>``.
    """

    keyword = "Bearer"

    def authenticate(self, request):
        try:
            header = get_authorization_header(request).decode("utf-8")
        except UnicodeError:
            raise AuthenticationFailed("Invalid authorization header.")

        if not header:
            return None

        parts = header.split()

        if len(parts) != 2 or parts[0].lower() != self.keyword.lower():
            return None

        payload = _decode(parts[1])

        if payload["token_type"] != ACCESS_TOKEN_TYPE:
            raise AuthenticationFailed("Invalid token type.")

        _check_not_revoked(payload)

        return _get_user(payload), parts[1]

    def authenticate_header(self, request):
        return self.keyword


class JsonWebTokenViewSet(ViewSet):
    """
    Token endpoints: refresh (rotates the httpOnly cookie) and logout.

    The authentication class is listed so that DRF keeps responding 401
    (with a WWW-Authenticate header) instead of downgrading authentication
    failures to 403; it never authenticates the cookie-based flow itself.
    """

    permission_classes = [AllowAny]
    authentication_classes = [JsonWebTokenAuthentication]
    renderer_classes = [JSONRenderer]

    def perform_authentication(self, request):
        # Logging out with an expired access token must still revoke the
        # refresh token and clear the cookie; logout reads the tokens
        # itself and never needs request.user.
        if self.action != "logout":
            super().perform_authentication(request)

    @action(detail=False, methods=["post"], url_path="refresh")
    def refresh(self, request):
        token = request.COOKIES.get(REFRESH_COOKIE_NAME)

        if not token:
            raise AuthenticationFailed("No refresh token present.")

        payload = _decode(token)

        if payload["token_type"] != REFRESH_TOKEN_TYPE:
            raise AuthenticationFailed("Invalid token type.")

        # The jti is checked by consuming it, so that a reused token ends
        # its session instead of only being refused.
        _check_not_revoked(payload, check_jti=False)
        _check_session_age(payload)
        user = _get_user(payload)
        _consume_refresh_token(payload)

        # Tokens from before sessions carried an id start one now; the
        # login time stays the old token's issue time.
        sid = payload.get("sid") or uuid.uuid4().hex
        auth_time = payload.get("auth_time", payload["iat"])

        response = Response({"access": create_access_token(user, sid=sid)})
        _set_refresh_cookie(
            response,
            create_refresh_token(user, sid=sid, auth_time=auth_time),
            request,
        )

        return response

    @action(detail=False, methods=["post"], url_path="logout")
    def logout(self, request):
        # Revokes whatever valid tokens the request carries; logging out
        # without them (or with expired ones) still clears the cookie.
        for token, token_type in (
            (request.COOKIES.get(REFRESH_COOKIE_NAME), REFRESH_TOKEN_TYPE),
            (_bearer_token(request), ACCESS_TOKEN_TYPE),
        ):
            if not token:
                continue
            try:
                payload = _decode(token)
            except AuthenticationFailed:
                continue
            if payload["token_type"] != token_type:
                continue
            _revoke_jti(payload)
            _revoke_session(payload)

        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(REFRESH_COOKIE_NAME, path=_cookie_path(), samesite="Lax")

        return response


def _bearer_token(request):
    try:
        parts = get_authorization_header(request).decode("utf-8").split()
    except UnicodeError:
        return None

    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    return parts[1]


def _cookie_path():
    """
    Scopes the refresh cookie to the token endpoints themselves, resolved
    through the URLconf so it works under any mount prefix. Custom token
    backends that register under another basename fall back to ``/``.
    """

    try:
        refresh_url = reverse(REFRESH_ROUTE_NAME)
    except NoReverseMatch:
        return "/"

    if not refresh_url.endswith(REFRESH_URL_SUFFIX):
        return "/"

    return refresh_url[: -len(REFRESH_URL_SUFFIX)]


def _cookie_secure(request) -> bool:
    secure = cs_settings.REFRESH_COOKIE_SECURE

    if secure is None:
        return request.is_secure() or not settings.DEBUG

    return bool(secure)


def _set_refresh_cookie(response, token, request):
    # The cookie lives as long as the token, which a maximum session
    # lifetime can cut short.
    exp = pyjwt.decode(token, options={"verify_signature": False})["exp"]

    response.set_cookie(
        REFRESH_COOKIE_NAME,
        token,
        max_age=min(cs_settings.REFRESH_TOKEN_LIFETIME, _remaining(exp)),
        httponly=True,
        samesite="Lax",
        secure=_cookie_secure(request),
        path=_cookie_path(),
    )


class JsonWebTokenBackend:
    name = "JSON Web Token"
    authentication_class = JsonWebTokenAuthentication
    view_set = JsonWebTokenViewSet

    @classmethod
    def get_info(cls):
        return {
            "type": cls.__name__,
            "config": {
                "ACCESS_TOKEN_LIFETIME": cs_settings.TOKEN_LIFETIME,
                "REFRESH_TOKEN_LIFETIME": cs_settings.REFRESH_TOKEN_LIFETIME,
            },
        }

    @classmethod
    def get_response_for_user(cls, user, request):
        session = _new_session()
        response = Response({"access": create_access_token(user, sid=session["sid"])})
        _set_refresh_cookie(response, create_refresh_token(user, **session), request)

        return response
