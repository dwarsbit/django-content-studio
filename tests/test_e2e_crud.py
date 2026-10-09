"""
End-to-end CRUD tests through the generated API, against the test app.

These exercise the full stack: routes, permissions, serializers,
tenant scoping and audit stamps, the way the frontend uses the API.
"""

from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib.auth import models as auth_models
from django.test import TestCase
from rest_framework.test import APIClient

from content_studio.token_backends.jwt import create_access_token
from tests.testapp.models import Article, Category, Review, SiteSettings


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


class ListFlowTests(AuthenticatedTestCase):
    def setUp(self):
        self.superuser = self.create_user(superuser=True)

    def test_list_returns_paginated_envelope(self):
        Article.objects.create(title="one")
        Article.objects.create(title="two")

        client = self.client_for(self.superuser)
        response = client.get("/api/content/testapp.article")

        data = response.json()
        assert response.status_code == 200
        assert set(data.keys()) == {"pagination", "results"}
        assert data["pagination"]["count"] == 2
        assert data["pagination"]["current"] == 1
        assert len(data["results"]) == 2

    def test_list_limits_fields_to_list_display(self):
        Article.objects.create(title="secret-body", body="should not leak")

        client = self.client_for(self.superuser)
        response = client.get("/api/content/testapp.article")

        first = response.json()["results"][0]
        assert "title" in first
        assert "body" not in first
        assert "id" in first
        assert "__str__" in first

    def test_list_model_properties_are_included(self):
        Article.objects.create(title="words", body="one two three")

        client = self.client_for(self.superuser)
        response = client.get("/api/content/testapp.article")

        first = response.json()["results"][0]
        # list_display drives the list fields; the model property is
        # available whenever it is listed.
        assert first["__str__"] == "words"

    def test_search_filters_via_search_fields(self):
        Article.objects.create(title="needle here")
        Article.objects.create(title="haystack")

        client = self.client_for(self.superuser)
        response = client.get("/api/content/testapp.article?search=needle")

        titles = [item["title"] for item in response.json()["results"]]
        assert titles == ["needle here"]

    def test_filtering_via_list_filter(self):
        Article.objects.create(title="draft one")
        Article.objects.create(title="published one", status="published")

        client = self.client_for(self.superuser)
        response = client.get("/api/content/testapp.article?status=published")

        titles = [item["title"] for item in response.json()["results"]]
        assert titles == ["published one"]

    def test_ordering(self):
        Article.objects.create(title="b")
        Article.objects.create(title="a")

        client = self.client_for(self.superuser)
        response = client.get("/api/content/testapp.article?ordering=-title")

        titles = [item["title"] for item in response.json()["results"]]
        assert titles == ["b", "a"]


class CreateUpdateDeleteTests(AuthenticatedTestCase):
    def setUp(self):
        self.superuser = self.create_user(superuser=True)
        self.client = self.client_for(self.superuser)

    def test_create_retrieve_update_partial_and_delete(self):
        response = self.client.post(
            "/api/content/testapp.article",
            {"title": "created", "status": "draft"},
            format="json",
        )
        assert response.status_code == 201, response.content
        pk = response.json()["id"]

        # CREATED_BY_ATTR is stamped on create.
        article = Article.objects.get(pk=pk)
        assert article.created_by == self.superuser
        assert LogEntry.objects.filter(
            action_flag=ADDITION, object_id=str(article.id)
        ).exists()

        # Retrieve serializes all fields plus model properties.
        response = self.client.get(f"/api/content/testapp.article/{pk}")
        data = response.json()
        assert data["title"] == "created"
        assert data["word_count"] == 0

        # Full update stamps the editor and the edit timestamp.
        response = self.client.put(
            f"/api/content/testapp.article/{pk}",
            {"title": "updated", "status": "published", "body": "some words"},
            format="json",
        )
        assert response.status_code == 200, response.content

        article = Article.objects.get(pk=pk)
        assert article.edited_by == self.superuser
        assert article.edited_at is not None
        assert article.body == "some words"
        assert LogEntry.objects.filter(
            action_flag=CHANGE, object_id=str(article.id)
        ).exists()

        # Partial update exists for detail routes.
        response = self.client.patch(
            f"/api/content/testapp.article/{pk}", {"views": 10}, format="json"
        )
        assert response.status_code == 200, response.content
        assert Article.objects.get(pk=pk).views == 10

        # Delete logs and removes.
        response = self.client.delete(f"/api/content/testapp.article/{pk}")
        assert response.status_code == 204
        assert not Article.objects.filter(pk=pk).exists()
        assert LogEntry.objects.filter(action_flag=DELETION, object_id=str(pk)).exists()

    def test_foreign_key_input_accepts_related_item_payloads(self):
        author = auth_models.User.objects.get(username="admin")

        response = self.client.post(
            "/api/content/testapp.article",
            {"title": "with author", "author": {"id": author.id}},
            format="json",
        )

        assert response.status_code == 201, response.content
        assert Article.objects.get(pk=response.json()["id"]).author == author


class PermissionTests(AuthenticatedTestCase):
    def test_model_permissions_are_enforced(self):
        viewer = self.create_user("view_article")
        editor = self.create_user("view_article", "change_article", username="editor")

        article = Article.objects.create(title="guarded")

        # A view-only user can list and retrieve...
        client = self.client_for(viewer)
        assert client.get("/api/content/testapp.article").status_code == 200
        assert (
            client.get(f"/api/content/testapp.article/{article.id}").status_code == 200
        )
        # ...but not create, update or delete.
        assert (
            client.post(
                "/api/content/testapp.article", {"title": "nope"}, format="json"
            ).status_code
            == 403
        )
        assert (
            client.put(
                f"/api/content/testapp.article/{article.id}",
                {"title": "nope"},
                format="json",
            ).status_code
            == 403
        )
        assert (
            client.delete(f"/api/content/testapp.article/{article.id}").status_code
            == 403
        )

        # An editor can update.
        client = self.client_for(editor)
        response = client.patch(
            f"/api/content/testapp.article/{article.id}",
            {"title": "renamed"},
            format="json",
        )
        assert response.status_code == 200
        assert Article.objects.get(pk=article.id).title == "renamed"


class SingletonTests(AuthenticatedTestCase):
    def setUp(self):
        self.superuser = self.create_user(superuser=True)
        self.client = self.client_for(self.superuser)

    def test_singleton_flow(self):
        # The list route doubles as retrieve: empty table is a 404.
        response = self.client.get("/api/content/testapp.sitesettings")
        assert response.status_code == 404

        # Creating the singleton through the list route works.
        response = self.client.post(
            "/api/content/testapp.sitesettings",
            {"site_name": "My site", "tagline": "hello"},
            format="json",
        )
        assert response.status_code == 201, response.content

        # ...and the list route now retrieves it.
        response = self.client.get("/api/content/testapp.sitesettings")
        assert response.status_code == 200
        assert response.json()["site_name"] == "My site"

        # Partial updates work with a partial body.
        response = self.client.patch(
            "/api/content/testapp.sitesettings", {"tagline": "changed"}, format="json"
        )
        assert response.status_code == 200, response.content
        assert SiteSettings.objects.get().tagline == "changed"

        # A second singleton cannot be created.
        response = self.client.post(
            "/api/content/testapp.sitesettings",
            {"site_name": "Other"},
            format="json",
        )
        assert response.status_code == 403
        assert SiteSettings.objects.count() == 1


class InlineTests(AuthenticatedTestCase):
    def make_editor(self, with_article_view=True):
        permissions = ["add_review", "view_review"]
        if with_article_view:
            permissions.append("view_article")
        return self.create_user(
            *permissions, username=f"editor{len(permissions)}{with_article_view}"
        )

    def test_inline_list_filters_by_parent(self):
        """The frontend fetches inlines with ?<fk>_id=<id> (regression)."""
        editor = self.create_user("view_article", "view_review", username="editor")
        article = Article.objects.create(title="one")
        other = Article.objects.create(title="two")
        Review.objects.create(article=article, text="for one")
        Review.objects.create(article=other, text="for two")
        client = self.client_for(editor)

        response = client.get(
            "/api/inlines/testapp.article/testapp.review",
            {"article_id": article.id},
        )

        assert response.status_code == 200, response.content
        # Inline lists serialize id and __str__ by default (list_display).
        strs = [item["__str__"] for item in response.json()["results"]]
        assert strs == ["for one"]

    def test_inline_list_requires_parent_filter(self):
        editor = self.create_user("view_article", "view_review", username="editor")
        client = self.client_for(editor)

        response = client.get("/api/inlines/testapp.article/testapp.review")

        assert response.status_code == 400
        assert "parent" in str(response.json())

    def test_inline_list_rejects_invisible_parent(self):
        """Without view permission on the parent, no inline listing."""
        editor = self.create_user("view_review", username="editor")
        article = Article.objects.create(title="hidden")
        client = self.client_for(editor)

        response = client.get(
            "/api/inlines/testapp.article/testapp.review",
            {"article_id": article.id},
        )

        assert response.status_code == 403

    def test_inline_create_attaches_to_visible_parent(self):
        editor = self.create_user(
            "view_article", "add_review", "view_review", username="editor"
        )
        article = Article.objects.create(title="with review")
        client = self.client_for(editor)

        response = client.post(
            "/api/inlines/testapp.article/testapp.review",
            {"article": {"id": article.id}, "text": "great", "stars": 4},
            format="json",
        )
        assert response.status_code == 201, response.content
        assert Review.objects.filter(article=article, stars=4).exists()

    def test_inline_create_rejects_invisible_parent(self):
        """Inlines cannot be attached to parents the user cannot see."""
        editor = self.create_user("add_review", "view_review", username="editor")
        article = Article.objects.create(title="hidden")
        client = self.client_for(editor)

        response = client.post(
            "/api/inlines/testapp.article/testapp.review",
            {"article": {"id": article.id}, "text": "great"},
            format="json",
        )

        assert response.status_code == 403
        assert not Review.objects.exists()

    def test_inline_create_rejects_unknown_parent(self):
        editor = self.create_user(
            "view_article", "add_review", "view_review", username="editor"
        )
        client = self.client_for(editor)

        response = client.post(
            "/api/inlines/testapp.article/testapp.review",
            {"article": {"id": 99999}, "text": "great"},
            format="json",
        )

        assert response.status_code == 400, response.content


class UserSerializerTests(AuthenticatedTestCase):
    def test_user_model_excludes_password(self):
        superuser = self.create_user(superuser=True)
        client = self.client_for(superuser)

        response = client.get("/api/content/auth.user")
        assert response.status_code == 200

        for item in response.json()["results"]:
            assert "password" not in item

        response = client.get(
            f"/api/content/auth.user/{auth_models.User.objects.get(username='admin').id}"
        )
        assert "password" not in response.json()
