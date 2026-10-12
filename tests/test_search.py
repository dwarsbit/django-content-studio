"""
Tests for the global search endpoint: the command palette's object
search. One term searches every registered model with search_fields,
gated by view permission, tenant-scoped and capped per model.
"""

from django.contrib.auth import models as auth_models
from django.test import TestCase
from rest_framework.test import APIClient

from content_studio.admin import admin_site
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.models import Article, Category, Note


class AuthenticatedTestCase(TestCase):
    def create_user(self, *permissions, superuser=False, **kwargs):
        if superuser:
            return auth_models.User.objects.create_superuser(
                username=kwargs.get("username", "admin"), password="x"
            )

        user = auth_models.User.objects.create_user(
            username=kwargs.get("username", "staff"), password="x", is_staff=True
        )
        for permission in permissions:
            user.user_permissions.set(
                list(user.user_permissions.all())
                + [auth_models.Permission.objects.get(codename=permission)]
            )
        return user

    def client_for(self, user):
        client = APIClient()
        token = create_access_token(user)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return client


class SearchTests(AuthenticatedTestCase):
    def setUp(self):
        self.superuser = self.create_user(superuser=True)
        self.client = self.client_for(self.superuser)

    def test_search_groups_results_per_model(self):
        Article.objects.create(title="Needle in an article", body="haystack")
        Category.objects.create(name="Needle category")
        Note.objects.create(title="A note about something else")

        response = self.client.get("/api/search", {"search": "needle"})

        self.assertEqual(response.status_code, 200)
        groups = response.json()
        models = {group["model"] for group in groups}
        # Article and Category have search_fields; Note does not.
        self.assertEqual(models, {"testapp.article", "testapp.category"})
        article_group = next(
            group for group in groups if group["model"] == "testapp.article"
        )
        self.assertEqual(
            article_group["verbose_name"], str(Article._meta.verbose_name_plural)
        )
        self.assertEqual(
            article_group["results"],
            [{"id": Article.objects.get().pk, "title": "Needle in an article"}],
        )

    def test_search_matches_all_search_fields(self):
        article_admin = admin_site._registry[Article]
        article_admin.search_fields = ["title", "body"]
        Article.objects.create(title="Unrelated", body="Haystack body")

        try:
            response = self.client.get("/api/search", {"search": "haystack"})
        finally:
            article_admin.search_fields = ["title"]

        titles = [
            item["title"] for group in response.json() for item in group["results"]
        ]
        self.assertIn("Unrelated", titles)

    def test_search_caps_results_per_model(self):
        for i in range(8):
            Article.objects.create(title=f"Needle number {i}")

        response = self.client.get("/api/search", {"search": "needle"})

        article_group = next(
            group for group in response.json() if group["model"] == "testapp.article"
        )
        self.assertEqual(len(article_group["results"]), 5)

    def test_short_terms_return_nothing(self):
        Article.objects.create(title="Needle")

        for term in ("", " ", "n"):
            response = self.client.get("/api/search", {"search": term})

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), [])

    def test_search_respects_view_permission(self):
        Article.objects.create(title="Needle")
        Category.objects.create(name="Needle category")
        viewer = self.create_user("view_article", "view_category", username="viewer")
        staff = self.create_user(username="staff")

        response = self.client_for(viewer).get("/api/search", {"search": "needle"})
        self.assertEqual(
            {group["model"] for group in response.json()},
            {"testapp.article", "testapp.category"},
        )

        # Without view permission on any searchable model, nothing shows.
        response = self.client_for(staff).get("/api/search", {"search": "needle"})
        self.assertEqual(response.json(), [])

    def test_search_excludes_trashed_objects(self):
        note_admin = admin_site._registry[Note]
        note_admin.search_fields = ["title"]
        note = Note.objects.create(title="Needle note")
        note.removed_at = "2026-01-01T00:00"
        note.save()

        try:
            response = self.client.get("/api/search", {"search": "needle"})

            models = {group["model"] for group in response.json()}
            self.assertNotIn("testapp.note", models)
        finally:
            note_admin.search_fields = []

    def test_search_requires_authentication(self):
        response = APIClient().get("/api/search", {"search": "needle"})

        self.assertEqual(response.status_code, 401)
