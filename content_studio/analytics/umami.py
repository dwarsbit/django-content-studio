"""
The Umami provider: statistics from Umami Cloud or a self-hosted Umami,
read with an API key.

    UmamiProvider(
        website_id="2f1c...",
        api_key=os.environ["UMAMI_API_KEY"],
        url="https://analytics.example.com",  # leave out for Umami Cloud
    )
"""

import json
import logging
from datetime import datetime
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from .providers import (
    AnalyticsError,
    AnalyticsProvider,
    AnalyticsQuery,
    BreakdownRow,
    MetricValue,
    TimeseriesPoint,
)

__all__ = ["UmamiProvider"]

logger = logging.getLogger(__name__)

CLOUD_API_URL = "https://api.umami.is/v1"

# Content Studio's breakdowns and the Umami metric type behind each.
BREAKDOWN_TYPES = {
    "pages": "path",
    "entry_pages": "entry",
    "exit_pages": "exit",
    "referrers": "referrer",
    "channels": "channel",
    "campaigns": "utmCampaign",
    "countries": "country",
    "regions": "region",
    "cities": "city",
    "devices": "device",
    "browsers": "browser",
    "os": "os",
}


class UmamiProvider(AnalyticsProvider):
    """
    Statistics of one Umami website. url is the address of a self-hosted
    Umami (its API is under /api); leave it out for Umami Cloud. The API
    key is sent as Umami expects: in x-umami-api-key to Umami Cloud, as
    a bearer token to a self-hosted Umami. dashboard_url is the page
    "Open in Umami" goes to; the website's page on a self-hosted Umami
    by default.

    For a website per tenant, subclass it and override
    get_website_id(request).
    """

    name = "Umami"
    metrics = ("visitors", "pageviews", "visits", "bounce_rate", "visit_duration")
    timeseries_metrics = ("visitors", "pageviews")
    breakdowns = tuple(BREAKDOWN_TYPES)
    # Seconds to wait for Umami.
    timeout = 5

    def __init__(
        self,
        website_id: str = None,
        api_key: str = None,
        url: str = None,
        dashboard_url: str = None,
    ):
        self.website_id = website_id
        self.api_key = api_key
        self.url = (url or CLOUD_API_URL).rstrip("/")
        self.dashboard_url = dashboard_url

    @property
    def is_cloud(self) -> bool:
        return urlsplit(self.url).hostname == urlsplit(CLOUD_API_URL).hostname

    @property
    def api_url(self) -> str:
        return self.url if self.is_cloud else f"{self.url}/api"

    def get_website_id(self, request) -> Optional[str]:
        return self.website_id

    def get_cache_key(self, request) -> str:
        return f"umami:{self.url}:{self.get_website_id(request)}"

    # The requests.

    def request(self, request, endpoint: str, params: dict = None):
        """GET one of the website's endpoints and return the JSON."""
        website_id = self.get_website_id(request)

        if not website_id or not self.api_key:
            raise AnalyticsError("UmamiProvider needs a website_id and an api_key.")

        url = f"{self.api_url}/websites/{website_id}/{endpoint}"

        if params:
            url = f"{url}?{urlencode(params)}"

        headers = {"Accept": "application/json", "User-Agent": "django-content-studio"}

        if self.is_cloud:
            headers["x-umami-api-key"] = self.api_key
        else:
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            with urlopen(
                Request(url, headers=headers), timeout=self.timeout
            ) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            raise AnalyticsError(
                f"Umami answered {error.code} for {endpoint}."
            ) from error
        except (URLError, TimeoutError, OSError) as error:
            raise AnalyticsError(f"Umami could not be reached: {error}.") from error
        except ValueError as error:
            raise AnalyticsError(f"Umami sent no JSON for {endpoint}.") from error

    def query_params(self, query: AnalyticsQuery) -> dict:
        params = {
            # Umami includes the end; ours is the first moment after.
            "startAt": int(query.start.timestamp() * 1000),
            "endAt": int(query.end.timestamp() * 1000) - 1,
            "timezone": query.timezone_name,
        }

        if query.path:
            params["path"] = query.path

        return params

    # The provider interface.

    def get_summary(self, request, query):
        data = self.request(request, "stats", self.query_params(query))
        current = derive_metrics(stats_values(data))
        comparison = data.get("comparison")

        if isinstance(comparison, dict):
            previous = derive_metrics(stats_values(comparison))
        else:
            # Older Umami versions send {"pageviews": {"value", "prev"}}.
            old = {
                key: value["prev"]
                for key, value in data.items()
                if isinstance(value, dict) and "prev" in value
            }
            previous = derive_metrics(stats_values(old)) if old else {}

        return {
            key: MetricValue(value=value, previous=previous.get(key))
            for key, value in current.items()
        }

    def get_timeseries(self, request, query, metric):
        params = {**self.query_params(query), "unit": query.interval, "compare": "prev"}
        data = self.request(request, "pageviews", params)
        series = "sessions" if metric == "visitors" else "pageviews"
        current = bucket_values(data.get(series) or [], query.interval)
        compare = data.get("compare") or {}
        previous = bucket_values(compare.get(series) or [], query.interval)
        previous_buckets = query.previous.buckets()

        points = []

        for index, bucket in enumerate(query.buckets()):
            before = (
                previous.get(bucket_key(previous_buckets[index], query.interval), 0)
                if index < len(previous_buckets)
                else None
            )
            points.append(
                TimeseriesPoint(
                    date=bucket,
                    value=current.get(bucket_key(bucket, query.interval), 0),
                    previous=before,
                )
            )

        return points

    def get_breakdown(self, request, query, dimension, limit):
        params = {
            **self.query_params(query),
            "type": BREAKDOWN_TYPES[dimension],
            "limit": limit,
        }
        data = self.request(request, "metrics", params)

        return [
            BreakdownRow(key=str(row.get("x") or ""), value=number(row.get("y")))
            for row in data or []
            if isinstance(row, dict)
        ][:limit]

    def get_realtime(self, request):
        data = self.request(request, "active")

        # {"visitors": 3}; older versions send {"x": 3} or [{"x": 3}].
        if isinstance(data, list):
            data = data[0] if data else {}
        if isinstance(data, dict):
            return int(number(data.get("visitors", data.get("x"))))
        return int(number(data))

    def get_dashboard_url(self, request, query):
        if self.dashboard_url:
            return self.dashboard_url
        if self.is_cloud:
            return None
        return f"{self.url}/websites/{self.get_website_id(request)}"

    def check(self):
        warnings = []

        if not self.api_key:
            warnings.append(
                ("content_studio.W023", "UmamiProvider has no api_key; set one.")
            )
        if (
            not self.website_id
            and type(self).get_website_id is UmamiProvider.get_website_id
        ):
            warnings.append(
                ("content_studio.W023", "UmamiProvider has no website_id; set one.")
            )

        return warnings


def number(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def stats_values(data: dict) -> dict[str, float]:
    """The raw numbers of a stats response, of any Umami version."""
    values = {}

    for key in ("pageviews", "visitors", "visits", "bounces", "totaltime", "uniques"):
        value = data.get(key)

        if isinstance(value, dict):
            value = value.get("value")
        if value is not None:
            values["visitors" if key == "uniques" else key] = number(value)

    return values


def derive_metrics(values: dict[str, float]) -> dict[str, float]:
    """Content Studio's metrics from Umami's numbers."""
    visits = values.get("visits") or 0
    metrics = {
        "visitors": values.get("visitors", 0),
        "pageviews": values.get("pageviews", 0),
    }

    if "visits" in values:
        metrics["visits"] = visits
        metrics["bounce_rate"] = (
            round(min(values.get("bounces", 0), visits) / visits * 100, 1)
            if visits
            else 0
        )
        metrics["visit_duration"] = (
            round(values.get("totaltime", 0) / visits) if visits else 0
        )

    return metrics


def parse_bucket(value: str) -> Optional[datetime]:
    """A bucket's wall time: "2026-10-06T00:00:00Z" or "2026-10-06 00:00:00"."""
    text = str(value)[:19].replace("T", " ")

    for pattern in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y-%m"):
        try:
            return datetime.strptime(text, pattern)
        except ValueError:
            continue

    return None


def bucket_key(value: datetime, interval: str) -> str:
    if interval == "hour":
        return value.strftime("%Y-%m-%d %H")
    if interval == "day":
        return value.strftime("%Y-%m-%d")
    return value.strftime("%Y-%m")


def bucket_values(rows: list, interval: str) -> dict[str, float]:
    """A series of {x, y} rows by bucket key; Umami leaves out empty ones."""
    values = {}

    for row in rows:
        if not isinstance(row, dict):
            continue
        moment = parse_bucket(row.get("x", ""))
        if moment is not None:
            key = bucket_key(moment, interval)
            values[key] = values.get(key, 0) + number(row.get("y"))

    return values
