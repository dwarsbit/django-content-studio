"""
Model properties are serialized only when a studio names them: as a
table column, an edit page field or a read-only field (issue #29).
"""

from unittest import mock

import pytest
from django.apps import apps
from django.contrib.auth import models as auth_models
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from content_studio.admin import ModelStudio, admin_site
from content_studio.form import Field, FormSet
from tests.testapp.models import Article


def serialize(studio, action, obj):
    """An object as the generated viewset for the studio serializes it."""
    model = type(obj)

    with mock.patch("content_studio.router.content_studio_router.register") as reg:
        apps.get_app_config("content_studio")._create_view_set(
            model, studio(model, admin_site)
        )

    viewset = reg.call_args.args[1]()
    viewset.action = action
    request = Request(APIRequestFactory().get("/"))
    request.user = auth_models.User.objects.get_or_create(
        username="admin", defaults={"is_superuser": True, "is_staff": True}
    )[0]
    viewset.request = request

    return viewset.get_serializer_class()(obj, context={"request": request}).data


class PlainStudio(ModelStudio):
    table_display = ["id", "title"]


class ColumnStudio(ModelStudio):
    table_display = ["id", "title", "word_count"]


class FormFieldStudio(ModelStudio):
    edit_main = [FormSet(fields=["title", Field("word_count")])]


class ReadonlyStudio(ModelStudio):
    readonly_fields = ["word_count"]


@pytest.mark.django_db
def test_unnamed_property_is_absent_from_rows_and_details():
    article = Article.objects.create(title="Words", body="one two three")

    for action in ("list", "retrieve"):
        data = serialize(PlainStudio, action, article)

        assert "word_count" not in data
        assert "pk" not in data


@pytest.mark.django_db
def test_property_named_in_table_display_is_on_rows():
    article = Article.objects.create(title="Words", body="one two three")

    data = serialize(ColumnStudio, "list", article)

    assert data["word_count"] == 3
    assert "pk" not in data


@pytest.mark.django_db
def test_property_named_in_edit_main_is_on_details():
    article = Article.objects.create(title="Words", body="one two")

    assert serialize(FormFieldStudio, "retrieve", article)["word_count"] == 2


@pytest.mark.django_db
def test_property_named_in_readonly_fields_is_on_details():
    article = Article.objects.create(title="Words", body="one")

    assert serialize(ReadonlyStudio, "retrieve", article)["word_count"] == 1


@pytest.mark.django_db
def test_user_details_leave_out_user_properties():
    user = auth_models.User.objects.create_user(username="someone", password="x")

    data = serialize(ModelStudio, "retrieve", user)

    assert "is_anonymous" not in data
    assert "is_authenticated" not in data
    assert "password" not in data
