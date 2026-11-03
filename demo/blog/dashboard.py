"""
Dashboard widgets for the demo project, implemented against the documented
widget contracts (`StatisticWidget`, `ContentListWidget`).
"""

from datetime import timedelta

from django.db.models import Sum
from django.utils import timezone

from content_studio.dashboard.content_list import ContentListWidget
from content_studio.dashboard.statistic import StatisticWidget

from .models import Article


class ArticleCountWidget(StatisticWidget):
    def get_data(self, request):
        drafts = Article.objects.filter(status=Article.Status.DRAFT).count()
        return {
            "title": "Articles",
            "value": Article.objects.count(),
            "icon": "ph-bold ph-article",
            "footnote": f"{drafts} draft{'' if drafts == 1 else 's'}",
        }


class PublishedArticlesWidget(StatisticWidget):
    days = 30

    def get_data(self, request):
        now = timezone.now()
        start = now - timedelta(days=self.days)
        published = Article.objects.filter(status=Article.Status.PUBLISHED)
        current = published.filter(published_at__gte=start).count()
        previous = published.filter(
            published_at__gte=start - timedelta(days=self.days),
            published_at__lt=start,
        ).count()
        # Publications per day over the last two weeks, oldest first.
        days = [now - timedelta(days=13 - offset) for offset in range(14)]
        series = [
            published.filter(published_at__date=day.date()).count() for day in days
        ]
        trend = round((current - previous) / previous * 100, 1) if previous else None
        return {
            "title": f"Published ({self.days} days)",
            "value": current,
            "icon": "ph-bold ph-check-circle",
            "trend": trend,
            "trend_sentiment": "positive" if (trend or 0) > 0 else "negative",
            "trend_label": f"vs previous {self.days} days",
            "series": series,
        }


class TotalViewsWidget(StatisticWidget):
    def get_data(self, request):
        return {
            "title": "Total views",
            "value": Article.objects.aggregate(total=Sum("views"))["total"] or 0,
            "icon": "ph-bold ph-eye",
        }


class FeaturedArticlesWidget(StatisticWidget):
    def get_data(self, request):
        total = Article.objects.count()
        return {
            "title": "Featured",
            "value": Article.objects.filter(featured=True).count(),
            "icon": "ph-bold ph-star",
            "footnote": f"of {total} articles",
            # Draws a meter of value against max_value.
            "max_value": total or None,
        }


class LatestArticlesWidget(ContentListWidget):
    def get_data(self, request):
        articles = Article.objects.select_related("cover", "author").order_by("-pk")
        content = [
            {
                "model": "demo_blog.article",
                "id": str(article.pk),
                "title": article.title,
                "description": str(article.author or ""),
                "status": article.get_status_display(),
                "status_variant": (
                    "success"
                    if article.status == Article.Status.PUBLISHED
                    else "default"
                ),
                "thumbnail": cover_url(article),
                "timestamp": article.edited_at or article.published_at,
            }
            for article in articles[:5]
        ]
        return {
            "title": "Latest articles",
            "description": "The five most recently created articles",
            "content": content,
        }


def cover_url(article):
    cover = article.cover
    if cover and cover.type == "image" and cover.file:
        return cover.file.url
    return ""
