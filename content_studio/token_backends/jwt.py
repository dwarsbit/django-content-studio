"""
Content Studio's own JSON Web Token backend.

The access token authenticates API requests through the
``Authorization: Bearer <token>`` header and is short-lived. The matching
refresh token lives in an httpOnly cookie scoped to the token endpoints and
never reaches the browser, so a compromised page cannot steal it. Refreshing
rotates the refresh token; the previous one simply expires.

All configuration lives in the ``CONTENT_STUDIO`` settings namespace and the
tokens are signed with the project's own key, so consuming projects that run
their own JWT stack (e.g. djangorestframework-simplejwt) never conflict with
Content Studio.
"""

import uuid
from datetime import timedelta

import jwt as pyjwt
from django.conf import settings
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


def _signing_key():
    return cs_settings.TOKEN_SIGNING_KEY or settings.SECRET_KEY


def _encode(payload):
    return pyjwt.encode(payload, _signing_key(), algorithm=cs_settings.TOKEN_ALGORITHM)


def _decode(token):
    try:
        return pyjwt.decode(
            token,
            _signing_key(),
            algorithms=[cs_settings.TOKEN_ALGORITHM],
            options={"require": ["exp", "iat", "token_type", "user_id", "jti"]},
        )
    except pyjwt.InvalidTokenError as e:
        raise AuthenticationFailed("Invalid or expired token.") from e


def _create_token(user, token_type, lifetime):
    now = timezone.now()
    return _encode(
        {
            "token_type": token_type,
            "user_id": str(user.pk),
            "iat": now,
            "exp": now + lifetime,
            "jti": uuid.uuid4().hex,
        }
    )


def create_access_token(user):
    return _create_token(
        user, ACCESS_TOKEN_TYPE, timedelta(seconds=cs_settings.TOKEN_LIFETIME)
    )


def create_refresh_token(user):
    return _create_token(
        user,
        REFRESH_TOKEN_TYPE,
        timedelta(seconds=cs_settings.REFRESH_TOKEN_LIFETIME),
    )


def _get_user(payload):
    try:
        user = get_user_model().objects.get(pk=payload["user_id"])
    except (get_user_model().DoesNotExist, ValueError, TypeError):
        raise AuthenticationFailed("User not found.")

    if not user.is_active:
        raise AuthenticationFailed("User account is disabled.")

    return user


class JsonWebTokenAuthentication(BaseAuthentication):
    """
    Authenticates requests carrying ``Authorization: Bearer <access token>``.
    """

    keyword = "Bearer"

    def authenticate(self, request):
        header = get_authorization_header(request).decode("utf-8")

        if not header:
            return None

        parts = header.split()

        if len(parts) != 2 or parts[0].lower() != self.keyword.lower():
            return None

        payload = _decode(parts[1])

        if payload["token_type"] != ACCESS_TOKEN_TYPE:
            raise AuthenticationFailed("Invalid token type.")

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

    @action(detail=False, methods=["post"], url_path="refresh")
    def refresh(self, request):
        token = request.COOKIES.get(REFRESH_COOKIE_NAME)

        if not token:
            raise AuthenticationFailed("No refresh token present.")

        payload = _decode(token)

        if payload["token_type"] != REFRESH_TOKEN_TYPE:
            raise AuthenticationFailed("Invalid token type.")

        user = _get_user(payload)

        response = Response({"access": create_access_token(user)})
        _set_refresh_cookie(response, create_refresh_token(user), request)

        return response

    @action(detail=False, methods=["post"], url_path="logout")
    def logout(self, request):
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(REFRESH_COOKIE_NAME, path=_cookie_path(), samesite="Lax")

        return response


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


def _set_refresh_cookie(response, token, request):
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        token,
        max_age=cs_settings.REFRESH_TOKEN_LIFETIME,
        httponly=True,
        samesite="Lax",
        secure=request.is_secure(),
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
        response = Response({"access": create_access_token(user)})
        _set_refresh_cookie(response, create_refresh_token(user), request)

        return response
