"""
Tests for the unique check: while an editor types a value in a field
with unique=True, the edit page asks whether another object already
uses it.

The check only accepts single unique fields, requires view (or change)
permission, is tenant-scoped like the list, counts trashed objects
(they still occupy the value) and leaves out the object being edited.
The conflicting object is only described to users who may view it.
"""

from unittest import mock

from django.contrib.auth import models as auth_models
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from content_studio.admin import admin_site
from content_studio.serializers import ModelSerializer
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.models import Category, Page

URL = "/api/content/testapp.page/unique-check"


class UniqueCheckTests(TestCase):
    def create_user(self, *permissions, username="staff"):
        user = auth_models.User.objects.create_user(
            username=username, password="x", is_staff=True
        )
        user.user_permissions.set(
            auth_models.Permission.objects.filter(codename__in=permissions)
        )
        return user

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
        return client

    def setUp(self):
        self.superuser = auth_models.User.objects.create_superuser(
            username="admin", password="x"
        )
        self.client = self.client_for(self.superuser)
        self.page = Page.objects.create(title="Hello World", slug="hello-world")

    def check(self, client=None, **params):
        return (client or self.client).get(URL, {"field": "slug", **params})

    def test_reports_the_conflicting_object(self):
        response = self.check(value="hello-world")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"exists": True, "id": self.page.pk, "__str__": "Hello World"},
        )

    def test_free_value(self):
        response = self.check(value="another-page")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"exists": False})

    def test_empty_value_conflicts_with_nothing(self):
        Page.objects.create(title="Empty", slug="")

        response = self.check(value="")

        self.assertEqual(response.json(), {"exists": False})

    def test_excludes_the_object_being_edited(self):
        response = self.check(value="hello-world", exclude=self.page.pk)

        self.assertEqual(response.json(), {"exists": False})

    def test_invalid_exclude_is_ignored(self):
        response = self.check(value="hello-world", exclude="not-a-number")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["exists"])

    def test_trashed_objects_count_as_conflicts(self):
        self.page.removed_at = timezone.now()
        self.page.save()

        response = self.check(value="hello-world")

        self.assertEqual(
            response.json(),
            {
                "exists": True,
                "id": self.page.pk,
                "__str__": "Hello World",
                "trashed": True,
            },
        )

    def test_rejects_fields_without_unique(self):
        response = self.client.get(URL, {"field": "title", "value": "Hello World"})

        self.assertEqual(response.status_code, 400)

    def test_rejects_the_primary_key(self):
        response = self.client.get(URL, {"field": "id", "value": self.page.pk})

        self.assertEqual(response.status_code, 400)

    def test_rejects_unknown_fields(self):
        response = self.client.get(URL, {"field": "nope", "value": "x"})

        self.assertEqual(response.status_code, 400)

    def test_requires_view_or_change_permission(self):
        no_perms = self.client_for(self.create_user())
        self.assertEqual(self.check(no_perms, value="x").status_code, 403)

        add_only = self.client_for(self.create_user("add_page", username="adder"))
        self.assertEqual(self.check(add_only, value="x").status_code, 403)

        for codename in ("view_page", "change_page"):
            client = self.client_for(self.create_user(codename, username=codename))
            response = self.check(client, value="hello-world")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["__str__"], "Hello World")

    def test_hides_objects_the_user_may_not_view(self):
        studio = admin_site._registry[Page]
        viewer = self.client_for(self.create_user("view_page"))

        # Model-level view permission, but not on this object.
        with mock.patch.object(
            studio,
            "has_view_permission",
            lambda request, obj=None: obj is None,
        ):
            response = self.check(viewer, value="hello-world")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"exists": True})

    def test_inline_endpoint(self):
        from tests.testapp.models import Article

        article = Article.objects.create(title="Article")
        response = self.client.get(
            "/api/inlines/testapp.article/testapp.review/unique-check",
            {"field": "text", "value": "x", "article_id": article.pk},
        )

        # Reviews have no unique fields: the inline endpoint exists and
        # applies the same rules.
        self.assertEqual(response.status_code, 400)


@override_settings(
    CONTENT_STUDIO={
        "ADMIN_SITE": "content_studio.admin.admin_site",
        "TENANT_MODEL": "tests.testapp.models.Category",
    }
)
class UniqueCheckTenantTests(TestCase):
    def setUp(self):
        user = auth_models.User.objects.create_superuser(username="admin", password="x")
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}"
        )
        self.a = Category.objects.create(name="a")
        self.b = Category.objects.create(name="b")
        Page.objects.create(title="In b", slug="hello-world", category=self.b)

    def test_scoped_to_the_tenant(self):
        response = self.client.get(
            URL,
            {"field": "slug", "value": "hello-world"},
            HTTP_X_DCS_TENANT=str(self.a.pk),
        )
        self.assertEqual(response.json(), {"exists": False})

        response = self.client.get(
            URL,
            {"field": "slug", "value": "hello-world"},
            HTTP_X_DCS_TENANT=str(self.b.pk),
        )
        self.assertTrue(response.json()["exists"])

    def test_without_tenant_fails_closed(self):
        response = self.client.get(URL, {"field": "slug", "value": "hello-world"})

        self.assertEqual(response.json(), {"exists": False})

    def test_unauthorized_tenant_is_rejected(self):
        with mock.patch.object(
            admin_site,
            "get_tenants",
            lambda tenant_model, **kwargs: tenant_model.objects.filter(pk=self.a.pk),
        ):
            response = self.client.get(
                URL,
                {"field": "slug", "value": "hello-world"},
                HTTP_X_DCS_TENANT=str(self.b.pk),
            )

        self.assertEqual(response.status_code, 403)


def test_schema_marks_unique_fields():
    fields = ModelSerializer(Page).get_fields()

    assert fields["slug"]["unique"] is True
    assert "unique" not in fields["title"]
    # The primary key is unique too, but read-only and never checked.
    assert "unique" not in fields["id"]
