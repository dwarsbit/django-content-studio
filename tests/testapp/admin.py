from content_studio import register
from content_studio.actions import bulk_action
from content_studio.admin import InlineModelStudio, ModelStudio
from content_studio.form import FormSet, TableColumn

from .models import (
    Article,
    Category,
    Label,
    LandingPage,
    Note,
    Page,
    Review,
    SiteSettings,
    Step,
    Track,
)


class ReviewInline(InlineModelStudio):
    model = Review


class StepInline(InlineModelStudio):
    model = Step
    table_display = ["text"]
    reorder_field = "order_key"


@register(Category)
class CategoryAdmin(ModelStudio):
    table_display = ["id", "name"]
    search_fields = ["name"]


@register(Article)
class ArticleAdmin(ModelStudio):
    table_display = [
        "id",
        "title",
        "status",
        "published_at",
        "views",
        TableColumn(field="get_body_preview", header="Preview"),
    ]
    list_views = ["table", "list"]
    list_item_display = {
        "title": "title",
        "description": "body",
        "meta": "get_status_display",
    }
    list_filter = ["status", "published_at"]
    search_fields = ["title"]
    inlines = [ReviewInline, StepInline]
    edit_main = [
        FormSet(
            title="Content",
            description="The article itself",
            fields=["title", "body", "status"],
        ),
    ]
    edit_sidebar = ["published_at", "rating", "author"]

    @bulk_action(
        label="Publish",
        icon="ph-bold ph-paper-plane-tilt",
        allowed_permissions=["change"],
    )
    def publish(self, request, queryset):
        count = queryset.update(status=Article.Status.PUBLISHED)
        return f"Published {count} articles."

    def get_body_preview(self, obj, request):
        return obj.body[:50] if obj.body else ""


@register(SiteSettings)
class SiteSettingsAdmin(ModelStudio):
    is_singleton = True
    edit_main = ["site_name", "tagline"]


@register(Note)
class NoteAdmin(ModelStudio):
    table_display = ["id", "title"]
    sortable_by = ["title"]
    soft_delete = "removed_at"


@register(Page)
class PageAdmin(ModelStudio):
    table_display = ["id", "title"]
    prepopulated_fields = {"slug": ["title"]}
    soft_delete = "removed_at"


@register(Label)
class LabelAdmin(ModelStudio):
    table_display = ["code", "name"]
    search_fields = ["name"]


@register(Track)
class TrackAdmin(ModelStudio):
    table_display = ["id", "title", "position"]
    list_filter = ["category", "title"]
    search_fields = ["title"]
    soft_delete = "removed_at"
    reorder_field = "position"
    reorder_scope = ["category"]


@register(LandingPage)
class LandingPageAdmin(ModelStudio):
    table_display = ["title"]
