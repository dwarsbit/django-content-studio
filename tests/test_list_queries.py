"""
List and trash rows fetch the related objects their columns show along
with the rows: the number of queries does not grow with the rows
(issue #44).
"""

from unittest import mock

import pytest
from django.apps import apps
from django.contrib.auth import models as auth_models
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from content_studio.admin import ModelStudio, admin_site
from tests.testapp.models import Article, Category, Product


def list_rows(studio, model, action="list"):
    """The rows the generated viewset for the studio lists, and the
    number of queries listing them took."""
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
    viewset.format_kwarg = None
    serializer_class = viewset.get_serializer_class()

    with CaptureQueriesContext(connection) as queries:
        data = serializer_class(
            viewset.get_queryset(), many=True, context={"request": request}
        ).data

    return data, len(queries)


class RelationColumnsStudio(ModelStudio):
    table_display = ["title", "author", "categories"]


class ListItemRelationStudio(ModelStudio):
    table_display = ["title"]
    list_views = ["table", "list"]
    list_item_display = {"title": "title", "description": "author"}


class TrashStudio(ModelStudio):
    table_display = ["title", "category", "tags"]
    soft_delete = "removed_at"


def create_articles(count):
    user = auth_models.User.objects.get_or_create(username="writer")[0]
    category = Category.objects.get_or_create(name="News")[0]

    for i in range(count):
        article = Article.objects.create(title=f"Article {i}", author=user)
        article.categories.add(category)


@pytest.mark.django_db
def test_relation_columns_cost_a_fixed_number_of_queries():
    create_articles(2)
    _, few = list_rows(RelationColumnsStudio, Article)

    create_articles(5)
    data, many = list_rows(RelationColumnsStudio, Article)

    assert len(data) == 7
    assert few == many == 2
    assert data[0]["author"]["__str__"] == "writer"
    assert data[0]["categories"][0]["__str__"] == "News"


@pytest.mark.django_db
def test_list_item_display_relations_are_joined():
    create_articles(3)

    data, queries = list_rows(ListItemRelationStudio, Article)

    assert queries == 1
    assert data[0]["list_item_display"]["description"] == "writer"


@pytest.mark.django_db
def test_trash_rows_fetch_their_relations():
    category = Category.objects.create(name="Tools")

    for i in range(4):
        product = Product.objects.create(
            title=f"Product {i}",
            slug=f"product-{i}",
            category=category,
            removed_at=timezone.now(),
        )
        product.tags.add(category)

    data, queries = list_rows(TrashStudio, Product, action="trash")

    assert len(data) == 4
    assert queries == 2
    assert data[0]["category"]["__str__"] == "Tools"
