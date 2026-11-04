"""
Analytics on a dashboard: a metric as a statistic and the top pages as a
content list, read from the site's AnalyticsExtension.
"""

from decimal import Decimal

from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import NotFound

from ..dashboard.content_list import ContentListWidget, ContentListWidgetSerializer
from ..dashboard.statistic import StatisticWidget, StatisticWidgetSerializer
from .extensions import get_analytics, get_analytics_page
from .providers import METRICS, AnalyticsError
from .ranges import PRESETS, get_query
from .report import link_pages

__all__ = ["AnalyticsStatisticWidget", "AnalyticsTopPagesWidget"]

RANGE_LABELS = {
    "today": _("today"),
    "7d": _("last 7 days"),
    "30d": _("last 30 days"),
    "90d": _("last 90 days"),
    "12mo": _("last 12 months"),
}


def visible_analytics(request):
    analytics = get_analytics()

    if analytics is None or not analytics.is_visible(request):
        raise NotFound()

    return analytics


def check_range(range_key):
    if range_key not in PRESETS:
        raise ValueError(
            f"Unknown analytics range {range_key!r}; choose from {', '.join(PRESETS)}."
        )


class AnalyticsStatisticWidget(StatisticWidget):
    """
    One metric of the site, such as its visitors over the last 30 days,
    with the change against the period before and a sparkline when the
    provider charts the metric.
    """

    name = "AnalyticsStatisticWidget"
    refresh_interval = 300

    def __init__(self, metric="visitors", range="30d", title=None, widget_id=None):
        if metric not in METRICS:
            raise ValueError(
                f"Unknown analytics metric {metric!r}; choose from {', '.join(METRICS)}."
            )
        check_range(range)

        self.metric = metric
        self.range = range
        self.title = title
        super().__init__(widget_id)

    def get_id_parts(self):
        return (self.name, self.metric, self.range)

    def get_data(self, request):
        analytics = visible_analytics(request)
        label, kind, sign = METRICS[self.metric]
        query = get_query(self.range)
        data = {
            "title": str(self.title or label),
            "value": 0,
            "footnote": str(RANGE_LABELS[self.range]).capitalize(),
        }

        try:
            metric = analytics.get_summary(request, query).get(self.metric)
            series = []

            if (
                self.metric in analytics.provider.timeseries_metrics
                and analytics.provider.implements("get_timeseries")
            ):
                series = [
                    point.value
                    for point in analytics.get_timeseries(request, query, self.metric)
                ]
        except AnalyticsError:
            data["footnote"] = str(_("Analytics are unavailable"))
            return StatisticWidgetSerializer(data=data)

        if metric is not None:
            data["value"] = round(metric.value, 1)

            if metric.previous:
                trend = (metric.value - metric.previous) / metric.previous * 100
                data["trend"] = round(Decimal(str(trend)), 1)
                data["trend_sentiment"] = "positive" if trend * sign > 0 else "negative"
                data["trend_label"] = str(_("vs. the period before"))

        if kind == "percent":
            data["suffix"] = "%"
            data["number_format"] = "full"
        elif kind == "duration":
            data["suffix"] = " s"
            data["number_format"] = "full"

        if len(series) > 1:
            data["series"] = series[-365:]

        return StatisticWidgetSerializer(data=data)


class AnalyticsTopPagesWidget(ContentListWidget):
    """
    The site's most visited pages over a range, with their visitors.
    Pages a studio's Analytics component can match link to their object.
    """

    name = "AnalyticsTopPagesWidget"
    refresh_interval = 300

    def __init__(self, range="30d", limit=5, title=None, widget_id=None):
        check_range(range)
        self.range = range
        self.limit = limit
        self.title = title
        super().__init__(widget_id)

    def get_id_parts(self):
        return (self.name, self.range)

    def get_data(self, request):
        analytics = visible_analytics(request)
        page = get_analytics_page()
        data = {
            "title": str(self.title or _("Top pages")),
            "description": str(RANGE_LABELS[self.range]).capitalize(),
            "view_all": f"/{page.path.strip('/')}/" if page else "",
            "content": [],
        }

        if "pages" not in analytics.get_breakdowns():
            return ContentListWidgetSerializer(data=data)

        try:
            rows = analytics.get_breakdown(
                request, get_query(self.range), "pages", self.limit
            )
        except AnalyticsError:
            data["description"] = str(_("Analytics are unavailable"))
            return ContentListWidgetSerializer(data=data)

        objects = link_pages(request, [row.key for row in rows])

        for row in rows:
            obj = objects.get(row.key)
            data["content"].append(
                {
                    "model": obj["model"] if obj else "",
                    "id": obj["id"] if obj else "",
                    "title": obj["title"] if obj else (row.label or row.key or "/"),
                    "description": row.key if obj else "",
                    "value": row.value,
                }
            )

        return ContentListWidgetSerializer(data=data)
