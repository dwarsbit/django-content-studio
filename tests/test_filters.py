"""
Tests for the LookupFilter backend.

Filtering is restricted to the fields the model admin declares in
list_filter, mirroring the Django admin.
"""

import pytest
from django.contrib.auth import models as auth_models
from django.http import QueryDict
from rest_framework.exceptions import ParseError
from rest_framework.test import APIRequestFactory

from content_studio.filters import LookupFilter


class StubAdmin:
    def __init__(self, list_filter=("username", "id", "is_active")):
        self.list_filter = list(list_filter)


class StubView:
    action = "list"

    def __init__(self, model, list_filter=("username", "id", "is_active")):
        self.queryset = model.objects.none()
        self._admin_model = StubAdmin(list_filter)


def filter_via_action(model, query_string, list_filter=("username", "id", "is_active")):
    from rest_framework.parsers import JSONParser
    from rest_framework.request import Request

    request = Request(
        APIRequestFactory().get(f"/?{query_string}"), parsers=[JSONParser()]
    )
    view = StubView(model, list_filter)
    return LookupFilter().filter_queryset(request, model.objects.all(), view)


def test_exclude_filter_strips_the_symbol():
    lf = LookupFilter()
    filter_kwargs, exclude_kwargs = lf.get_filter_kwargs(
        auth_models.User,
        QueryDict("~username=admin"),
        allowed_fields=["username"],
    )
    assert filter_kwargs == {}
    assert exclude_kwargs == {"username": "admin"}


@pytest.mark.django_db
def test_exclude_filter_end_to_end():
    auth_models.User.objects.create_user(username="admin", password="x")
    staff = auth_models.User.objects.create_user(username="staff", password="x")

    result = filter_via_action(auth_models.User, "~username=admin")

    assert set(result.values_list("username", flat=True)) == {"staff"}


def test_filter_values_keep_their_case():
    lf = LookupFilter()
    filter_kwargs, _ = lf.get_filter_kwargs(
        auth_models.User,
        QueryDict("username=Admin"),
        allowed_fields=["username"],
    )
    assert filter_kwargs["username"] == "Admin"


def test_booleans_match_case_insensitively():
    lf = LookupFilter()
    field = auth_models.User._meta.get_field("is_active")

    for raw in ("true", "True", "1", "on"):
        assert lf.cast_field_value(raw, field) is True
    for raw in ("false", "False", "0", "off"):
        assert lf.cast_field_value(raw, field) is False


def test_nulls_match_case_insensitively():
    from django.db import models

    lf = LookupFilter()
    field = models.NullBooleanField()

    for raw in ("null", "NULL", "none", "empty"):
        assert lf.cast_field_value(raw, field) is None


def test_integers_are_cast():
    lf = LookupFilter()
    field = auth_models.User._meta.get_field("id")

    assert lf.cast_field_value("42", field) == 42


@pytest.mark.django_db
def test_comma_separated_multi_values():
    auth_models.User.objects.create_user(username="admin", password="x")
    auth_models.User.objects.create_user(username="staff", password="x")
    auth_models.User.objects.create_user(username="editor", password="x")

    result = filter_via_action(auth_models.User, "username=admin,editor")

    assert set(result.values_list("username", flat=True)) == {"admin", "editor"}


@pytest.mark.django_db
def test_repeated_multi_values():
    auth_models.User.objects.create_user(username="admin", password="x")
    auth_models.User.objects.create_user(username="staff", password="x")
    auth_models.User.objects.create_user(username="editor", password="x")

    result = filter_via_action(auth_models.User, "username=admin&username=staff")

    assert set(result.values_list("username", flat=True)) == {"admin", "staff"}


def test_unknown_field_returns_parse_error_with_reason():
    with pytest.raises(ParseError) as exc_info:
        filter_via_action(auth_models.User, "~nonexistent_field=x")

    assert "nonexistent_field" in str(exc_info.value)


def test_invalid_value_returns_parse_error_with_reason():
    with pytest.raises(ParseError) as exc_info:
        filter_via_action(auth_models.User, "id=not-a-number")

    assert "Invalid filter parameters" in str(exc_info.value)


def test_filtering_is_restricted_to_list_filter():
    """Fields not in list_filter are rejected, even valid model fields."""
    with pytest.raises(ParseError) as exc_info:
        filter_via_action(auth_models.User, "email=x@example.com")

    assert "email" in str(exc_info.value)
    assert "list_filter" in str(exc_info.value)


def test_empty_list_filter_disallows_all_filtering():
    with pytest.raises(ParseError):
        filter_via_action(
            auth_models.User,
            "username=admin",
            list_filter=(),
        )


def test_list_filter_classes_and_tuples_are_ignored():
    """Only string list_filter entries are filterable fields."""
    lf = LookupFilter()
    view = StubView(auth_models.User, list_filter=[("username", object), 5, "id"])

    assert lf.get_allowed_fields(view) == ["id"]


def test_relation_traversal_is_rejected():
    """Declared fields allow lookups, not traversals into related fields."""
    with pytest.raises(ParseError) as exc_info:
        filter_via_action(
            auth_models.User,
            "groups__name=editors",
            list_filter=("groups",),
        )

    assert "traverses" in str(exc_info.value)


@pytest.mark.django_db
def test_declared_field_lookups_are_allowed():
    """Lookups on the declared field itself (like isnull) still work."""
    auth_models.User.objects.create_user(username="admin", password="x")

    result = filter_via_action(
        auth_models.User,
        "username__isnull=true",
        list_filter=("username",),
    )

    assert set(result.values_list("username", flat=True)) == set()


def test_non_string_list_filter_is_safe():
    """A model admin without list_filter (e.g. inlines) allows no filtering."""
    with pytest.raises(ParseError):
        filter_via_action(auth_models.User, "username=admin", list_filter=())


@pytest.mark.django_db
def test_datetime_range_bounds():
    """The date range filter bounds a datetime to start/end of day."""
    from datetime import datetime

    from django.utils import timezone

    inside = auth_models.User.objects.create_user(username="in", password="x")
    auth_models.User.objects.create_user(username="out", password="x")
    inside.date_joined = timezone.make_aware(datetime(2026, 1, 5, 12, 30))
    inside.save()

    result = filter_via_action(
        auth_models.User,
        "date_joined__gte=2026-01-05T00:00&date_joined__lte=2026-01-05T23:59",
        list_filter=("date_joined",),
    )

    assert set(result.values_list("username", flat=True)) == {"in"}


@pytest.mark.django_db
def test_number_range_bounds():
    """The number filter sends __gte/__lte bounds."""
    from tests.testapp.models import Article

    Article.objects.create(title="In range", views=5)
    Article.objects.create(title="Out of range", views=20)

    result = filter_via_action(
        Article,
        "views__gte=1&views__lte=10",
        list_filter=("views",),
    )

    assert set(result.values_list("title", flat=True)) == {"In range"}


@pytest.mark.django_db
def test_foreign_key_filter_matches_by_pk():
    """The foreign key filter sends the related object's pk."""
    from tests.testapp.models import Article

    author = auth_models.User.objects.create_user(username="author", password="x")
    Article.objects.create(title="By author", author=author)
    Article.objects.create(title="Anonymous")

    result = filter_via_action(
        Article,
        f"author={author.pk}",
        list_filter=("author",),
    )

    assert set(result.values_list("title", flat=True)) == {"By author"}


@pytest.mark.django_db
def test_many_to_many_filter_matches_any():
    """The many to many filter sends one pk (exact) or a comma-joined
    list (any of)."""
    from tests.testapp.models import Article, Category

    news = Category.objects.create(name="News")
    sports = Category.objects.create(name="Sports")
    in_news = Article.objects.create(title="In news")
    in_news.categories.add(news)
    in_both = Article.objects.create(title="In both")
    in_both.categories.add(news, sports)
    uncategorized = Article.objects.create(title="Uncategorized")

    result = filter_via_action(
        Article, f"categories={news.pk}", list_filter=("categories",)
    )
    assert set(result.values_list("title", flat=True)) == {"In news", "In both"}

    result = filter_via_action(
        Article,
        f"categories={news.pk},{sports.pk}",
        list_filter=("categories",),
    )
    assert set(result.values_list("title", flat=True)) == {"In news", "In both"}
