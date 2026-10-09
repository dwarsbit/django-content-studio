"""
Tests for the relations endpoint (viewsets.get_related_objects).
"""

import pytest
from django.contrib.auth import models as auth_models
from django.db import models
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from content_studio.viewsets import BaseModelViewSet


class NoCharModel(models.Model):
    """A model without CharFields, for the fallback search path."""

    num = models.IntegerField()

    class Meta:
        app_label = "content_studio"


class ParentModel(models.Model):
    fk = models.ForeignKey(NoCharModel, on_delete=models.CASCADE)

    class Meta:
        app_label = "content_studio"


def make_viewset(user, parent_model, search="", admin_model=None):
    viewset = BaseModelViewSet()
    viewset.queryset = parent_model.objects.none()
    viewset._admin_model = admin_model

    request = Request(
        APIRequestFactory().post(
            "/api/relations/groups", {"search": search}, format="json"
        ),
        parsers=[JSONParser()],
    )
    request.user = user

    return viewset, request


@pytest.mark.django_db
def test_superuser_can_retrieve_related_objects():
    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )
    auth_models.Group.objects.create(name="editors")
    auth_models.Group.objects.create(name="writers")

    viewset, request = make_viewset(user, auth_models.User, search="edit")

    response = viewset.get_related_objects(request, "groups")

    results = response.data
    assert [item["__str__"] for item in results] == ["editors"]


@pytest.mark.django_db
def test_view_permission_required_on_related_model():
    """A user without view permission on the related model gets a 403."""
    user = auth_models.User.objects.create_user(
        username="staff", email="s@example.com", password="x"
    )

    viewset, request = make_viewset(user, auth_models.User, search="")

    with pytest.raises(PermissionDenied):
        viewset.get_related_objects(request, "groups")


@pytest.mark.django_db
def test_unknown_related_field_raises_validation_error():
    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )

    viewset, request = make_viewset(user, auth_models.User)

    from rest_framework.exceptions import ValidationError

    with pytest.raises(ValidationError):
        viewset.get_related_objects(request, "nonexistent_field")


@pytest.mark.django_db
def test_search_without_char_fields_returns_empty():
    """Related models without CharFields no longer crash on search."""
    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )

    viewset, request = make_viewset(user, ParentModel, search="anything")

    response = viewset.get_related_objects(request, "fk")

    assert response.data == []


@pytest.mark.django_db
def test_custom_filter_method_is_used():
    class CustomAdmin:
        def get_related_groups(self, search, form_data, related_model, request):
            return related_model.objects.none()

    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )
    auth_models.Group.objects.create(name="editors")

    viewset, request = make_viewset(
        user, auth_models.User, search="edit", admin_model=CustomAdmin()
    )

    response = viewset.get_related_objects(request, "groups")

    assert response.data == []


@pytest.mark.django_db
def test_relation_display_defaults_to_str():
    """Without a customization, items stay the plain {id, __str__} shape."""
    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )
    auth_models.Group.objects.create(name="editors")

    viewset, request = make_viewset(user, auth_models.User, search="edit")

    response = viewset.get_related_objects(request, "groups")

    assert response.data == [
        {"id": str(auth_models.Group.objects.get().pk), "__str__": "editors"}
    ]


@pytest.mark.django_db
def test_relation_display_is_customizable():
    """A related model admin can customize how its options display."""
    from django.contrib import admin as django_admin

    from content_studio.admin import ModelAdmin, RelationDisplay
    from tests.testapp.models import Category

    class CategoryAdmin(ModelAdmin):
        def get_relation_display(self, obj, request):
            return RelationDisplay(
                title=obj.name.upper(),
                description="customized",
                icon="ph-bold ph-tag",
                initials="Ge",
                avatar="https://example.com/general.png",
            )

    original_admin = django_admin.site._registry.pop(Category)
    django_admin.site.register(Category, CategoryAdmin)
    try:
        user = auth_models.User.objects.create_superuser(
            username="admin", email="a@example.com", password="x"
        )
        Category.objects.create(name="General")

        from tests.testapp.models import Article

        article_admin = django_admin.site._registry.get(Article)
        viewset, request = make_viewset(
            user, Article, search="", admin_model=article_admin
        )

        response = viewset.get_related_objects(request, "categories")

        item = response.data[0]
        assert item["__str__"] == "GENERAL"
        assert item["description"] == "customized"
        assert item["icon"] == "ph-bold ph-tag"
        assert item["initials"] == "Ge"
        assert item["avatar"] == "https://example.com/general.png"
    finally:
        django_admin.site.unregister(Category)
        django_admin.site._registry[Category] = original_admin
