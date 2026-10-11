"""
The demo project's Content Studio site. It lives in its own module, like
the classic admin's custom AdminSite: the site instance must be
importable while `admin.py` runs its registrations (the `@register`
decorator resolves the configured site), so defining both in one module
would be circular.
"""

from content_studio.admin import ContentStudioSite
from content_studio.dashboard import Dashboard

from .dashboard import ArticleCountWidget, LatestArticlesWidget


class DemoStudioSite(ContentStudioSite):
    dashboard = Dashboard(
        widgets=[ArticleCountWidget(), LatestArticlesWidget()],
    )


admin_site = DemoStudioSite()
