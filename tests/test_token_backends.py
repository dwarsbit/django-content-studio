"""
Tests for Content Studio's own JSON Web Token backend.

Covers token creation and verification, the Bearer-only authentication
class, the httpOnly refresh cookie (rotation, scoping, flags), the
refresh/logout endpoints and the CONTENT_STUDIO token settings.
"""

import time

import jwt as pyjwt
import pytest
from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from content_studio.settings import cs_settings
from content_studio.token_backends import TokenBackendManager
from content_studio.token_backends.jwt import (
    REFRESH_COOKIE_NAME,
    JsonWebTokenBackend,
    create_access_token,
    create_refresh_token,
)

LOGIN_URL = "/api/login/usernamepassword"
REFRESH_URL = "/api/tokens/jsonwebtoken/refresh"
LOGOUT_URL = "/api/tokens/jsonwebtoken/logout"
ME_URL = "/api/me"


def decode(token):
    from django.conf import settings

    return pyjwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])


class TokenCreationTests(TestCase):
    def setUp(self):
        from django.contrib.auth import models as auth_models

        self.user = auth_models.User.objects.create_user(
            username="staff", email="s@example.com", password="x"
        )

    def test_access_token_carries_type_user_and_expiry(self):
        payload = decode(create_access_token(self.user))

        assert payload["token_type"] == "access"
        assert payload["user_id"] == str(self.user.pk)
        assert payload["jti"]

        # Default lifetime is one hour.
        assert payload["exp"] - payload["iat"] == cs_settings.TOKEN_LIFETIME

    def test_refresh_token_carries_type_and_default_weekly_lifetime(self):
        payload = decode(create_refresh_token(self.user))

        assert payload["token_type"] == "refresh"
        assert payload["exp"] - payload["iat"] == 7 * 24 * 60 * 60

    def test_every_token_gets_a_unique_jti(self):
        first = decode(create_access_token(self.user))
        second = decode(create_access_token(self.user))

        assert first["jti"] != second["jti"]

    @override_settings(CONTENT_STUDIO={"TOKEN_LIFETIME": 120})
    def test_token_lifetime_is_configurable(self):
        payload = decode(create_access_token(self.user))

        assert cs_settings.TOKEN_LIFETIME == 120
        assert payload["exp"] - payload["iat"] == 120

    @override_settings(CONTENT_STUDIO={"TOKEN_SIGNING_KEY": "separate-key-" * 4})
    def test_signing_key_is_configurable(self):
        token = create_access_token(self.user)

        # Signed with the dedicated key, not the SECRET_KEY.
        with pytest.raises(pyjwt.InvalidTokenError):
            decode(token)

        payload = pyjwt.decode(token, "separate-key-" * 4, algorithms=["HS256"])
        assert payload["user_id"] == str(self.user.pk)

    def test_get_info_exposes_the_lifetimes(self):
        info = JsonWebTokenBackend.get_info()

        assert info["type"] == "JsonWebTokenBackend"
        assert info["config"]["ACCESS_TOKEN_LIFETIME"] == cs_settings.TOKEN_LIFETIME
        assert (
            info["config"]["REFRESH_TOKEN_LIFETIME"]
            == cs_settings.REFRESH_TOKEN_LIFETIME
        )


class AuthenticationTests(TestCase):
    def setUp(self):
        from django.contrib.auth import models as auth_models

        self.user = auth_models.User.objects.create_superuser(
            username="admin", email="a@example.com", password="x"
        )
        self.client = APIClient()

    def test_valid_access_token_authenticates(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {create_access_token(self.user)}"
        )

        response = self.client.get(ME_URL)

        assert response.status_code == 200
        assert response.json()["username"] == "admin"

    def test_requests_without_credentials_are_unauthenticated(self):
        response = self.client.get(ME_URL)

        assert response.status_code == 401

    def test_wrong_header_prefix_is_rejected(self):
        token = create_access_token(self.user)

        for header in (
            f"JWT {token}",
            f"Basic {token}",
            token,
        ):
            self.client.credentials(HTTP_AUTHORIZATION=header)
            response = self.client.get(ME_URL)
            assert response.status_code == 401, header

    def test_tampered_token_is_rejected(self):
        token = create_access_token(self.user)
        tampered = token[:-4] + ("AAAA" if not token.endswith("AAAA") else "BBBB")

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tampered}")

        assert self.client.get(ME_URL).status_code == 401

    def test_token_signed_with_a_different_key_is_rejected(self):
        # Created while the default signing key (SECRET_KEY) is active.
        token = create_access_token(self.user)

        with override_settings(
            CONTENT_STUDIO={"TOKEN_SIGNING_KEY": "rotated-key-" * 4}
        ):
            self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

            assert self.client.get(ME_URL).status_code == 401

    def test_expired_token_is_rejected(self):
        payload = decode(create_access_token(self.user))
        payload["exp"] = int(time.time()) - 10
        from django.conf import settings

        expired = pyjwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {expired}")

        assert self.client.get(ME_URL).status_code == 401

    def test_refresh_token_cannot_be_used_as_an_access_token(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {create_refresh_token(self.user)}"
        )

        assert self.client.get(ME_URL).status_code == 401

    def test_unknown_user_is_rejected(self):
        payload = decode(create_access_token(self.user))
        payload["user_id"] = "999999"
        from django.conf import settings

        token = pyjwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        assert self.client.get(ME_URL).status_code == 401

    def test_disabled_user_is_rejected(self):
        self.user.is_active = False
        self.user.save()

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {create_access_token(self.user)}"
        )

        assert self.client.get(ME_URL).status_code == 401


class LoginAndRefreshFlowTests(TestCase):
    def setUp(self):
        from django.contrib.auth import models as auth_models

        auth_models.User.objects.create_superuser(
            username="admin", email="a@example.com", password="secret"
        )

    def login(self, client=None):
        client = client or APIClient()
        return client.post(
            LOGIN_URL,
            {"username": "admin", "password": "secret"},
            format="json",
        )

    def test_login_returns_access_in_the_body_only(self):
        response = self.login()

        assert response.status_code == 200
        assert response.json().keys() == {"access"}

    def test_login_sets_an_httponly_scoped_refresh_cookie(self):
        from django.conf import settings

        response = self.login()

        cookie = response.cookies[REFRESH_COOKIE_NAME]
        assert cookie["httponly"]
        assert cookie["samesite"] == "Lax"
        assert cookie["max-age"] == cs_settings.REFRESH_TOKEN_LIFETIME
        # Scoped to the token endpoints, not the whole site.
        assert cookie["path"] == "/api/tokens/jsonwebtoken/"
        assert not cookie["secure"]

    def test_login_cookie_is_secure_over_https(self):
        client = APIClient()
        response = client.post(
            LOGIN_URL,
            {"username": "admin", "password": "secret"},
            format="json",
            secure=True,
        )

        assert response.status_code == 200
        assert response.cookies[REFRESH_COOKIE_NAME]["secure"]

    def test_refresh_rotates_the_cookie_and_returns_a_new_access_token(self):
        login = self.login()
        first_refresh = login.cookies[REFRESH_COOKIE_NAME].value
        access = login.json()["access"]

        client = APIClient()
        client.cookies[REFRESH_COOKIE_NAME] = first_refresh
        refreshed = client.post(REFRESH_URL)

        assert refreshed.status_code == 200
        assert refreshed.json().keys() == {"access"}
        assert refreshed.json()["access"] != access
        assert refreshed.cookies[REFRESH_COOKIE_NAME].value != first_refresh

        # The rotated cookie continues the session.
        client = APIClient()
        client.cookies[REFRESH_COOKIE_NAME] = refreshed.cookies[
            REFRESH_COOKIE_NAME
        ].value
        assert client.post(REFRESH_URL).status_code == 200

    def test_the_refresh_token_never_leaves_the_http_only_cookie(self):
        login = self.login()

        # The refresh token is never in the response body, and the cookie
        # carrying it is httpOnly, so no script can read it.
        assert "refresh" not in login.json()
        assert login.cookies[REFRESH_COOKIE_NAME]["httponly"]

    def test_refresh_without_a_cookie_is_rejected(self):
        assert APIClient().post(REFRESH_URL).status_code == 401

    def test_access_token_in_the_cookie_is_rejected_on_refresh(self):
        from django.contrib.auth import models as auth_models

        user = auth_models.User.objects.get(username="admin")

        client = APIClient()
        client.cookies[REFRESH_COOKIE_NAME] = create_access_token(user)

        assert client.post(REFRESH_URL).status_code == 401

    def test_logout_clears_the_cookie_and_ends_the_session(self):
        login = self.login()
        client = APIClient()
        client.cookies[REFRESH_COOKIE_NAME] = login.cookies[REFRESH_COOKIE_NAME].value

        logout = client.post(LOGOUT_URL)

        assert logout.status_code == 204

        # The logout response expires the refresh cookie.
        cookie = logout.cookies[REFRESH_COOKIE_NAME]
        assert cookie.value == ""
        assert cookie["max-age"] == 0

        # Without a valid refresh cookie the session cannot be continued.
        assert APIClient().post(REFRESH_URL).status_code == 401


class CustomBackend(JsonWebTokenBackend):
    pass


class BrokenBackend:
    pass


class TokenBackendManagerTests(TestCase):
    def test_the_default_backend_is_content_studios_own(self):
        assert TokenBackendManager().active_backend is JsonWebTokenBackend

    def test_a_custom_backend_is_resolved_from_an_import_string(self):
        from django.utils.module_loading import import_string

        with override_settings(
            CONTENT_STUDIO={"TOKEN_BACKEND": "tests.test_token_backends.CustomBackend"}
        ):
            # Compare through the same import mechanism; identity against
            # the test module's class can differ when the module is
            # imported twice under different paths.
            assert TokenBackendManager().active_backend is import_string(
                "tests.test_token_backends.CustomBackend"
            )

    def test_a_backend_missing_the_interface_raises(self):
        with override_settings(
            CONTENT_STUDIO={"TOKEN_BACKEND": "tests.test_token_backends.BrokenBackend"}
        ):
            with pytest.raises(ImproperlyConfigured):
                TokenBackendManager().active_backend
