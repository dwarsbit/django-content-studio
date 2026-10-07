"""
Tests for singleton model admin semantics.

The admin's is_singleton attribute is canonical; a model-level marker
(e.g. Blueprint's SingletonModel.is_singleton property) is honored as a
fallback, but concrete fields named is_singleton are ignored.
"""

import pytest
from django.contrib.auth import models as auth_models
from django.db import models
from django.test import RequestFactory

from content_studio.admin import ModelAdmin, admin_site, get_is_singleton


class MarkerModel(models.Model):
    is_singleton = True

    class Meta:
        app_label = "content_studio"


class FieldModel(models.Model):
    is_singleton = models.BooleanField(default=False)

    class Meta:
        app_label = "content_studio"


def make_request(user):
    request = RequestFactory().get("/")
    request.user = user
    return request


def test_admin_attribute_is_canonical():
    model_admin = ModelAdmin(auth_models.User, admin_site)
    model_admin.is_singleton = True

    assert get_is_singleton(model_admin) is True


def test_model_marker_is_a_fallback():
    model_admin = ModelAdmin(MarkerModel, admin_site)
    model_admin.is_singleton = False

    assert get_is_singleton(model_admin) is True


def test_no_singleton_state():
    model_admin = ModelAdmin(auth_models.User, admin_site)

    assert get_is_singleton(model_admin) is False


def test_is_singleton_field_is_ignored():
    """A concrete field named is_singleton is not a singleton marker."""
    model_admin = ModelAdmin(FieldModel, admin_site)

    assert get_is_singleton(model_admin) is False


@pytest.mark.django_db
def test_singleton_add_permission_false_when_object_exists():
    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )
    model_admin = ModelAdmin(auth_models.User, admin_site)
    model_admin.is_singleton = True

    assert model_admin.has_add_permission(make_request(user)) is False


@pytest.mark.django_db
def test_singleton_add_permission_true_on_empty_table():
    """The empty singleton table no longer raises DoesNotExist."""
    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )
    model_admin = ModelAdmin(MarkerModel, admin_site)

    assert model_admin.has_add_permission(make_request(user)) is True


@pytest.mark.django_db
def test_singleton_delete_permission_is_false():
    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )
    model_admin = ModelAdmin(auth_models.User, admin_site)
    model_admin.is_singleton = True

    assert model_admin.has_delete_permission(make_request(user)) is False


@pytest.mark.django_db
def test_serializer_reports_effective_singleton_state():
    from rest_framework.request import Request

    from content_studio.admin import AdminSerializer

    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )
    request = Request(RequestFactory().get("/"))
    request.user = user

    model_admin = ModelAdmin(auth_models.User, admin_site)
    model_admin.is_singleton = True
    data = AdminSerializer(model_admin).serialize(request)

    assert data["is_singleton"] is True


def test_router_maps_singleton_patch_to_partial_update():
    from content_studio.router import ExtendedRouter

    class SingletonViewSet:
        is_singleton = True

    class NormalViewSet:
        is_singleton = False

    router = ExtendedRouter()

    singleton_map = router.get_method_map(SingletonViewSet, {"get": "list"})
    normal_map = router.get_method_map(NormalViewSet, {"get": "list"})

    assert singleton_map["patch"] == "partial_update"
    assert "patch" not in normal_map
