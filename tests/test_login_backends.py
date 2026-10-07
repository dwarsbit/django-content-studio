"""
Tests for the login backend router registration: every backend gets a
unique basename so multiple backends cannot shadow each other, and
login attempts are throttled per IP.
"""

from django.test import TestCase as DjangoTestCase
from rest_framework.test import APIClient

from rest_framework.viewsets import ViewSet

from content_studio.login_backends import LoginBackendManager
from content_studio.router import ExtendedRouter
from content_studio.login_backends.username_password import UsernamePasswordBackend


class MagicLinkBackend(UsernamePasswordBackend):
    name = "Magic link"


class StubBackend(UsernamePasswordBackend):
    name = "Stub"


class StubViewSet(ViewSet):
    pass


def test_each_backend_gets_a_unique_basename():
    router = ExtendedRouter(trailing_slash=False)

    manager = LoginBackendManager()
    manager.active_backends = [UsernamePasswordBackend, MagicLinkBackend]
    manager.set_up_router(router)

    basenames = {basename for _, _, basename in router.registry}

    assert basenames == {
        "content_studio_login_backend_usernamepasswordbackend",
        "content_studio_login_backend_magiclinkbackend",
    }


def test_multiple_backends_build_urls_without_collisions():
    router = ExtendedRouter(trailing_slash=False)

    manager = LoginBackendManager()
    manager.active_backends = [UsernamePasswordBackend, StubBackend]
    manager.set_up_router(router)

    # The URL list builds without reverse name collisions.
    patterns = router.urls
    login_routes = [
        str(pattern.pattern) for pattern in patterns if "login" in str(pattern.pattern)
    ]

    assert len(login_routes) >= 2
    assert len(set(login_routes)) == len(login_routes)


class LoginThrottleTests(DjangoTestCase):
    def _login(self, client, username="admin"):
        return client.post(
            "/api/login/usernamepassword",
            {"username": username, "password": "wrong"},
            format="json",
        )

    def test_login_attempts_are_throttled_per_ip(self):
        from django.test import override_settings

        from content_studio.login_backends import LoginBackendManager
        from content_studio.router import ExtendedRouter

        with override_settings(
            CONTENT_STUDIO={
                "ADMIN_SITE": "content_studio.admin.admin_site",
                "LOGIN_THROTTLE_RATE": "3/min",
            }
        ):
            LoginBackendManager().set_up_router(ExtendedRouter(trailing_slash=False))
            client = APIClient(REMOTE_ADDR="10.1.1.1")

            statuses = [self._login(client).status_code for _ in range(4)]

            # The fourth attempt within the window is throttled.
            assert statuses == [403, 403, 403, 429], statuses

    def test_throttle_can_be_disabled(self):
        from django.test import override_settings

        from content_studio.login_backends import LoginBackendManager
        from content_studio.router import ExtendedRouter

        with override_settings(
            CONTENT_STUDIO={
                "ADMIN_SITE": "content_studio.admin.admin_site",
                "LOGIN_THROTTLE_RATE": None,
            }
        ):
            LoginBackendManager().set_up_router(ExtendedRouter(trailing_slash=False))
            client = APIClient(REMOTE_ADDR="10.1.1.2")

            from content_studio.login_backends.username_password import (
                UsernamePasswordViewSet,
            )

            assert UsernamePasswordViewSet.throttle_classes == []
