"""
Tests for the Content Studio system checks: they surface through
Django's check framework with their own error IDs.
"""

import pytest
from django.core.checks.registry import registry

from content_studio.admin import ModelStudio, admin_site
from content_studio.checks import check_content_studio
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
    from django.core import checks as django_checks

    messages = django_checks.run_checks()
    assert not [m for m in messages if m.id.startswith("content_studio.")]
