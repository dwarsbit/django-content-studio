"""
Tests for the list page's views: the table view's columns (table_display)
and the list view's item anatomy (list_item_display /
get_list_item_display), plus the setup validation that keeps the two apart
and the list_display alias of table_display.
"""

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings

from content_studio.admin import (
    InlineModelStudio,
    ListItemDisplay,
    ModelStudio,
    admin_site,
    get_table_display_columns,
)
from content_studio.checks import list_config_errors, list_display_warnings
from tests.test_e2e_crud import AuthenticatedTestCase
from content_studio.media_library.models import Media
from tests.testapp.models import Article, Product


def _validate_with(model_studio):
    """Instantiate a throwaway studio and run the list config checks."""
    return list_config_errors(model_studio(Article, admin_site))


def test_mapping_list_display_is_rejected():
    """A role mapping in list_display belongs in list_item_display."""

    class OldStyle(ModelStudio):
        list_display = {"title": "title"}  # type: ignore[assignment]

    errors = _validate_with(OldStyle)
    assert len(errors) == 1
    assert errors[0][0] == "content_studio.E001"
    assert "list_item_display" in errors[0][1]


def test_list_display_is_an_alias_of_table_display():
    class DjangoStyle(ModelStudio):
        list_display = ["title", "status"]

    studio = DjangoStyle(Article, admin_site)
    columns = [column.field for column in get_table_display_columns(studio)]

    assert columns == ["title", "status"]
    assert _validate_with(DjangoStyle) == []

    warnings = list_display_warnings(studio)
    assert [check_id for check_id, _ in warnings] == ["content_studio.W010"]
    assert "rename it to table_display" in warnings[0][1]


def test_table_display_wins_over_list_display():
    class Both(ModelStudio):
        table_display = ["title"]
        list_display = ["status"]

    studio = Both(Article, admin_site)
    columns = [column.field for column in get_table_display_columns(studio)]

    assert columns == ["title"]
    warnings = list_display_warnings(studio)
    assert "is ignored because table_display is set" in warnings[0][1]


def test_list_display_alias_works_on_inlines():
    from tests.testapp.models import Review

    class ReviewInline(InlineModelStudio):
        model = Review
        list_display = ["__str__", "id"]

    class WithInline(ModelStudio):
        inlines = [ReviewInline]

    columns = [column.field for column in get_table_display_columns(ReviewInline)]

    assert columns == ["__str__", "id"]
    warnings = list_display_warnings(WithInline(Article, admin_site))
    assert "ReviewInline.list_display" in warnings[0][1]


def test_overriding_get_list_display_warns():
    class OldHook(ModelStudio):
        def get_list_display(self, obj, request):
            return ListItemDisplay(title="never called")

    warnings = list_display_warnings(OldHook(Article, admin_site))

    assert [check_id for check_id, _ in warnings] == ["content_studio.W011"]
    assert "get_list_item_display" in warnings[0][1]


def test_unknown_list_view_is_rejected():
    class UnknownView(ModelStudio):
        list_views = ["table", "cards"]

    errors = _validate_with(UnknownView)
    assert errors[0][0] == "content_studio.E002"
    assert "cards" in errors[0][1]


def test_declarative_and_override_configs_validate():
    class Fine(ModelStudio):
        list_views = ["table", "list"]
        list_item_display = {"title": "title", "description": "body"}

    assert _validate_with(Fine) == []


def test_get_list_item_display_resolves_the_mapping():
    admin = admin_site._registry[Article]
    article = Article(title="Hello", body="Body text")
    article.status = Article.Status.PUBLISHED

    display = admin.get_list_item_display(article, None)

    assert display.title == "Hello"
    assert display.description == "Body text"
    # Callables (model methods like get_status_display) resolve too.
    assert display.meta == "Published"


def test_get_list_item_display_falls_back_to_str_without_mapping():
    class Bare(ModelStudio):
        pass

    admin = Bare(Article, admin_site)
    display = admin.get_list_item_display(Article(title="Fallback"), None)

    assert display.title == "Fallback"
    assert display.description == ""
    assert display.meta == ""
    assert display.thumbnail == ""


def _thumbnail_of(model, obj, field):
    class WithThumbnail(ModelStudio):
        list_item_display = {"thumbnail": field}

    return WithThumbnail(model, admin_site).get_list_item_display(obj, None).thumbnail


def test_thumbnail_resolves_a_file_field_to_its_url():
    product = Product(title="Lamp", manual="covers/lamp.png")

    assert _thumbnail_of(Product, product, "manual") == product.manual.url


def test_thumbnail_of_an_empty_file_field_is_empty():
    assert _thumbnail_of(Product, Product(title="Lamp"), "manual") == ""


def test_thumbnail_resolves_a_method_returning_a_url():
    article = Article(title="Hello")
    article.get_cover_url = lambda: "https://cdn.example.com/hello.jpg"

    assert (
        _thumbnail_of(Article, article, "get_cover_url")
        == "https://cdn.example.com/hello.jpg"
    )


@override_settings(
    CONTENT_STUDIO={
        "ADMIN_SITE": "content_studio.admin.admin_site",
        "MEDIA_LIBRARY_MODEL": "content_studio.media_library.models.Media",
        "MEDIA_LIBRARY_FOLDER_MODEL": "content_studio.media_library.models.Folder",
    }
)
def test_thumbnail_resolves_media_library_images_only():
    holder = Article(title="Hello")
    holder.image = Media(file="photos/sea.jpg", type="image")
    holder.video = Media(file="clips/sea.mp4", type="video")

    assert _thumbnail_of(Article, holder, "image") == holder.image.file.url
    # Other media types have no picture to show.
    assert _thumbnail_of(Article, holder, "video") == ""


def test_get_list_item_display_can_be_overridden():
    class Computed(ModelStudio):
        def get_list_item_display(self, obj, request):
            return ListItemDisplay(
                title=f"computed {obj.title}", description="fixed", meta="M"
            )

    admin = Computed(Article, admin_site)
    display = admin.get_list_item_display(Article(title="Hello"), None)

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
        assert first["list_item_display"] == {
            "title": "Hello",
            "description": "Body text",
            "meta": "Published",
            "thumbnail": "",
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
