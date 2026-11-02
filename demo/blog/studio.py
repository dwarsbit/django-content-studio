"""
The demo project's Content Studio site. It lives in its own module, like
the classic admin's custom AdminSite: the site instance must be
importable while `admin.py` runs its registrations (the `@register`
decorator resolves the configured site), so defining both in one module
would be circular.
"""

from content_studio.admin import ContentStudioSite
from content_studio.dashboard import Dashboard
from content_studio.dashboard.tasks import TaskDashboard
from content_studio.extensions import UserMenuLink
from content_studio.notifications.dashboard import NotificationsWidget

from .dashboard import ArticleCountWidget, LatestArticlesWidget
from .task_queue import DemoTaskAdapter


class DemoStudioSite(ContentStudioSite):
    dashboard = Dashboard(
        widgets=[
            ArticleCountWidget(),
            LatestArticlesWidget(),
            NotificationsWidget(),
        ],
    )
    extensions = [
        TaskDashboard(adapter=DemoTaskAdapter()),
        UserMenuLink(url="/tasks/", label="Tasks", icon="ph-bold ph-queue"),
    ]


admin_site = DemoStudioSite()
