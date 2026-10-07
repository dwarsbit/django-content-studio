from content_studio import register
from content_studio.admin import ModelAdmin, StackedInline
from content_studio.form import FormSet

from .models import Article, Category, Review, SiteSettings


class ReviewInline(StackedInline):
    model = Review


@register(Category)
class CategoryAdmin(ModelAdmin):
    list_display = ["id", "name"]
    search_fields = ["name"]


@register(Article)
class ArticleAdmin(ModelAdmin):
    list_display = ["id", "title", "status", "published_at", "views"]
    list_filter = ["status", "published_at"]
    search_fields = ["title"]
    inlines = [ReviewInline]
    edit_main = [
        FormSet(
            title="Content",
            description="The article itself",
            fields=["title", "body", "status"],
        ),
    ]
    edit_sidebar = ["published_at", "rating", "author"]


@register(SiteSettings)
class SiteSettingsAdmin(ModelAdmin):
    is_singleton = True
    edit_main = ["site_name", "tagline"]
