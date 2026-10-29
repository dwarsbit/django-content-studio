"""
Tests for the duplicate check on combinations of fields: Meta.unique_together
and UniqueConstraints over several fields.

Like the single-field check, it is tenant-scoped, counts trashed objects
and leaves out the object being edited. A condition is applied to both
sides; functional and deferrable constraints are not offered, and a null
value only clashes when the constraint treats nulls as equal (and the
database supports that).
"""

import json
from unittest import mock

from django.contrib.auth import models as auth_models
from django.db import connection, models
from django.test import TestCase, override_settings
from django.test.utils import isolate_apps
from django.utils import timezone
from rest_framework.test import APIClient

from content_studio.admin import admin_site
from content_studio.serializers import ModelSerializer
from content_studio.token_backends.jwt import create_access_token
from content_studio.uniqueness import get_unique_sets
from tests.testapp.models import Category, Edition

URL = "/api/content/testapp.edition/unique-check"

TOGETHER = "unique_together:slug,language"
TITLE_PER_CATEGORY = "constraint:edition_title_per_category"
PUBLISHED_NUMBER = "constraint:edition_published_number"


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


class UniqueSetCheckTests(TestCase):
    def setUp(self):
        user = auth_models.User.objects.create_superuser(username="admin", password="x")
        self.client = client_for(user)
        self.category = Category.objects.create(name="News")
        self.edition = Edition.objects.create(
            title="Spring",
            slug="spring",
            language="en",
            number=1,
            published=True,
            category=self.category,
        )

    def check(self, set_id, values, **params):
        return self.client.get(
            URL, {"set": set_id, "values": json.dumps(values), **params}
        )

    def test_unique_together(self):
        response = self.check(TOGETHER, {"slug": "spring", "language": "en"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"exists": True, "id": self.edition.pk, "__str__": "Spring"},
        )

        response = self.check(TOGETHER, {"slug": "spring", "language": "nl"})
        self.assertEqual(response.json(), {"exists": False})

    def test_sets_with_an_excluded_field_are_not_checked(self):
        # The form cannot supply an excluded field, and the check would
        # reveal its values.
        studio = admin_site._registry[Edition]

        with mock.patch.object(type(studio), "exclude", ["language"]):
            response = self.check(TOGETHER, {"slug": "spring", "language": "en"})

        self.assertEqual(response.status_code, 400)

    def test_unique_constraint(self):
        response = self.check(
            TITLE_PER_CATEGORY, {"title": "Spring", "category": self.category.pk}
        )
        self.assertTrue(response.json()["exists"])

        other = Category.objects.create(name="Other")
        response = self.check(
            TITLE_PER_CATEGORY, {"title": "Spring", "category": other.pk}
        )
        self.assertEqual(response.json(), {"exists": False})

    def test_excludes_the_object_being_edited(self):
        response = self.check(
            TOGETHER, {"slug": "spring", "language": "en"}, exclude=self.edition.pk
        )

        self.assertEqual(response.json(), {"exists": False})

    def test_values_missing_from_the_form_come_from_the_edited_object(self):
        other = Edition.objects.create(title="Summer", slug="summer", language="en")

        response = self.check(TOGETHER, {"slug": "spring"}, exclude=other.pk)
        self.assertTrue(response.json()["exists"])

        # A new object has no stored values to fall back on.
        response = self.check(TOGETHER, {"slug": "spring"})
        self.assertEqual(response.json(), {"exists": False})

    def test_trashed_objects_count_as_conflicts(self):
        self.edition.removed_at = timezone.now()
        self.edition.save()

        response = self.check(TOGETHER, {"slug": "spring", "language": "en"})

        self.assertEqual(response.json()["trashed"], True)

    def test_conditional_constraint(self):
        values = {"number": 1, "language": "en", "published": True}
        self.assertTrue(self.check(PUBLISHED_NUMBER, values).json()["exists"])

        # An object that does not meet the condition clashes with nothing.
        response = self.check(PUBLISHED_NUMBER, {**values, "published": False})
        self.assertEqual(response.json(), {"exists": False})

        # Nor with objects that do not meet it.
        self.edition.published = False
        self.edition.save()
        response = self.check(PUBLISHED_NUMBER, values)
        self.assertEqual(response.json(), {"exists": False})

    def test_condition_fields_fall_back_on_the_edited_object_and_defaults(self):
        values = {"number": 1, "language": "en"}

        # A new object takes the default: published=False.
        self.assertFalse(self.check(PUBLISHED_NUMBER, values).json()["exists"])

        other = Edition.objects.create(
            title="Summer", slug="summer", number=2, published=True
        )
        response = self.check(PUBLISHED_NUMBER, values, exclude=other.pk)
        self.assertTrue(response.json()["exists"])

    def test_nulls_are_distinct(self):
        Edition.objects.create(title="Draft", slug="draft", number=None, language="nl")

        response = self.check(
            PUBLISHED_NUMBER, {"number": None, "language": "nl", "published": True}
        )

        self.assertEqual(response.json(), {"exists": False})

    def test_empty_values_conflict_with_nothing(self):
        Edition.objects.create(title="Untranslated", slug="untranslated", language="")

        response = self.check(TOGETHER, {"slug": "untranslated", "language": ""})

        self.assertEqual(response.json(), {"exists": False})

    def test_invalid_values_conflict_with_nothing(self):
        response = self.check(
            PUBLISHED_NUMBER, {"number": "abc", "language": "en", "published": True}
        )

        self.assertEqual(response.json(), {"exists": False})

    def test_rejects_unknown_sets_and_malformed_values(self):
        self.assertEqual(self.check("constraint:nope", {}).status_code, 400)
        # The functional constraint is not offered.
        self.assertEqual(
            self.check("constraint:edition_title_lower", {}).status_code, 400
        )

        response = self.client.get(URL, {"set": TOGETHER, "values": "[1]"})
        self.assertEqual(response.status_code, 400)

        response = self.client.get(URL, {"set": TOGETHER, "values": "{"})
        self.assertEqual(response.status_code, 400)

    def test_requires_view_or_change_permission(self):
        user = auth_models.User.objects.create_user(
            username="staff", password="x", is_staff=True
        )
        response = client_for(user).get(URL, {"set": TOGETHER, "values": "{}"})

        self.assertEqual(response.status_code, 403)


@override_settings(
    CONTENT_STUDIO={
        "ADMIN_SITE": "content_studio.admin.admin_site",
        "TENANT_MODEL": "tests.testapp.models.Category",
    }
)
class UniqueSetCheckTenantTests(TestCase):
    def setUp(self):
        user = auth_models.User.objects.create_superuser(username="admin", password="x")
        self.client = client_for(user)
        self.a = Category.objects.create(name="a")
        self.b = Category.objects.create(name="b")
        Edition.objects.create(
            title="Spring", slug="spring", language="en", category=self.b
        )

    def check(self, set_id, values, tenant):
        return self.client.get(
            URL,
            {"set": set_id, "values": json.dumps(values)},
            HTTP_X_DCS_TENANT=str(tenant.pk),
        )

    def test_scoped_to_the_tenant(self):
        values = {"slug": "spring", "language": "en"}

        self.assertFalse(self.check(TOGETHER, values, self.a).json()["exists"])
        self.assertTrue(self.check(TOGETHER, values, self.b).json()["exists"])

    def test_the_tenant_field_is_left_out_of_the_set(self):
        sets = {s.id: s for s in get_unique_sets(Edition)}

        self.assertEqual(sets[TITLE_PER_CATEGORY].fields, ("title",))

        response = self.check(TITLE_PER_CATEGORY, {"title": "Spring"}, self.b)
        self.assertTrue(response.json()["exists"])
        response = self.check(TITLE_PER_CATEGORY, {"title": "Spring"}, self.a)
        self.assertFalse(response.json()["exists"])


class NullsNotDistinctTests(TestCase):
    """nulls_distinct=False, on a database that supports it."""

    def setUp(self):
        user = auth_models.User.objects.create_superuser(username="admin", password="x")
        self.client = client_for(user)
        Edition.objects.create(title="Draft", slug="draft", number=None, language="nl")

    def test_null_values_clash(self):
        constraint = models.UniqueConstraint(
            fields=["number", "language"],
            nulls_distinct=False,
            name="edition_number_language",
        )

        with (
            mock.patch.object(Edition._meta, "constraints", [constraint]),
            mock.patch.object(
                connection.features,
                "supports_nulls_distinct_unique_constraints",
                True,
            ),
        ):
            response = self.client.get(
                URL,
                {
                    "set": "constraint:edition_number_language",
                    "values": json.dumps({"number": "", "language": "nl"}),
                },
            )

        self.assertTrue(response.json()["exists"])

    def test_ignored_without_database_support(self):
        constraint = models.UniqueConstraint(
            fields=["number", "language"], nulls_distinct=False, name="n"
        )

        with mock.patch.object(Edition._meta, "constraints", [constraint]):
            (unique_set,) = get_unique_sets(Edition)[1:]

        self.assertFalse(unique_set.nulls_equal)


@isolate_apps("tests.testapp")
def test_only_reliable_sets_are_offered():
    class Book(models.Model):
        title = models.CharField(max_length=10)
        isbn = models.CharField(max_length=10)
        tags = models.ManyToManyField(Category)

        class Meta:
            app_label = "testapp"
            unique_together = [("title", "isbn"), ("title", "id")]
            constraints = [
                # A single field is unique=True's business.
                models.UniqueConstraint(fields=["isbn"], name="single"),
                models.UniqueConstraint(
                    fields=["title", "isbn"],
                    deferrable=models.Deferrable.DEFERRED,
                    name="deferred",
                ),
                models.UniqueConstraint(
                    models.F("title"), models.F("isbn"), name="expressions"
                ),
                models.UniqueConstraint(
                    fields=["title", "isbn"],
                    condition=models.Q(title__startswith="a")
                    | ~models.Q(isbn=models.F("title")),
                    name="conditional",
                ),
            ]

    sets = get_unique_sets(Book)

    assert [s.id for s in sets] == [
        "unique_together:title,isbn",
        "constraint:conditional",
    ]
    assert sets[1].condition_fields == ("title", "isbn")


def test_schema_lists_the_unique_sets():
    schema = ModelSerializer(Edition).serialize()

    assert schema["unique_sets"] == [
        {"id": TOGETHER, "fields": ["slug", "language"]},
        {"id": TITLE_PER_CATEGORY, "fields": ["title", "category"]},
        {
            "id": PUBLISHED_NUMBER,
            "fields": ["number", "language"],
            "condition_fields": ["published"],
        },
    ]
