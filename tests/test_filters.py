"""
Tests for the LookupFilter backend.
"""

import pytest
from django.contrib.auth import models as auth_models
from django.http import QueryDict
from rest_framework.exceptions import ParseError
from rest_framework.test import APIRequestFactory

from content_studio.filters import LookupFilter


class StubView:
    action = "list"

    def __init__(self, model):
        self.queryset = model.objects.none()


def filter_via_action(model, query_string):
    from rest_framework.parsers import JSONParser
    from rest_framework.request import Request

    request = Request(
        APIRequestFactory().get(f"/?{query_string}"), parsers=[JSONParser()]
    )
    view = StubView(model)
    return LookupFilter().filter_queryset(request, model.objects.all(), view)


def test_exclude_filter_strips_the_symbol():
    lf = LookupFilter()
    filter_kwargs, exclude_kwargs = lf.get_filter_kwargs(
        auth_models.User, QueryDict("~username=admin")
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
        auth_models.User, QueryDict("username=Admin")
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
