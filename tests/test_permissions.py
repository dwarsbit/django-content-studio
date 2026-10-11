"""
Tests for the model studio permission class: model-level and
object-level checks delegated to the registered model studio.
"""

import pytest
from django.contrib.auth import models as auth_models
from django.test import RequestFactory
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser
from rest_framework.request import Request

from content_studio.admin import ModelStudio, admin_site
from content_studio.permissions import ModelStudioPermissions
from content_studio.viewsets import BaseModelViewSet


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
