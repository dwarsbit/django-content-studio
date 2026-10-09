"""
Tests for app readiness: routes are created in every context and the
boot log is gated to interactive server mode.
"""

from django.test import TestCase

from content_studio.utils import is_runserver


def test_is_runserver_is_false_under_pytest():
    """Test runners are not interactive servers: no boot log, no PyPI call."""
    assert is_runserver() is False


class RouteRegistrationTests(TestCase):
    def test_content_routes_exist_outside_server_mode(self):
        """Routes are created in every context, including tests."""
        response = self.client.get("/api/content/auth.user")

        # Not 404: the route exists, authentication is required.
        self.assertNotEqual(response.status_code, 404)

    def test_discover_is_public(self):
        """The frontend needs discover before authentication."""
        response = self.client.get("/api/discover")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["extensions"], [])

    def test_me_requires_authentication(self):
        response = self.client.get("/api/me")

        self.assertIn(response.status_code, (401, 403))

    def test_me_accepts_the_configured_token_backend(self):
        """AdminApiViewSet authenticates with the studio's token backend."""
        from django.contrib.auth import models as auth_models

        from content_studio.token_backends.jwt import create_access_token

        user = auth_models.User.objects.create_superuser(
            username="admin", email="a@example.com", password="x"
        )
        token = create_access_token(user)

        response = self.client.get("/api/me", HTTP_AUTHORIZATION=f"Bearer {token}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], "admin")
