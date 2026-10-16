"""
Tests for the public info endpoint.
"""

from django.test import TestCase


class InfoEndpointTests(TestCase):
    def test_info_includes_format_and_widget_names(self):
        """Info serializes every format and widget, including string keys.

        The default mappings carry a string key ("AutoSlugField") next to
        field classes; both must serialize without a 500.
        """
        response = self.client.get("/api/info")

        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("version", data)
        self.assertIn("CharField", data["formats"])
        self.assertIn("AutoSlugField", data["formats"])
        self.assertIn("AutoSlugField", data["widgets"])
