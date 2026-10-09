"""
Content Studio registration for the demo project — the documented pattern:
`@register` the model, customize through `ModelAdmin` options.
"""

from content_studio import register
from content_studio.admin import (
    AdminSite,
    ModelAdmin,
    RelationDisplay,
    StackedInline,
)
from content_studio.dashboard import Dashboard
from content_studio.form import FormSet

from . import models
from .dashboard import ArticleCountWidget, LatestArticlesWidget


class ReviewInline(StackedInline):
    model = models.Review


@register(models.Category)
class CategoryAdmin(ModelAdmin):
    list_display = ["name"]
    search_fields = ["name"]

    def get_relation_display(self, obj, request):
        return RelationDisplay(
            title=obj.name,
            description=f"{obj.article_set.count()} article(s)",
            icon="ph-bold ph-tag",
        )


@register(models.MediaItem)
class MediaItemAdmin(ModelAdmin):
    list_display = ["name", "type"]

    def get_relation_display(self, obj, request):
        return RelationDisplay(
            title=obj.name,
            initials=obj.name[:2],
            # Image items show their own picture as the avatar.
            avatar=obj.file.url if obj.type == "image" and obj.file else None,
        )


@register(models.MediaFolder)
class MediaFolderAdmin(ModelAdmin):
    list_display = ["name"]


@register(models.Article)
class ArticleAdmin(ModelAdmin):
    list_display = ["title", "status", "author", "published_at"]
    list_filter = ["status"]
    search_fields = ["title"]
    inlines = [ReviewInline]
    edit_main = [
        FormSet(
            title="Content",
            description="The article itself",
            fields=["title", "body", "status", "categories", "cover"],
        ),
    ]
    edit_sidebar = ["published_at", "author"]


@register(models.SiteSettings)
class SiteSettingsAdmin(ModelAdmin):
    is_singleton = True
    edit_main = ["site_name", "tagline"]


if models.blueprint_available:

    @register(models.LandingPage)
    class LandingPageAdmin(ModelAdmin):
        edit_main = ["title", "body"]


class DemoAdminSite(AdminSite):
    dashboard = Dashboard(
        widgets=[ArticleCountWidget(), LatestArticlesWidget()],
    )


admin_site = DemoAdminSite()
