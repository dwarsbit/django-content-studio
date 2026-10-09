"""
Dashboard widgets for the demo project, implemented against the documented
widget contracts (`StatisticWidget`, `ContentListWidget`).
"""

from content_studio.dashboard import Dashboard
from content_studio.dashboard.content_list import ContentListWidget
from content_studio.dashboard.statistic import StatisticWidget

from .models import Article


class ArticleCountWidget(StatisticWidget):
    def get_data(self, request):
        return {
            "title": "Articles",
            "value": Article.objects.count(),
        }


class LatestArticlesWidget(ContentListWidget):
    def get_data(self, request):
        content = [
            {
                "model": "demo_blog.article",
                "id": str(article.pk),
                "title": article.title,
                "description": article.get_status_display(),
            }
            for article in Article.objects.order_by("-pk")[:5]
        ]
        return {
            "title": "Latest articles",
            "description": "The five most recently created articles",
            "content": content,
        }
