"""
Tests for the Content Studio system checks: they surface through
Django's check framework with their own error IDs.
"""

from contextlib import contextmanager

import pytest
from django.core import checks as django_checks
from django.core.checks.registry import registry

from content_studio.admin import ModelStudio, admin_site
from content_studio.checks import check_content_studio
from content_studio.form import Component, FieldLayout, FormSet
from tests.testapp.models import Article


def test_check_is_registered_with_django():
    assert check_content_studio in registry.registered_checks


def test_clean_project_produces_no_messages():
    assert check_content_studio() == []


def test_misconfigured_list_display_surfaces_as_system_error():
    class OldStyle(ModelStudio):
        list_display = ["title"]  # type: ignore[assignment]

    original = admin_site._registry.pop(Article)
    admin_site._registry[Article] = OldStyle(Article, admin_site)

    try:
        messages = check_content_studio()
    finally:
        del admin_site._registry[Article]
        admin_site._registry[Article] = original

    error = next(m for m in messages if m.id == "content_studio.E001")

    assert "table_display" in str(error)
    assert "testapp.article" in error.obj


def test_unknown_list_view_surfaces_as_system_error():
    class UnknownView(ModelStudio):
        list_views = ["table", "cards"]

    original = admin_site._registry.pop(Article)
    admin_site._registry[Article] = UnknownView(Article, admin_site)

    try:
        messages = check_content_studio()
    finally:
        del admin_site._registry[Article]
        admin_site._registry[Article] = original

    assert any(m.id == "content_studio.E002" and "cards" in str(m) for m in messages)


@pytest.mark.django_db
def test_manage_check_style_run_reports_no_errors():
    """The full check framework is clean on the test project."""
    messages = django_checks.run_checks()
    assert not [m for m in messages if m.id.startswith("content_studio.")]


@contextmanager
def swapped_article_studio(studio_class):
    """Temporarily replace the registered Article studio."""
    original = admin_site._registry.pop(Article)
    admin_site._registry[Article] = studio_class(Article, admin_site)

    try:
        yield
    finally:
        admin_site._registry[Article] = original


def test_missing_required_edit_field_surfaces_as_warning():
    """title is Article's only required field; leaving it out of the edit
    form makes saves fail validation."""

    class Incomplete(ModelStudio):
        edit_main = ["body"]

    with swapped_article_studio(Incomplete):
        messages = check_content_studio()

    warning = next(m for m in messages if m.id == "content_studio.W001")

    assert isinstance(warning, django_checks.Warning)
    assert "title" in str(warning)
    assert "testapp.article" in warning.obj


def test_complete_edit_form_produces_no_warning():
    """Fields with a default, nullable fields and blank fields (status,
    author, categories, ...) are not required, so a form with just the
    required field is complete."""

    class Complete(ModelStudio):
        edit_main = [FormSet(fields=[FieldLayout(fields=["title", "body"])])]
        edit_sidebar = ["published_at", "rating", "author"]

    with swapped_article_studio(Complete):
        assert not [m for m in check_content_studio() if m.id == "content_studio.W001"]


def test_excluded_required_field_surfaces_as_warning():
    """Excluding a required field drops it from the fallback form all the
    same, so it is reported."""

    class Excluding(ModelStudio):
        exclude = ["title"]

    with swapped_article_studio(Excluding):
        messages = check_content_studio()

    assert any(m.id == "content_studio.W001" and "title" in str(m) for m in messages)


def test_components_do_not_count_as_edit_fields():
    """Components are custom UI without a model field name; they neither
    crash the check nor silence the missing-field warning."""

    class WithComponent(ModelStudio):
        edit_main = [Component(), "body"]

    with swapped_article_studio(WithComponent):
        messages = check_content_studio()

    assert any(m.id == "content_studio.W001" and "title" in str(m) for m in messages)
