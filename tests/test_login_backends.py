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

    def _throttled_statuses(self, rest_framework=None):
        from django.test import override_settings

        with override_settings(
            CONTENT_STUDIO={
                "ADMIN_SITE": "content_studio.admin.admin_site",
                "LOGIN_THROTTLE_RATE": "3/min",
            },
            REST_FRAMEWORK=rest_framework or {},
        ):
            LoginBackendManager().set_up_router(ExtendedRouter(trailing_slash=False))
            client = APIClient(REMOTE_ADDR="10.1.1.3")

            return [
                client.post(
                    "/api/login/usernamepassword",
                    {"username": "admin", "password": "wrong"},
                    format="json",
                    HTTP_X_FORWARDED_FOR=f"1.2.3.{i}",
                ).status_code
                for i in range(4)
            ]

    def test_spoofed_forwarded_for_does_not_bypass_the_throttle(self):
        # Without NUM_PROXIES the header is not trusted: every attempt
        # counts against the connection's address.
        statuses = self._throttled_statuses()

        assert statuses == [403, 403, 403, 429], statuses

    def test_forwarded_for_is_honoured_with_num_proxies(self):
        # Behind one proxy, the address it adds identifies the client.
        statuses = self._throttled_statuses({"NUM_PROXIES": 1})

        assert statuses == [403, 403, 403, 403], statuses

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


class LoginSignalTests(DjangoTestCase):
    """Logging in goes through Django's login plumbing: authenticate()
    gets the request and the auth signals are sent, so django-axes and
    audit tools see Content Studio logins."""

    def setUp(self):
        from django.contrib.auth.models import User

        self.staff = User.objects.create_user(
            username="editor", password="secret", is_staff=True
        )
        User.objects.create_user(username="customer", password="secret")

    def _login(self, username, password="secret"):
        return APIClient().post(
            "/api/login/usernamepassword",
            {"username": username, "password": password},
            format="json",
        )

    def _receive(self, signal):
        received = []

        def receiver(sender, **kwargs):
            received.append(kwargs)

        signal.connect(receiver)
        self.addCleanup(signal.disconnect, receiver)

        return received

    def test_a_login_sends_user_logged_in_with_the_request(self):
        from django.contrib.auth.signals import user_logged_in
        from django.http import HttpRequest

        received = self._receive(user_logged_in)

        assert self._login("editor").status_code == 200

        assert len(received) == 1
        assert received[0]["user"] == self.staff
        assert isinstance(received[0]["request"], HttpRequest)

        # update_last_login listens to the signal.
        self.staff.refresh_from_db()
        assert self.staff.last_login is not None

    def test_authenticate_receives_the_request(self):
        from unittest import mock

        from django.http import HttpRequest

        with mock.patch(
            "content_studio.login_backends.username_password.authenticate",
            return_value=None,
        ) as authenticate:
            self._login("editor")

        request = authenticate.call_args.args[0]
        assert isinstance(request, HttpRequest)
        assert authenticate.call_args.kwargs == {
            "username": "editor",
            "password": "secret",
        }

    def test_a_wrong_password_sends_user_login_failed(self):
        from django.contrib.auth.signals import user_logged_in, user_login_failed
        from django.http import HttpRequest

        failed = self._receive(user_login_failed)
        logged_in = self._receive(user_logged_in)

        assert self._login("editor", "wrong").status_code == 403

        assert logged_in == []
        assert len(failed) == 1
        assert failed[0]["credentials"]["username"] == "editor"
        assert isinstance(failed[0]["request"], HttpRequest)

    def test_a_refused_non_staff_login_sends_user_login_failed(self):
        from django.contrib.auth.signals import user_logged_in, user_login_failed

        failed = self._receive(user_login_failed)
        logged_in = self._receive(user_logged_in)

        assert self._login("customer").status_code == 403

        assert logged_in == []
        assert len(failed) == 1
        assert failed[0]["credentials"] == {"username": "customer"}


class LoginFieldLengthTests(DjangoTestCase):
    """The login fields are capped: the username at the user model's
    field length, the password at MAX_PASSWORD_LENGTH."""

    def _login(self, username, password):
        return APIClient().post(
            "/api/login/usernamepassword",
            {"username": username, "password": password},
            format="json",
        )

    def test_an_overlong_username_is_a_client_error(self):
        from django.contrib.auth.models import User

        max_length = User._meta.get_field("username").max_length
        response = self._login("a" * (max_length + 1), "secret")

        assert response.status_code == 400
        assert "username" in response.json()

        assert self._login("a" * max_length, "secret").status_code == 403

    def test_an_overlong_password_is_a_client_error(self):
        from content_studio.utils import MAX_PASSWORD_LENGTH

        response = self._login("editor", "a" * (MAX_PASSWORD_LENGTH + 1))

        assert response.status_code == 400
        assert "password" in response.json()

        assert self._login("editor", "a" * MAX_PASSWORD_LENGTH).status_code == 403

    def test_the_username_cap_follows_the_user_model(self):
        from content_studio.login_backends.username_password import (
            UsernamePasswordSerializer,
        )

        serializer = UsernamePasswordSerializer(
            data={"username": "a" * 150, "password": "x"}
        )
        assert serializer.is_valid()
        assert serializer.fields["username"].max_length == 150
