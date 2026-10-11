"""
Tests for the list page's views: the table view's columns (table_display)
and the list view's row anatomy (list_display / get_list_display), plus
the setup validation that keeps the two apart.
"""

import pytest
from django.core.exceptions import ImproperlyConfigured

from content_studio.admin import (
    ListDisplay,
    ModelStudio,
    admin_site,
)
from content_studio.checks import list_config_errors
from tests.test_e2e_crud import AuthenticatedTestCase
from tests.testapp.models import Article


def _validate_with(model_studio):
    """Instantiate a throwaway studio and run the list config checks."""
    return list_config_errors(model_studio(Article, admin_site))


def test_old_style_list_display_is_rejected():
    """The classic admin's list_display no longer configures the table."""

    class OldStyle(ModelStudio):
        list_display = ["title"]  # type: ignore[assignment]

    errors = _validate_with(OldStyle)
    assert len(errors) == 1
    assert errors[0][0] == "content_studio.E001"
    assert "table_display" in errors[0][1]


def test_unknown_list_view_is_rejected():
    class UnknownView(ModelStudio):
        list_views = ["table", "cards"]

    errors = _validate_with(UnknownView)
    assert errors[0][0] == "content_studio.E002"
    assert "cards" in errors[0][1]


def test_declarative_and_override_configs_validate():
    class Fine(ModelStudio):
        list_views = ["table", "list"]
        list_display = {"title": "title", "description": "body"}

    assert _validate_with(Fine) == []


def test_get_list_display_resolves_the_mapping():
    admin = admin_site._registry[Article]
    article = Article(title="Hello", body="Body text")
    article.status = Article.Status.PUBLISHED

    display = admin.get_list_display(article, None)

    assert display.title == "Hello"
    assert display.description == "Body text"
    # Callables (model methods like get_status_display) resolve too.
    assert display.meta == "Published"


def test_get_list_display_falls_back_to_str_without_mapping():
    class Bare(ModelStudio):
        pass

    admin = Bare(Article, admin_site)
    display = admin.get_list_display(Article(title="Fallback"), None)

    assert display.title == "Fallback"
    assert display.description == ""
    assert display.meta == ""


def test_get_list_display_can_be_overridden():
    class Computed(ModelStudio):
        def get_list_display(self, obj, request):
            return ListDisplay(
                title=f"computed {obj.title}", description="fixed", meta="M"
            )

    admin = Computed(Article, admin_site)
    display = admin.get_list_display(Article(title="Hello"), None)

    assert display.title == "computed Hello"
    assert display.description == "fixed"
    assert display.meta == "M"


def test_default_site_config_stays_valid():
    # The registered test app studios pass the list config checks.
    for studio in admin_site._registry.values():
        assert list_config_errors(studio) == []


class ListDisplaySerializationTests(AuthenticatedTestCase):
    def setUp(self):
        self.superuser = self.create_user(superuser=True)

    def test_list_rows_carry_resolved_display(self):
        Article.objects.create(
            title="Hello", body="Body text", status=Article.Status.PUBLISHED
        )

        client = self.client_for(self.superuser)
        response = client.get("/api/content/testapp.article")

        first = response.json()["results"][0]
        assert first["list_display"] == {
            "title": "Hello",
            "description": "Body text",
            "meta": "Published",
        }

    def test_table_fields_still_limited_to_table_display(self):
        Article.objects.create(title="secret", body="should not leak")

        client = self.client_for(self.superuser)
        response = client.get("/api/content/testapp.article")

        first = response.json()["results"][0]
        assert first["title"] == "secret"
        assert "body" not in first

    def test_discover_reports_the_available_views(self):
        client = self.client_for(self.superuser)
        response = client.get("/api/discover")

        article = next(
            model
            for model in response.json()["models"]
            if model["label"] == "testapp.article"
        )

        assert article["admin"]["list"]["views"] == ["table", "list"]
