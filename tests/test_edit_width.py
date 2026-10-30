"""
Tests for edit_width: the width of a studio's edit page and of an
inline's dialogs, serialized for the editor and checked by E024.
"""

from unittest import mock

from django.contrib.auth import models as auth_models
from django.core import checks
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from content_studio.admin import AdminSerializer, admin_site
from content_studio.checks import check_content_studio
from tests.testapp.admin import PartInline
from tests.testapp.models import Product


def studio():
    return admin_site._registry[Product]


def part_inline(serialized):
    return next(
        inline
        for inline in serialized["edit"]["inlines"]
        if inline["model"] == "testapp.part"
    )


class EditWidthSerializerTests(TestCase):
    def serialize(self):
        request = APIRequestFactory().get("/")
        request.user = auth_models.User.objects.create_superuser("admin")
        return AdminSerializer(studio()).serialize(request)

    def test_default(self):
        serialized = self.serialize()

        self.assertEqual(serialized["edit"]["width"], "default")
        self.assertEqual(part_inline(serialized)["width"], "default")

    def test_wide_studio(self):
        with mock.patch.object(studio(), "edit_width", "wide"):
            serialized = self.serialize()

        self.assertEqual(serialized["edit"]["width"], "wide")
        self.assertEqual(part_inline(serialized)["width"], "default")

    def test_wide_inline(self):
        with mock.patch.object(PartInline, "edit_width", "wide"):
            serialized = self.serialize()

        self.assertEqual(serialized["edit"]["width"], "default")
        self.assertEqual(part_inline(serialized)["width"], "wide")


class EditWidthCheckTests(TestCase):
    def messages(self):
        return [m for m in check_content_studio() if m.id == "content_studio.E024"]

    def test_valid_configuration_passes(self):
        self.assertEqual(self.messages(), [])

    def test_unknown_width(self):
        with mock.patch.object(studio(), "edit_width", "narrow"):
            messages = self.messages()

        self.assertEqual(len(messages), 1)
        self.assertIsInstance(messages[0], checks.Error)
        self.assertIn("edit_width", messages[0].msg)

    def test_unknown_inline_width(self):
        with mock.patch.object(PartInline, "edit_width", 960):
            messages = self.messages()

        self.assertEqual(len(messages), 1)
        self.assertIn("PartInline", messages[0].msg)
