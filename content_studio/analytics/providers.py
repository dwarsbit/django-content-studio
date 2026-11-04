"""
The provider interface: what an analytics tool reports to Content
Studio. Content Studio ships one for Umami (content_studio.analytics.umami);
for another tool, subclass AnalyticsProvider.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Optional

from django.utils.translation import gettext_lazy as _

__all__ = [
    "AnalyticsError",
    "AnalyticsProvider",
    "AnalyticsQuery",
    "BreakdownRow",
    "MetricValue",
    "TimeseriesPoint",
]


# The metrics Content Studio knows: their title, how they are shown
# (a count, a percentage or a duration in seconds) and whether a rise is
# good (1) or bad (-1).
METRICS = {
    "visitors": (_("Visitors"), "number", 1),
    "pageviews": (_("Pageviews"), "number", 1),
    "visits": (_("Visits"), "number", 1),
    "bounce_rate": (_("Bounce rate"), "percent", -1),
    "visit_duration": (_("Visit duration"), "duration", 1),
}

# The breakdowns Content Studio knows, in the groups the analytics page
# shows them in: each row counts visitors.
BREAKDOWNS = {
    "pages": _("Pages"),
    "entry_pages": _("Entry pages"),
    "exit_pages": _("Exit pages"),
    "referrers": _("Referrers"),
    "channels": _("Channels"),
    "campaigns": _("Campaigns"),
    "countries": _("Countries"),
    "regions": _("Regions"),
    "cities": _("Cities"),
    "devices": _("Devices"),
    "browsers": _("Browsers"),
    "os": _("Operating systems"),
}

# The breakdowns whose rows are pages of the site, so their rows can link
# to the objects they show.
PAGE_BREAKDOWNS = ("pages", "entry_pages", "exit_pages")

INTERVALS = ("hour", "day", "month")


class AnalyticsError(Exception):
    """
    The provider could not answer, such as when the analytics tool is
    down or rejects the credentials. The message is logged, never shown
    to editors, so it may name the cause.
    """


@dataclass(frozen=True)
class AnalyticsQuery:
    """
    The period a report covers: from start up to (not including) end, in
    the site's timezone, counted per interval ("hour", "day" or
    "month"). path limits the report to one page of the site, such as
    "/blog/hello-world/".
    """

    start: datetime
    end: datetime
    interval: str
    timezone: tzinfo
    path: Optional[str] = None

    @property
    def previous(self) -> "AnalyticsQuery":
        """The period of the same length that ends where this one starts."""
        length = self.end - self.start

        return AnalyticsQuery(
            start=self.start - length,
            end=self.start,
            interval=self.interval,
            timezone=self.timezone,
            path=self.path,
        )

    @property
    def timezone_name(self) -> str:
        return getattr(self.timezone, "key", None) or str(self.timezone)

    def buckets(self) -> list[datetime]:
        """The start of every interval in the period, in its timezone."""
        current = self.start.astimezone(self.timezone)

        if self.interval == "hour":
            current = current.replace(minute=0, second=0, microsecond=0)
        elif self.interval == "day":
            current = current.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            current = current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        buckets = []

        while current < self.end:
            buckets.append(current)
            current = next_bucket(current, self.interval)

        return buckets


def next_bucket(value: datetime, interval: str) -> datetime:
    """The start of the interval after value's, keeping its wall time."""
    if interval == "hour":
        # Step in UTC, so an hour is an hour across DST changes.
        tz = value.tzinfo
        return (value.astimezone(timezone.utc) + timedelta(hours=1)).astimezone(tz)

    if interval == "day":
        naive = value.replace(tzinfo=None) + timedelta(days=1)
    else:
        year, month = divmod(value.month, 12)
        naive = value.replace(tzinfo=None, year=value.year + year, month=month + 1)

    return naive.replace(tzinfo=value.tzinfo)


@dataclass
class MetricValue:
    """
    One metric over a period: bounce_rate in percent (0 to 100),
    visit_duration in seconds, the others as counts. previous is the
    same metric over the period before, or None when unknown.
    """

    value: float
    previous: Optional[float] = None


@dataclass
class TimeseriesPoint:
    """One interval of a time series: its start, the value and the value
    of the matching interval in the period before."""

    date: datetime
    value: float
    previous: Optional[float] = None


@dataclass
class BreakdownRow:
    """
    One row of a breakdown: key is the raw value (a path, a domain, an
    ISO country code, a device type), label how to show it, and value
    the number of visitors.
    """

    key: str
    value: float
    label: Optional[str] = None
    extra: dict = field(default_factory=dict)


class AnalyticsProvider:
    """
    Reports a website's statistics from an analytics tool. Subclass it
    for your tool and implement the methods it supports:

    - get_summary(request, query): a dict from metric key to a
      MetricValue, for the keys in `metrics`.
    - get_timeseries(request, query, metric): a list of TimeseriesPoint,
      one per interval of the query, for the keys in `timeseries_metrics`.
    - get_breakdown(request, query, dimension, limit): at most `limit`
      BreakdownRow, the largest first, for the keys in `breakdowns`.
    - get_realtime(request): the number of visitors on the site now.
    - get_dashboard_url(request, query): the URL of the website's report
      in the tool, for "Open in ...".

    The analytics page and components leave out what a provider does
    not implement. Every method gets the request, so a provider can show
    each tenant its own website; override get_cache_key(request) too
    when it does.
    """

    # The tool's name, as editors see it: "Open in Umami".
    name: str = "Analytics"
    # The metrics get_summary reports, in the order they show.
    metrics: tuple[str, ...] = ()
    # The metrics get_timeseries can chart.
    timeseries_metrics: tuple[str, ...] = ()
    # The breakdowns get_breakdown reports.
    breakdowns: tuple[str, ...] = ()

    def get_cache_key(self, request) -> str:
        """
        What sets one website's statistics apart from another's in the
        cache. The class by default; include the website's ID when one
        provider serves several, such as one per tenant.
        """
        return f"{self.__class__.__module__}.{self.__class__.__qualname__}"

    def get_summary(self, request, query: AnalyticsQuery) -> dict[str, MetricValue]:
        raise NotImplementedError

    def get_timeseries(
        self, request, query: AnalyticsQuery, metric: str
    ) -> list[TimeseriesPoint]:
        raise NotImplementedError

    def get_breakdown(
        self, request, query: AnalyticsQuery, dimension: str, limit: int
    ) -> list[BreakdownRow]:
        raise NotImplementedError

    def get_realtime(self, request) -> Optional[int]:
        raise NotImplementedError

    def get_dashboard_url(self, request, query: AnalyticsQuery) -> Optional[str]:
        return None

    def check(self) -> list[tuple[str, str]]:
        """
        Problems with the provider's setup, as (check id, message) pairs
        that the system checks report as warnings. None by default.
        """
        return []

    def implements(self, method: str) -> bool:
        """Whether the provider overrides one of the methods above."""
        return getattr(type(self), method) is not getattr(AnalyticsProvider, method)
