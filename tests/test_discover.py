"""
Tests for the discover endpoint.
"""

from django.contrib.auth import models as auth_models
from django.test import TestCase, override_settings


class DiscoverEndpointTests(TestCase):
    def setUp(self):
        self.user = auth_models.User.objects.create_superuser(
            username="admin", email="a@example.com", password="x"
        )
        self.client.force_login(self.user)

    def test_discover_with_default_configuration(self):
        """Discover works with no extensions, media library, dashboard or tenancy."""
        response = self.client.get("/api/discover")

        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertEqual(data["extensions"], [])
        self.assertEqual(data["media_library"]["enabled"], False)
        self.assertEqual(data["media_library"]["folders"], False)
        self.assertEqual(data["media_library"]["models"]["media_model"], None)
        self.assertEqual(data["media_library"]["models"]["folder_model"], None)
        self.assertEqual(data["dashboard"], {"widgets": []})
        self.assertEqual(data["multitenancy"]["enabled"], False)

    def test_discover_reports_configured_models(self):
        """Discover reports labels for configured media library models."""

        with override_settings(
            CONTENT_STUDIO={
                "ADMIN_SITE": "content_studio.admin.admin_site",
                "MEDIA_LIBRARY_MODEL": "django.contrib.auth.models.User",
                "MEDIA_LIBRARY_FOLDER_MODEL": "django.contrib.auth.models.Group",
            }
        ):
            response = self.client.get("/api/discover")

        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertEqual(data["media_library"]["enabled"], True)
        self.assertEqual(data["media_library"]["folders"], True)
        self.assertEqual(data["media_library"]["models"]["media_model"], "auth.user")
        self.assertEqual(data["media_library"]["models"]["folder_model"], "auth.group")

    def test_discover_lists_registered_models(self):
        """Discover includes the registered admin models."""
        response = self.client.get("/api/discover")

        self.assertEqual(response.status_code, 200)

        models = {model["label"] for model in response.json()["models"]}
        self.assertIn("auth.user", models)
        self.assertIn("auth.group", models)
