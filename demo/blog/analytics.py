"""
A made-up analytics provider for the demo: steady, believable numbers
derived from the date and the page, so the analytics page and the
Analytics component show without an analytics account. A real project
uses UmamiProvider (or its own provider) instead.
"""

import math
import random
from datetime import timedelta
from zlib import crc32

from content_studio.analytics import (
    AnalyticsProvider,
    BreakdownRow,
    MetricValue,
    TimeseriesPoint,
)

from .models import Article

REFERRERS = [
    ("google.com", 0.42),
    ("news.ycombinator.com", 0.12),
    ("duckduckgo.com", 0.08),
    ("mastodon.social", 0.05),
    ("bing.com", 0.04),
    ("linkedin.com", 0.03),
]
CHANNELS = [
    ("organic", 0.5),
    ("direct", 0.26),
    ("referral", 0.15),
    ("social", 0.09),
]
COUNTRIES = [
    ("NL", 0.31),
    ("DE", 0.17),
    ("US", 0.14),
    ("BE", 0.09),
    ("GB", 0.07),
    ("FR", 0.05),
    ("SE", 0.03),
]
CITIES = [
    ("Amsterdam", 0.14),
    ("Rotterdam", 0.08),
    ("Berlin", 0.07),
    ("Utrecht", 0.06),
    ("Antwerp", 0.05),
]
DEVICES = [("desktop", 0.55), ("mobile", 0.38), ("tablet", 0.07)]
BROWSERS = [
    ("chrome", 0.48),
    ("safari", 0.27),
    ("firefox", 0.12),
    ("edge", 0.09),
    ("samsung", 0.04),
]
SYSTEMS = [
    ("Mac OS", 0.31),
    ("Windows 10", 0.27),
    ("iOS", 0.2),
    ("Android OS", 0.17),
    ("Linux", 0.05),
]
SHARES = {
    "referrers": REFERRERS,
    "channels": CHANNELS,
    "countries": COUNTRIES,
    "cities": CITIES,
    "devices": DEVICES,
    "browsers": BROWSERS,
    "os": SYSTEMS,
}


def daily_visitors(day, path=None):
    """Visitors on a day: a weekly rhythm, slow growth and some noise."""
    seed = crc32(f"{day.isoformat()}:{path or ''}".encode())
    noise = random.Random(seed).uniform(0.85, 1.15)
    weekday = (1.0, 1.08, 1.05, 1.02, 0.94, 0.7, 0.66)[day.weekday()]
    growth = 1 + (day.toordinal() % 365) / 900
    scale = 1 if path is None else 0.04 + (crc32(path.encode()) % 100) / 900
    return max(0, round(820 * weekday * growth * noise * scale))


class DemoAnalyticsProvider(AnalyticsProvider):
    name = "Umami"
    metrics = ("visitors", "pageviews", "visits", "bounce_rate", "visit_duration")
    timeseries_metrics = ("visitors", "pageviews")
    breakdowns = (
        "pages",
        "entry_pages",
        "exit_pages",
        "referrers",
        "channels",
        "countries",
        "cities",
        "devices",
        "browsers",
        "os",
    )

    def totals(self, query):
        day, total = query.start, 0
        while day < query.end:
            total += daily_visitors(day.date(), query.path)
            day += timedelta(days=1)
        return total

    def get_summary(self, request, query):
        summary = {}
        for period, key in ((query, "value"), (query.previous, "previous")):
            visitors = self.totals(period)
            visits = round(visitors * 1.24)
            jitter = (crc32(f"{period.start}{period.path}".encode()) % 40) / 10
            values = {
                "visitors": visitors,
                "pageviews": round(visits * 2.7),
                "visits": visits,
                "bounce_rate": round(44 + jitter, 1),
                "visit_duration": round(128 + jitter * 9),
            }
            for metric, value in values.items():
                summary.setdefault(metric, MetricValue(0))
                setattr(summary[metric], key, value)
        return summary

    def series(self, query, metric):
        points = []
        for bucket in query.buckets():
            day = bucket.date()
            visitors = daily_visitors(day, query.path)
            if query.interval == "hour":
                curve = 0.3 + 0.7 * math.sin(math.pi * bucket.hour / 24) ** 2
                visitors = round(visitors / 14 * curve)
            elif query.interval == "month":
                visitors = visitors * 30
            points.append(round(visitors * (3.3 if metric == "pageviews" else 1)))
        return points

    def get_timeseries(self, request, query, metric):
        current = self.series(query, metric)
        previous = self.series(query.previous, metric)
        return [
            TimeseriesPoint(date=bucket, value=value, previous=before)
            for bucket, value, before in zip(query.buckets(), current, previous)
        ]

    def get_breakdown(self, request, query, dimension, limit):
        total = self.totals(query)

        if dimension in ("pages", "entry_pages", "exit_pages"):
            if query.path:
                return [BreakdownRow(key=query.path, value=total)]
            rows = [("/", 0.24)]
            for i, pk in enumerate(
                Article.objects.order_by("-pk").values_list("pk", flat=True)[:12]
            ):
                rows.append((f"/articles/{pk}/", 0.14 / (i + 1.4)))
            rows.append(("/about/", 0.03))
            shares = rows
        else:
            shares = SHARES[dimension]

        result = [
            BreakdownRow(key=key, value=round(total * share)) for key, share in shares
        ]
        result.sort(key=lambda row: -row.value)
        return result[:limit]

    def get_realtime(self, request):
        return 7

    def get_dashboard_url(self, request, query):
        return "https://umami.example.com/websites/demo"
