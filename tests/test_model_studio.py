"""
Tests for ModelStudio's default behavior: the permission defaults and
the get_fields fallback.
"""

import pytest
from django.contrib.auth import models as auth_models
from django.test import RequestFactory

from content_studio.admin import ModelStudio, admin_site
from tests.testapp.models import Article


def make_request(user):
    request = RequestFactory().get("/")
    request.user = user
    return request


@pytest.mark.django_db
def test_permission_defaults_check_model_permissions():
    """The defaults are equivalent to DjangoModelPermissions: view or
    change to read, add/change/delete for their actions."""
    user = auth_models.User.objects.create_user(username="editor", password="x")

    from django.contrib.auth.models import Permission

    opts = auth_models.User._meta
    codename = f"{opts.app_label}.view_{opts.model_name}"
    view_perm = Permission.objects.get(codename=f"view_{opts.model_name}")
    user.user_permissions.add(view_perm)

    studio = ModelStudio(auth_models.User, admin_site)

    assert studio.has_view_permission(make_request(user)) is True
    assert studio.has_change_permission(make_request(user)) is False
    assert studio.has_add_permission(make_request(user)) is False
    assert studio.has_delete_permission(make_request(user)) is False


@pytest.mark.django_db
def test_view_permission_accepts_change_permission():
    user = auth_models.User.objects.create_user(username="editor2", password="x")

    from django.contrib.auth.models import Permission

    change_perm = Permission.objects.get(codename="change_user")
    user.user_permissions.add(change_perm)

    studio = ModelStudio(auth_models.User, admin_site)

    assert studio.has_view_permission(make_request(user)) is True
    assert studio.has_change_permission(make_request(user)) is True


@pytest.mark.django_db
def test_permission_hooks_receive_the_object():
    """All four hooks take the optional object argument, so overriding
    per object needs no signature gymnastics."""
    allowed = auth_models.User(pk=1)
    denied = auth_models.User(pk=2)

    class ObjectStudio(ModelStudio):
        def has_change_permission(self, request, obj=None):
            return obj is allowed

    studio = ObjectStudio(auth_models.User, admin_site)
    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )
    request = make_request(user)

    assert studio.has_change_permission(request, allowed) is True
    assert studio.has_change_permission(request, denied) is False


def test_get_fields_defaults_to_editable_fields():
    studio = ModelStudio(Article, admin_site)

    fields = studio.get_fields(make_request(None))

    assert "title" in fields
    assert "author" in fields
    # Many-to-many fields are editable and included.
    assert "categories" in fields
    # Auto fields are not.
    assert "id" not in fields


def test_get_fields_respects_exclude():
    class Excluding(ModelStudio):
        exclude = ["views", "rating"]

    fields = Excluding(Article, admin_site).get_fields(make_request(None))

    assert "views" not in fields
    assert "rating" not in fields
    assert "title" in fields
