"""
Tests for the discover endpoint.
"""

from django.contrib.auth import models as auth_models
from django.test import TestCase, override_settings

from content_studio import VERSION
from content_studio.token_backends.jwt import create_access_token


class DiscoverEndpointTests(TestCase):
    def setUp(self):
        self.user = auth_models.User.objects.create_superuser(
            username="admin", email="a@example.com", password="x"
        )
        self.client.defaults["HTTP_AUTHORIZATION"] = (
            f"Bearer {create_access_token(self.user)}"
        )

    def test_discover_requires_active_staff(self):
        anonymous = self.client_class()
        self.assertEqual(anonymous.get("/api/discover").status_code, 401)

        customer = auth_models.User.objects.create_user(
            username="customer", password="x"
        )
        other = self.client_class(
            HTTP_AUTHORIZATION=f"Bearer {create_access_token(customer)}"
        )
        self.assertEqual(other.get("/api/discover").status_code, 401)

    def test_discover_carries_the_version(self):
        self.assertEqual(self.client.get("/api/discover").json()["version"], VERSION)

    def test_discover_with_default_configuration(self):
        """Discover works with no extensions, media library, dashboard or tenancy."""
        response = self.client.get("/api/discover")

        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertEqual(data["extensions"], [])
        self.assertEqual(data["media_library"]["enabled"], False)
        self.assertEqual(data["media_library"]["folders"], False)
        self.assertEqual(data["media_library"]["crop"], False)
        self.assertEqual(data["media_library"]["properties"], None)
        self.assertEqual(data["media_library"]["metadata"], None)
        self.assertEqual(data["media_library"]["models"]["media_model"], None)
        self.assertEqual(data["media_library"]["models"]["folder_model"], None)
        self.assertEqual(data["dashboard"], {"widgets": []})
        self.assertEqual(data["multitenancy"]["enabled"], False)

    def test_discover_reports_model_groups(self):
        """A model group carries its label, icon, models and collapsed state."""
        from content_studio.admin import ModelGroup
        from content_studio.settings import cs_settings

        admin_site = cs_settings.ADMIN_SITE
        models = list(admin_site._registry.keys())[:1]
        original = getattr(admin_site, "model_groups", None)
        admin_site.model_groups = [
            ModelGroup(name="content", models=models),
            ModelGroup(
                name="archive",
                label="Archive",
                icon="ph-bold ph-archive",
                collapsed=True,
            ),
        ]
        try:
            response = self.client.get("/api/discover")
        finally:
            admin_site.model_groups = original

        self.assertEqual(response.status_code, 200)

        groups = response.json()["model_groups"]
        self.assertEqual([group["name"] for group in groups], ["content", "archive"])
        self.assertEqual(groups[0]["label"], "Content")
        self.assertEqual(groups[0]["collapsed"], False)
        self.assertEqual(groups[0]["models"], [m._meta.label_lower for m in models])
        self.assertEqual(groups[1]["icon"], "ph-bold ph-archive")
        self.assertEqual(groups[1]["collapsed"], True)

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

    def test_discover_announces_crop_metadata_and_properties(self):
        """Cropping is announced when the admin site defines a
        crop_image method; metadata and properties as their attribute
        names, when the media model has them."""
        from content_studio.admin import admin_site

        admin_site.crop_image = lambda obj, crop_info: None

        try:
            with override_settings(
                CONTENT_STUDIO={
                    "MEDIA_LIBRARY_MODEL": "content_studio.media_library.models.Media"
                }
            ):
                response = self.client.get("/api/discover")
        finally:
            del admin_site.crop_image

        media_library = response.json()["media_library"]
        self.assertEqual(media_library["crop"], True)
        self.assertEqual(media_library["metadata"], "metadata")
        self.assertEqual(media_library["properties"], "properties")

    def test_discover_lists_registered_models(self):
        """Discover includes the registered studios. Only the user model
        is there out of the box; Group no longer rides in through the
        Django admin's global registry."""
        response = self.client.get("/api/discover")

        self.assertEqual(response.status_code, 200)

        models = {model["label"] for model in response.json()["models"]}
        self.assertIn("auth.user", models)
        self.assertIn("testapp.article", models)
        self.assertNotIn("auth.group", models)
