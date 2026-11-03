"""
Content Studio registration for the demo project — the documented pattern:
`@register` the model, customize through `ModelStudio` options on the site
configured in CONTENT_STUDIO (demo.blog.studio.admin_site).
"""

from django.contrib.auth import get_user_model

from content_studio import register, widgets
from content_studio.admin import ModelStudio, RelationDisplay, InlineModelStudio
from content_studio.form import ActivityLog, Callout, Field, FormSet, Subtitle, Text
from content_studio.actions import bulk_action

from . import models


class ReviewInline(InlineModelStudio):
    model = models.Review
    # Reviews are dragged into order per article.
    reorder_field = "position"


@register(get_user_model())
class UserStudio(ModelStudio):
    icon = "ph-bold ph-users"
    table_display = ["username", "first_name", "last_name", "email", "is_superuser"]
    search_fields = ["username", "first_name", "last_name", "email"]

    def get_relation_display(self, obj, request):
        # Authors and actors show by name, falling back to the username.
        return RelationDisplay(
            title=obj.get_full_name() or obj.username,
            description=obj.email,
            initials=f"{obj.first_name[:1]}{obj.last_name[:1]}" or obj.username[:2],
        )


@register(models.Category)
class CategoryStudio(ModelStudio):
    icon = "ph-bold ph-tag"
    table_display = ["name", "color", "description"]
    search_fields = ["name"]
    edit_main = ["name", "description", "color"]
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
    icon = "ph-bold ph-image"
    table_display = ["name", "type", "folder"]

    def get_relation_display(self, obj, request):
        return RelationDisplay(
            title=obj.name,
            initials=obj.name[:2],
            # Image items show their own picture as the avatar.
            avatar=obj.file.url if obj.type == "image" and obj.file else None,
        )


@register(models.MediaFolder)
class MediaFolderStudio(ModelStudio):
    icon = "ph-bold ph-folder"
    table_display = ["name"]


class ReadingTime(Callout):
    title = "Reading time"

    def get_text(self, obj, request):
        minutes = max(1, len(obj.body.split()) // 200)
        return f"About **{minutes} min** to read."


@register(models.Article)
class ArticleStudio(ModelStudio):
    icon = "ph-bold ph-article"
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
            fields=[
                Field("cover", widget=widgets.CoverImageWidget),
                "title",
                Text("Write for the web: short paragraphs, **one idea** each."),
                "body",
                Subtitle("Publishing"),
                "status",
                "categories",
            ],
        ),
    ]
    edit_sidebar = [
        ReadingTime(),
        "published_at",
        "author",
        "featured",
        "views",
        ActivityLog(),
    ]

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
    icon = "ph-bold ph-sliders-horizontal"
    is_singleton = True
    edit_main = [
        "site_name",
        "tagline",
        "contact_email",
        Subtitle("Brand"),
        Text("The colors the site's header, links and buttons use."),
        "brand_color",
        "accent_color",
        Subtitle("Integrations"),
        Field("social_links", widget=widgets.KeyValueWidget),
        Field("head_code", widget=widgets.CodeWidget(language="html")),
    ]


@register(models.LandingPage)
class LandingPageStudio(ModelStudio):
    icon = "ph-bold ph-browser"
    table_display = ["title"]
    edit_main = ["title", "body", "sections"]
