"""
The demo project's Content Studio site. It lives in its own module, like
the classic admin's custom AdminSite: the site instance must be
importable while `admin.py` runs its registrations (the `@register`
decorator resolves the configured site), so defining both in one module
would be circular.
"""

from django.contrib.auth import get_user_model

from content_studio.admin import ContentStudioSite, ModelGroup
from content_studio.analytics import (
    AnalyticsExtension,
    AnalyticsLink,
    AnalyticsPage,
    AnalyticsStatisticWidget,
    AnalyticsTopPagesWidget,
)
from content_studio.dashboard import Dashboard
from content_studio.dashboard.activity_log import ActivityLogWidget
from content_studio.dashboard.tasks import TaskDashboard
from content_studio.extensions import UserMenuLink
from content_studio.notifications.dashboard import NotificationsWidget

from . import models
from .analytics import DemoAnalyticsProvider
from .dashboard import (
    ArticleCountWidget,
    FeaturedArticlesWidget,
    LatestArticlesWidget,
    PublishedArticlesWidget,
    TotalViewsWidget,
)
from .task_queue import DemoTaskAdapter


class DemoStudioSite(ContentStudioSite):
    model_groups = [
        ModelGroup(
            "magazine",
            icon="ph-bold ph-newspaper",
            models=[models.Article, models.Category, models.LandingPage],
        ),
        ModelGroup(
            "media",
            icon="ph-bold ph-images",
            models=[models.MediaItem, models.MediaFolder],
        ),
        ModelGroup(
            "settings",
            icon="ph-bold ph-gear",
            models=[models.SiteSettings, get_user_model()],
        ),
    ]
    dashboard = Dashboard(
        widgets=[
            ArticleCountWidget(),
            PublishedArticlesWidget(),
            TotalViewsWidget(),
            AnalyticsStatisticWidget(metric="visitors"),
            FeaturedArticlesWidget(),
            AnalyticsTopPagesWidget(),
            LatestArticlesWidget(),
            NotificationsWidget(),
            ActivityLogWidget(),
        ],
    )
    extensions = [
        # Made-up numbers, so the demo needs no analytics account; a real
        # site passes UmamiProvider(website_id=..., api_key=...).
        AnalyticsExtension(provider=DemoAnalyticsProvider()),
        AnalyticsPage(),
        AnalyticsLink(),
        TaskDashboard(adapter=DemoTaskAdapter()),
        UserMenuLink(url="/tasks/", label="Tasks", icon="ph-bold ph-queue"),
    ]


admin_site = DemoStudioSite()
