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

    viewset, request = make_viewset(user, auth_models.User)

    response = viewset.get_related_objects(request, "groups")

    results = response.data
    assert sorted(item["__str__"] for item in results) == ["editors", "writers"]


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
def test_search_uses_the_related_studios_search_fields():
    from tests.testapp.models import Article, Category

    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )
    Category.objects.create(name="General")
    Category.objects.create(name="News")

    viewset, request = make_viewset(user, Article, search="gen")

    response = viewset.get_related_objects(request, "categories")

    assert [item["__str__"] for item in response.data] == ["General"]


@pytest.mark.django_db
def test_search_does_not_fall_back_to_other_fields():
    """
    Without search_fields (like the default user studio), a search term
    matches nothing: the user model's password hash is not searchable.
    """
    from tests.testapp.models import Article

    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )

    for search in [user.password[:20], "pbkdf2", "admin"]:
        viewset, request = make_viewset(user, Article, search=search)

        response = viewset.get_related_objects(request, "author")

        assert response.data == [], search

    viewset, request = make_viewset(user, Article)

    response = viewset.get_related_objects(request, "author")

    assert [item["__str__"] for item in response.data] == ["admin"]


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

    viewset, request = make_viewset(user, auth_models.User)

    response = viewset.get_related_objects(request, "groups")

    assert response.data == [
        {"id": str(auth_models.Group.objects.get().pk), "__str__": "editors"}
    ]


@pytest.mark.django_db
def test_relation_display_is_customizable():
    """A related model studio can customize how its options display."""
    from content_studio.admin import ModelStudio, RelationDisplay, admin_site
    from tests.testapp.models import Category

    class CategoryStudio(ModelStudio):
        def get_relation_display(self, obj, request):
            return RelationDisplay(
                title=obj.name.upper(),
                description="customized",
                icon="ph-bold ph-tag",
                initials="Ge",
                avatar="https://example.com/general.png",
            )

    original_studio = admin_site._registry.pop(Category)
    admin_site.register(Category, CategoryStudio)
    try:
        user = auth_models.User.objects.create_superuser(
            username="admin", email="a@example.com", password="x"
        )
        Category.objects.create(name="General")

        from tests.testapp.models import Article

        article_studio = admin_site._registry.get(Article)
        viewset, request = make_viewset(
            user, Article, search="", admin_model=article_studio
        )

        response = viewset.get_related_objects(request, "categories")

        item = response.data[0]
        assert item["__str__"] == "GENERAL"
        assert item["description"] == "customized"
        assert item["icon"] == "ph-bold ph-tag"
        assert item["initials"] == "Ge"
        assert item["avatar"] == "https://example.com/general.png"
    finally:
        admin_site.unregister(Category)
        admin_site._registry[Category] = original_studio


@pytest.mark.django_db
def test_trashed_objects_are_not_offered():
    """A related studio with soft_delete keeps trashed objects out."""
    from django.utils import timezone

    from content_studio.admin import admin_site
    from tests.testapp.models import Product, ProductSupplier

    user = auth_models.User.objects.create_superuser(
        username="admin", email="a@example.com", password="x"
    )
    Product.objects.create(title="Kept", slug="kept")
    Product.objects.create(title="Trashed", slug="trashed", removed_at=timezone.now())

    viewset, request = make_viewset(user, ProductSupplier)

    response = viewset.get_related_objects(request, "product")

    assert [item["__str__"] for item in response.data] == ["Kept"]

    product_studio = admin_site._registry[Product]
    original_search_fields = product_studio.search_fields
    product_studio.search_fields = ["title"]
    try:
        viewset, request = make_viewset(user, ProductSupplier, search="e")

        response = viewset.get_related_objects(request, "product")

        assert [item["__str__"] for item in response.data] == ["Kept"]
    finally:
        product_studio.search_fields = original_search_fields
