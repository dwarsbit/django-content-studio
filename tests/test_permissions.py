"""
Tests for the model studio permission class: model-level and
object-level checks delegated to the registered model studio.
"""

from unittest import mock

import pytest
from django.contrib.auth import models as auth_models
from django.test import RequestFactory
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser
from rest_framework.request import Request

from content_studio.admin import ModelStudio, admin_site
from content_studio.permissions import ModelStudioPermissions
from content_studio.viewsets import BaseModelViewSet
from tests.test_e2e_crud import AuthenticatedTestCase
from tests.testapp.admin import ReviewInline
from tests.testapp.models import Article, Review


class RecordingStudio(ModelStudio):
    """Stands in for the registered studio; records the permission calls."""

    def __init__(self, model, admin_site, allowed_objects=None):
        super().__init__(model, admin_site)
        self.allowed_objects = allowed_objects or set()
        self.calls = []

    def has_add_permission(self, request, obj=None):
        self.calls.append(("add", None))
        return True

    def has_view_permission(self, request, obj=None):
        self.calls.append(("view", obj))
        if obj is None:
            return True
        return obj.pk in self.allowed_objects

    def has_change_permission(self, request, obj=None):
        self.calls.append(("change", obj))
        if obj is None:
            return True
        return obj.pk in self.allowed_objects

    def has_delete_permission(self, request, obj=None):
        self.calls.append(("delete", obj))
        if obj is None:
            return True
        return obj.pk in self.allowed_objects


def make_view_and_request(studio_model, method="GET"):
    class View:
        _admin_model = studio_model

    request = Request(RequestFactory().generic(method, "/"), parsers=[JSONParser()])
    return View(), request


def test_model_level_checks_delegate_to_the_admin():
    studio_model = RecordingStudio(auth_models.User, admin_site)
    permission = ModelStudioPermissions()

    for method, expected in [
        ("GET", "view"),
        ("POST", "add"),
        ("PUT", "change"),
        ("PATCH", "change"),
        ("DELETE", "delete"),
    ]:
        studio_model.calls = []
        view, request = make_view_and_request(studio_model, method)
        assert permission.has_permission(request, view) is True
        assert studio_model.calls[0][0] == expected


def test_object_level_checks_delegate_to_the_admin():
    studio_model = RecordingStudio(auth_models.User, admin_site, allowed_objects={1})
    permission = ModelStudioPermissions()
    allowed = auth_models.User(pk=1)
    denied = auth_models.User(pk=2)

    view, request = make_view_and_request(studio_model, "GET")
    assert permission.has_object_permission(request, view, allowed) is True
    assert permission.has_object_permission(request, view, denied) is False

    view, request = make_view_and_request(studio_model, "DELETE")
    assert permission.has_object_permission(request, view, denied) is False


def test_missing_admin_model_denies():
    permission = ModelStudioPermissions()

    view, request = make_view_and_request(None)

    assert permission.has_permission(request, view) is False


@pytest.mark.django_db
def test_get_object_enforces_object_permissions():
    """The viewset rejects objects the studio denies access to."""
    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )
    visible = auth_models.User.objects.create_user(username="visible", password="x")
    hidden = auth_models.User.objects.create_user(username="hidden", password="x")

    studio_model = RecordingStudio(
        auth_models.User, admin_site, allowed_objects={visible.pk}
    )

    class ViewSet(BaseModelViewSet):
        _admin_model = studio_model
        queryset = auth_models.User.objects.all()

    viewset = ViewSet()
    viewset.request = Request(RequestFactory().get("/"), parsers=[JSONParser()])
    viewset.request.user = user
    viewset.action = "retrieve"

    viewset.kwargs = {"id": visible.pk}
    assert viewset.get_object() == visible

    viewset.kwargs = {"id": hidden.pk}
    with pytest.raises(PermissionDenied):
        viewset.get_object()


ARTICLE_URL = "/api/content/testapp.article"
REVIEW_URL = "/api/inlines/testapp.article/testapp.review"


class ObjectPermissionsPayloadTests(AuthenticatedTestCase):
    """
    The detail payload carries the object's own change and delete
    permissions, so the edit page opens read-only and hides Delete for
    an object the studio refuses (issue #112).
    """

    def setUp(self):
        self.client = self.client_for(self.create_user(superuser=True))

    def test_detail_reports_the_objects_permissions(self):
        mine = Article.objects.create(title="Mine")
        theirs = Article.objects.create(title="Theirs")
        studio = admin_site._registry[Article]

        def has_change_permission(request, obj=None):
            return obj is None or obj.pk == mine.pk

        def has_delete_permission(request, obj=None):
            return False

        with (
            mock.patch.object(studio, "has_change_permission", has_change_permission),
            mock.patch.object(studio, "has_delete_permission", has_delete_permission),
        ):
            own = self.client.get(f"{ARTICLE_URL}/{mine.pk}").json()
            other = self.client.get(f"{ARTICLE_URL}/{theirs.pk}").json()

        assert own["__permissions__"] == {"change": True, "delete": False}
        assert other["__permissions__"] == {"change": False, "delete": False}

    def test_saved_object_reports_its_permissions(self):
        article = Article.objects.create(title="Saved")

        response = self.client.patch(
            f"{ARTICLE_URL}/{article.pk}", {"title": "Changed"}, format="json"
        )
        created = self.client.post(ARTICLE_URL, {"title": "New"}, format="json")

        assert response.json()["__permissions__"] == {"change": True, "delete": True}
        assert created.json()["__permissions__"] == {"change": True, "delete": True}

    def test_permissions_are_not_written(self):
        article = Article.objects.create(title="Kept")

        response = self.client.patch(
            f"{ARTICLE_URL}/{article.pk}",
            {"title": "Changed", "__permissions__": {"change": False}},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["__permissions__"]["change"] is True

    def test_model_level_permissions_apply_to_the_object(self):
        article = Article.objects.create(title="Viewed")
        viewer = self.create_user("view_article", username="viewer")

        detail = self.client_for(viewer).get(f"{ARTICLE_URL}/{article.pk}").json()

        assert detail["__permissions__"] == {"change": False, "delete": False}

    def test_list_rows_carry_no_permissions(self):
        Article.objects.create(title="Row")

        row = self.client.get(ARTICLE_URL).json()["results"][0]

        assert "__permissions__" not in row

    def test_inline_row_reports_the_inline_studios_permissions(self):
        article = Article.objects.create(title="Parent")
        review = Review.objects.create(article=article, text="Good", stars=4)

        with mock.patch.object(
            ReviewInline,
            "has_change_permission",
            lambda self, request, obj=None: obj is None,
        ):
            detail = self.client.get(f"{REVIEW_URL}/{review.pk}").json()

        assert detail["__permissions__"] == {"change": False, "delete": True}
