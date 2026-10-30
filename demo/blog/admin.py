"""
Content Studio registration for the demo project — the documented pattern:
`@register` the model, customize through `ModelStudio` options on the site
configured in CONTENT_STUDIO (demo.blog.studio.admin_site).
"""

from content_studio import register
from content_studio.admin import ModelStudio, RelationDisplay, InlineModelStudio
from content_studio.form import ActivityLog, FormSet
from content_studio.actions import bulk_action

from . import models


class ReviewInline(InlineModelStudio):
    model = models.Review
    # Reviews are dragged into order per article.
    reorder_field = "position"


@register(models.Category)
class CategoryStudio(ModelStudio):
    table_display = ["name"]
    search_fields = ["name"]
    # Categories are dragged into order; the list follows it.
    reorder_field = "position"

    def get_relation_display(self, obj, request):
        return RelationDisplay(
            title=obj.name,
            description=f"{obj.article_set.count()} article(s)",
            icon="ph-bold ph-tag",
        )


@register(models.MediaItem)
class MediaItemStudio(ModelStudio):
    table_display = ["name", "type"]

    def get_relation_display(self, obj, request):
        return RelationDisplay(
            title=obj.name,
            initials=obj.name[:2],
            # Image items show their own picture as the avatar.
            avatar=obj.file.url if obj.type == "image" and obj.file else None,
        )


@register(models.MediaFolder)
class MediaFolderStudio(ModelStudio):
    table_display = ["name"]


@register(models.Article)
class ArticleStudio(ModelStudio):
    table_display = ["title", "status", "featured", "views", "author", "published_at"]
    # The list view's rows; both views are offered, with a toggle.
    list_views = ["table", "list"]
    list_item_display = {
        "title": "title",
        "description": "body",
        "meta": "get_status_display",
        "thumbnail": "cover",
    }
    # Newest first, so the seeded demo article leads the list.
    ordering = ["-pk"]
    # One field per filter type: choices (status), boolean (featured),
    # number range (views), date range (published_at), foreign key
    # (author) and many to many (categories).
    list_filter = [
        "status",
        "featured",
        "views",
        "published_at",
        "author",
        "categories",
    ]
    # Opt-in soft delete: deleting moves articles to the trash, where
    # they can be restored or permanently deleted.
    soft_delete = "removed_at"
    search_fields = ["title"]
    inlines = [ReviewInline]
    edit_main = [
        FormSet(
            title="Content",
            description="The article itself",
            fields=["title", "body", "status", "categories", "cover"],
        ),
    ]
    edit_sidebar = ["published_at", "author", "featured", "views", ActivityLog()]

    @bulk_action(
        label="Publish",
        icon="ph-bold ph-paper-plane-tilt",
        confirm="...",
        allowed_permissions=["change"],
        destructive=False,
    )
    def publish(self, request, queryset):
        queryset.update(status=models.Article.Status.PUBLISHED)
        return f"Published {queryset.count()} articles."


@register(models.SiteSettings)
class SiteSettingsStudio(ModelStudio):
    is_singleton = True
    edit_main = ["site_name", "tagline"]


@register(models.LandingPage)
class LandingPageStudio(ModelStudio):
    edit_main = ["title", "body", "sections"]
