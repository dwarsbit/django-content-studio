"""
Tests for the Content Studio system checks: they surface through
Django's check framework with their own error IDs.
"""

from contextlib import contextmanager

import pytest
from django.core import checks as django_checks
from django.core.checks.registry import registry
from django.db import models
from django.test import override_settings

from content_studio import widgets
from content_studio.admin import InlineModelStudio, ModelStudio, admin_site
from content_studio.checks import check_content_studio
from content_studio.form import Component, Field, FieldLayout, FormSet
from tests.testapp.admin import ArticleAdmin
from tests.testapp.models import Article, Review


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


def test_unknown_bulk_action_name_surfaces_as_system_error():
    from content_studio.actions import bulk_action

    class Broken(ArticleAdmin):
        actions = ["publish", "nope"]

    original = admin_site._registry.pop(Article)
    admin_site._registry[Article] = Broken(Article, admin_site)

    try:
        messages = check_content_studio()
    finally:
        del admin_site._registry[Article]
        admin_site._registry[Article] = original

    error = next(m for m in messages if m.id == "content_studio.E007")

    assert "nope" in str(error)
    assert "testapp.article" in error.obj


def test_duplicate_bulk_action_name_surfaces_as_system_error():
    class Doubled(ArticleAdmin):
        actions = ["publish", "publish"]

    original = admin_site._registry.pop(Article)
    admin_site._registry[Article] = Doubled(Article, admin_site)

    try:
        messages = check_content_studio()
    finally:
        del admin_site._registry[Article]
        admin_site._registry[Article] = original

    assert any(
        m.id == "content_studio.E007" and "more than once" in str(m) for m in messages
    )


def test_delete_shadowing_bulk_action_surfaces_as_system_error():
    from content_studio.actions import bulk_action

    class Shadowing(ArticleAdmin):
        @bulk_action
        def delete(self, request, queryset):
            pass

    original = admin_site._registry.pop(Article)
    admin_site._registry[Article] = Shadowing(Article, admin_site)

    try:
        messages = check_content_studio()
    finally:
        del admin_site._registry[Article]
        admin_site._registry[Article] = original

    assert any(m.id == "content_studio.E007" and "shadows" in str(m) for m in messages)


def test_unknown_action_permission_surfaces_as_system_error():
    from content_studio.actions import bulk_action

    class WrongPermission(ArticleAdmin):
        @bulk_action(allowed_permissions=["publish"])
        def archive(self, request, queryset):
            pass

    original = admin_site._registry.pop(Article)
    admin_site._registry[Article] = WrongPermission(Article, admin_site)

    try:
        messages = check_content_studio()
    finally:
        del admin_site._registry[Article]
        admin_site._registry[Article] = original

    assert any(
        m.id == "content_studio.E007" and "unknown permission" in str(m)
        for m in messages
    )


def test_clean_bulk_actions_produce_no_errors():
    original = admin_site._registry.pop(Article)
    admin_site._registry[Article] = ArticleAdmin(Article, admin_site)

    try:
        messages = check_content_studio()
    finally:
        del admin_site._registry[Article]
        admin_site._registry[Article] = original

    assert not [m for m in messages if m.id == "content_studio.E007"]


@pytest.mark.django_db
def test_focus_point_attr_without_media_model_is_an_error():
    """FOCUS_POINT_ATTR needs a media item model to point at."""
    with override_settings(CONTENT_STUDIO={"FOCUS_POINT_ATTR": "focus_point"}):
        messages = check_content_studio()

    error = next(m for m in messages if m.id == "content_studio.E009")

    assert "MEDIA_LIBRARY_MODEL" in str(error)


@pytest.mark.django_db
def test_focus_point_attr_must_exist_on_the_media_model():
    with override_settings(
        CONTENT_STUDIO={
            "MEDIA_LIBRARY_MODEL": "test_media_library.ItemModel",
            "FOCUS_POINT_ATTR": "focus_point",
        }
    ):
        messages = check_content_studio()

    error = next(m for m in messages if m.id == "content_studio.E009")

    assert "unknown field 'focus_point'" in str(error)


@pytest.mark.django_db
def test_focus_point_attr_must_be_a_json_field():
    with override_settings(
        CONTENT_STUDIO={
            "MEDIA_LIBRARY_MODEL": "test_media_library.ItemModel",
            "FOCUS_POINT_ATTR": "name",
        }
    ):
        messages = check_content_studio()

    error = next(m for m in messages if m.id == "content_studio.E009")

    assert "must name a JSONField" in str(error)


@pytest.mark.django_db
def test_focus_point_attr_on_a_json_field_produces_no_error():
    with override_settings(
        CONTENT_STUDIO={
            "MEDIA_LIBRARY_MODEL": "test_media_library.ItemModel",
            "FOCUS_POINT_ATTR": "tags",
        }
    ):
        messages = check_content_studio()

    assert not [m for m in messages if m.id == "content_studio.E009"]


def test_focus_point_attr_unset_produces_no_error():
    assert not [m for m in check_content_studio() if m.id == "content_studio.E009"]


# --- E010: edit form configuration -----------------------------------------


def test_unknown_edit_field_name_surfaces_as_system_error():
    """A Field naming anything but a model field renders as an empty
    read-only box in the editor."""

    class Typo(ModelStudio):
        edit_main = [Field("titel")]

    with swapped_article_studio(Typo):
        messages = check_content_studio()

    error = next(m for m in messages if m.id == "content_studio.E010")

    assert "titel" in str(error)


def test_unknown_sidebar_field_name_surfaces_as_system_error():
    class Typo(ModelStudio):
        edit_sidebar = [Field("titel")]

    with swapped_article_studio(Typo):
        messages = check_content_studio()

    error = next(m for m in messages if m.id == "content_studio.E010")

    assert "titel" in str(error)


def test_non_widget_edit_field_widget_surfaces_as_system_error():
    class BadWidget(ModelStudio):
        edit_main = [Field("title", widget=dict)]

    with swapped_article_studio(BadWidget):
        messages = check_content_studio()

    error = next(m for m in messages if m.id == "content_studio.E010")

    assert "content_studio.widgets" in str(error)


def test_widget_override_produces_no_error():
    class Fine(ModelStudio):
        edit_main = [Field("title", widget=widgets.TextAreaWidget)]

    with swapped_article_studio(Fine):
        messages = check_content_studio()

    assert not [m for m in messages if m.id == "content_studio.E010"]


# --- E011: list page lookups ------------------------------------------------


def test_unresolvable_list_configuration_surfaces_as_system_errors():
    class Broken(ModelStudio):
        search_fields = ["titel"]
        ordering = ["-titel"]
        list_filter = ["titel"]
        list_display = {"title": "titel"}

    with swapped_article_studio(Broken):
        messages = check_content_studio()

    errors = [m for m in messages if m.id == "content_studio.E011"]

    assert len(errors) == 4
    assert all("titel" in str(error) for error in errors)


def test_resolvable_list_configuration_produces_no_error():
    """Related lookups, descending and random ordering, pk and model
    methods all resolve."""

    class Fine(ModelStudio):
        search_fields = ["title", "author__username"]
        ordering = ["title", "-pk", "?"]
        list_filter = ["status", "published_at"]
        list_display = {"title": "title", "meta": "get_status_display"}

    with swapped_article_studio(Fine):
        messages = check_content_studio()

    assert not [m for m in messages if m.id == "content_studio.E011"]


def test_inline_list_configuration_is_checked():
    class ReviewInline(InlineModelStudio):
        model = Review
        search_fields = ["titel"]

    class Broken(ModelStudio):
        inlines = [ReviewInline]

    with swapped_article_studio(Broken):
        messages = check_content_studio()

    error = next(m for m in messages if m.id == "content_studio.E011")

    assert "ReviewInline.search_fields" in str(error)


# --- E012: inline fk_name ---------------------------------------------------


def test_unknown_inline_fk_name_surfaces_as_system_error():
    class Inline(InlineModelStudio):
        model = Review
        fk_name = "titel"

    class Broken(ModelStudio):
        inlines = [Inline]

    with swapped_article_studio(Broken):
        messages = check_content_studio()

    error = next(m for m in messages if m.id == "content_studio.E012")

    assert "unknown field" in str(error)


def test_inline_fk_name_to_wrong_target_surfaces_as_system_error():
    class Inline(InlineModelStudio):
        model = Review
        fk_name = "stars"

    class Broken(ModelStudio):
        inlines = [Inline]

    with swapped_article_studio(Broken):
        messages = check_content_studio()

    error = next(m for m in messages if m.id == "content_studio.E012")

    assert "foreign key" in str(error)


def test_inline_fk_name_to_parent_fk_produces_no_error():
    class Inline(InlineModelStudio):
        model = Review
        fk_name = "article"

    class Fine(ModelStudio):
        inlines = [Inline]

    with swapped_article_studio(Fine):
        messages = check_content_studio()

    assert not [m for m in messages if m.id == "content_studio.E012"]


# --- E013: widget and format mappings ---------------------------------------


def test_non_widget_mapping_value_surfaces_as_system_error():
    original = admin_site.default_widget_mapping
    admin_site.default_widget_mapping = {models.CharField: object}

    try:
        messages = check_content_studio()
    finally:
        admin_site.default_widget_mapping = original

    error = next(m for m in messages if m.id == "content_studio.E013")

    assert "default_widget_mapping" in str(error)


def test_non_format_mapping_value_surfaces_as_system_error():
    original = admin_site.default_format_mapping
    admin_site.default_format_mapping = {models.CharField: object}

    try:
        messages = check_content_studio()
    finally:
        admin_site.default_format_mapping = original

    error = next(m for m in messages if m.id == "content_studio.E013")

    assert "default_format_mapping" in str(error)


# --- W002: required fields configured readonly -------------------------------


def test_required_field_configured_readonly_surfaces_as_warning():
    class ReadOnly(ModelStudio):
        edit_main = [Field("title", readonly=True), "body"]

    with swapped_article_studio(ReadOnly):
        messages = check_content_studio()

    warning = next(m for m in messages if m.id == "content_studio.W002")

    assert "title" in str(warning)
    assert isinstance(warning, django_checks.Warning)


def test_optional_field_configured_readonly_produces_no_warning():
    class ReadOnly(ModelStudio):
        edit_main = [Field("body", readonly=True), "title"]

    with swapped_article_studio(ReadOnly):
        messages = check_content_studio()

    assert not [m for m in messages if m.id == "content_studio.W002"]


# --- W003: choice widgets on fields without choices ---------------------------


def test_choice_widget_without_choices_surfaces_as_warning():
    class NoChoices(ModelStudio):
        edit_main = [Field("title", widget=widgets.ToggleGroupWidget)]

    with swapped_article_studio(NoChoices):
        messages = check_content_studio()

    warning = next(m for m in messages if m.id == "content_studio.W003")

    assert "title" in str(warning)
    assert "ToggleGroupWidget" in str(warning)


def test_choice_widget_on_choice_field_produces_no_warning():
    class Fine(ModelStudio):
        edit_main = [Field("status", widget=widgets.ToggleGroupWidget)]

    with swapped_article_studio(Fine):
        messages = check_content_studio()

    assert not [m for m in messages if m.id == "content_studio.W003"]


# --- W004: sortable_by outside table_display ---------------------------------


def test_sortable_by_without_column_surfaces_as_warning():
    class Sort(ModelStudio):
        sortable_by = ["views"]
        table_display = ["id", "title"]

    with swapped_article_studio(Sort):
        messages = check_content_studio()

    warning = next(m for m in messages if m.id == "content_studio.W004")

    assert "views" in str(warning)


def test_sortable_by_on_columns_produces_no_warning():
    class Sort(ModelStudio):
        sortable_by = ["title"]
        table_display = ["id", "title"]

    with swapped_article_studio(Sort):
        messages = check_content_studio()

    assert not [m for m in messages if m.id == "content_studio.W004"]


# --- W005: non-string list_filter entries -------------------------------------


def test_non_string_list_filter_entry_surfaces_as_warning():
    class WithFilterTuple(ModelStudio):
        list_filter = ["status", ("published_at", "SomeFilter")]

    with swapped_article_studio(WithFilterTuple):
        messages = check_content_studio()

    warning = next(m for m in messages if m.id == "content_studio.W005")

    assert "SomeFilter" in str(warning)


# --- Site-level warnings ------------------------------------------------------


def test_model_group_with_unregistered_model_surfaces_as_warning():
    from content_studio.admin import ModelGroup

    original = admin_site.model_groups
    admin_site.model_groups = [ModelGroup(name="content", models=[Article, Review])]

    try:
        messages = check_content_studio()
    finally:
        admin_site.model_groups = original

    warning = next(m for m in messages if m.id == "content_studio.W006")

    assert "testapp.review" in str(warning)


def test_media_model_missing_contract_fields_surfaces_as_warning():
    with override_settings(
        CONTENT_STUDIO={"MEDIA_LIBRARY_MODEL": "tests.testapp.models.Review"}
    ):
        messages = check_content_studio()

    warning = next(m for m in messages if m.id == "content_studio.W007")

    assert "file" in str(warning)


def test_crop_hook_without_media_library_surfaces_as_warning():
    admin_site.crop_image = lambda obj, crop_info: None

    try:
        messages = check_content_studio()
    finally:
        del admin_site.crop_image

    warning = next(m for m in messages if m.id == "content_studio.W008")

    assert "crop_image" in str(warning)


def test_empty_login_backends_surfaces_as_warning():
    with override_settings(CONTENT_STUDIO={"LOGIN_BACKENDS": []}):
        messages = check_content_studio()

    warning = next(m for m in messages if m.id == "content_studio.W009")

    assert "LOGIN_BACKENDS" in str(warning)
