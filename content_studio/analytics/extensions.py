import hashlib
import json
import uuid
from typing import Optional

from django.core.cache import cache
from django.utils.translation import gettext_lazy as _

from ..extensions import BaseExtension, MainMenuLink
from ..settings import cs_settings
from .providers import BREAKDOWNS, METRICS, AnalyticsProvider, AnalyticsQuery

__all__ = [
    "AnalyticsExtension",
    "AnalyticsLink",
    "AnalyticsPage",
    "AnalyticsUserMenuLink",
    "get_analytics",
    "get_analytics_page",
]


def site_extensions(site=None) -> list:
    site = site or cs_settings.ADMIN_SITE
    return list(getattr(site, "extensions", None) or [])


def get_analytics(site=None) -> Optional["AnalyticsExtension"]:
    """The site's AnalyticsExtension, or None without one."""
    return next(
        (e for e in site_extensions(site) if isinstance(e, AnalyticsExtension)),
        None,
    )


def get_analytics_page(site=None) -> Optional["AnalyticsPage"]:
    """The site's AnalyticsPage, or None without one."""
    return next(
        (e for e in site_extensions(site) if isinstance(e, AnalyticsPage)), None
    )


def analytics_visible(request) -> bool:
    """Whether the request may see the site's analytics."""
    analytics = get_analytics()
    return bool(analytics and analytics.is_visible(request))


class AnalyticsExtension(BaseExtension):
    """
    Connects the admin to an analytics tool through a provider. The
    analytics page, its menu links, the Analytics component and the
    analytics dashboard widgets all read from it:

        class StudioSite(ContentStudioSite):
            extensions = [
                AnalyticsExtension(provider=UmamiProvider(...)),
                AnalyticsPage(),
                AnalyticsLink(),
            ]

    The provider's answers are cached for cache_timeout seconds (the
    live visitor count for realtime_cache_timeout), which keeps the
    admin quick and under the tool's rate limits. Every active staff
    member sees analytics; override is_visible(request) to narrow it.
    """

    extension_type = "AnalyticsExtension"
    provider: AnalyticsProvider = None
    cache_timeout: int = 300
    realtime_cache_timeout: int = 30

    def __init__(
        self,
        provider: AnalyticsProvider = None,
        cache_timeout: int = None,
        realtime_cache_timeout: int = None,
        extension_id: uuid.UUID = None,
    ):
        if provider is not None:
            self.provider = provider
        if cache_timeout is not None:
            self.cache_timeout = cache_timeout
        if realtime_cache_timeout is not None:
            self.realtime_cache_timeout = realtime_cache_timeout

        if not isinstance(self.provider, AnalyticsProvider):
            raise ValueError("An analytics extension needs an AnalyticsProvider.")

        super().__init__(extension_id)

    def get_id_parts(self):
        return ("analytics",)

    # Reading from the provider, through the cache.

    def cached(self, request, timeout, method, *args):
        key = hashlib.sha256(
            json.dumps(
                [self.provider.get_cache_key(request), method, *args],
                default=str,
            ).encode()
        ).hexdigest()
        cache_key = f"content_studio:analytics:{key}"
        value = cache.get(cache_key)

        if value is None:
            value = getattr(self.provider, method)(request, *args)
            cache.set(cache_key, value, timeout)

        return value

    def get_summary(self, request, query: AnalyticsQuery):
        return self.cached(request, self.cache_timeout, "get_summary", query)

    def get_timeseries(self, request, query: AnalyticsQuery, metric: str):
        return self.cached(request, self.cache_timeout, "get_timeseries", query, metric)

    def get_breakdown(self, request, query: AnalyticsQuery, dimension: str, limit: int):
        return self.cached(
            request, self.cache_timeout, "get_breakdown", query, dimension, limit
        )

    def get_realtime(self, request):
        return self.cached(request, self.realtime_cache_timeout, "get_realtime")

    def get_dashboard_url(self, request, query: AnalyticsQuery):
        return self.provider.get_dashboard_url(request, query)

    # What the frontend knows.

    def get_metrics(self) -> list[str]:
        return [key for key in self.provider.metrics if key in METRICS]

    def get_breakdowns(self) -> list[str]:
        if not self.provider.implements("get_breakdown"):
            return []
        return [key for key in self.provider.breakdowns if key in BREAKDOWNS]

    def serialize(self):
        provider = self.provider
        page = get_analytics_page()

        return {
            **super().serialize(),
            "config": {
                "provider": str(provider.name),
                "metrics": (
                    [
                        {
                            "key": key,
                            "label": str(METRICS[key][0]),
                            "kind": METRICS[key][1],
                            "sign": METRICS[key][2],
                        }
                        for key in self.get_metrics()
                    ]
                    if provider.implements("get_summary")
                    else []
                ),
                "timeseries_metrics": (
                    [key for key in provider.timeseries_metrics if key in METRICS]
                    if provider.implements("get_timeseries")
                    else []
                ),
                "breakdowns": self.get_breakdowns(),
                "realtime": provider.implements("get_realtime"),
                "page_path": page.path if page else None,
            },
        }


class AnalyticsPage(BaseExtension):
    """
    A page with the site's analytics: its metrics against the period
    before, a chart, and the top pages, sources, locations and devices,
    for a range the editor picks. Link to it with AnalyticsLink or
    AnalyticsUserMenuLink. It needs an AnalyticsExtension and shows to
    whoever that shows to.
    """

    extension_type = "AnalyticsPage"
    path: str = "analytics/"
    title: str = _("Analytics")
    description: Optional[str] = None

    def __init__(
        self,
        path: str = None,
        title: str = None,
        description: str = None,
        extension_id: uuid.UUID = None,
    ):
        if path is not None:
            self.path = path
        if title is not None:
            self.title = title
        if description is not None:
            self.description = description

        if not str(self.path or "").strip("/"):
            raise ValueError("An analytics page needs a path.")

        super().__init__(extension_id)

    def get_id_parts(self):
        return (self.path,)

    def is_visible(self, request) -> bool:
        return analytics_visible(request)

    def serialize(self):
        return {
            **super().serialize(),
            "config": {
                "path": self.path,
                "title": str(self.title),
                "description": (
                    None if self.description is None else str(self.description)
                ),
            },
        }


class AnalyticsLink(MainMenuLink):
    """
    A main menu link to the AnalyticsPage. It takes MainMenuLink's
    options, with the page's path, "Analytics" and a chart icon as
    defaults, and shows to whoever sees analytics.
    """

    label = _("Analytics")
    icon = "ph-bold ph-chart-line-up"
    url = None

    def __init__(
        self,
        url: str = None,
        label: str = None,
        icon: str = None,
        color: str = None,
        weight: int = 0,
        extension_id: uuid.UUID = None,
    ):
        super().__init__(
            url=url if url is not None else type(self).url,
            label=label if label is not None else type(self).label,
            icon=icon if icon is not None else type(self).icon,
            color=color,
            weight=weight,
            extension_id=extension_id,
        )

    def get_id_parts(self):
        return (self.url, str(self.label))

    def get_url(self) -> Optional[str]:
        if self.url:
            return self.url

        page = get_analytics_page()
        return f"/{page.path.strip('/')}/" if page else None

    def is_visible(self, request) -> bool:
        return analytics_visible(request) and self.get_url() is not None

    def serialize(self):
        data = super().serialize()
        data["config"]["url"] = self.get_url()
        data["config"]["label"] = str(self.label)
        return data


class AnalyticsUserMenuLink(AnalyticsLink):
    """AnalyticsLink in the user menu, between the theme and logging out."""

    extension_type = "UserMenuLink"
