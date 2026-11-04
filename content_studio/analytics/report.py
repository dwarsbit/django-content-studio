"""
The reports behind the analytics page, the Analytics component and the
analytics widgets: the provider's answers as the frontend reads them.
"""

import logging
from typing import Optional
from urllib.parse import urlsplit

from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from ..settings import cs_settings
from ..utils import get_tenant_scoped_queryset
from .providers import (
    BREAKDOWNS,
    METRICS,
    PAGE_BREAKDOWNS,
    AnalyticsError,
    AnalyticsQuery,
)
from .ranges import InvalidRange, get_query

logger = logging.getLogger(__name__)

PARTS = ("summary", "timeseries", "breakdown", "realtime")

# The most rows one breakdown request returns.
MAX_LIMIT = 50


def normalize_path(value) -> Optional[str]:
    """A page path from a path or a full URL: "/blog/hello/"."""
    if not value:
        return None

    path = urlsplit(str(value)).path or "/"
    return path if path.startswith("/") else f"/{path}"


def range_data(query: AnalyticsQuery) -> dict:
    return {
        "start": query.start.isoformat(),
        "end": query.end.isoformat(),
        "interval": query.interval,
    }


def summary_data(analytics, request, query: AnalyticsQuery) -> dict:
    summary = analytics.get_summary(request, query)

    return {
        "metrics": [
            {
                "key": key,
                "value": summary[key].value,
                "previous": summary[key].previous,
            }
            for key in analytics.get_metrics()
            if key in summary
        ],
    }


def timeseries_data(analytics, request, query: AnalyticsQuery, metric: str) -> dict:
    if metric not in analytics.provider.timeseries_metrics or metric not in METRICS:
        raise NotFound()

    now = timezone.now()
    points = analytics.get_timeseries(request, query, metric)

    return {
        "metric": metric,
        "points": [
            {
                "date": point.date.isoformat(),
                "value": point.value,
                "previous": point.previous,
            }
            # Hours still to come today are left out, not drawn as zero.
            for point in points
            if point.date <= now
        ],
    }


def breakdown_data(
    analytics, request, query: AnalyticsQuery, dimension: str, limit: int
) -> dict:
    if dimension not in analytics.get_breakdowns():
        raise NotFound()

    rows = analytics.get_breakdown(request, query, dimension, limit)
    objects = (
        link_pages(request, [row.key for row in rows])
        if dimension in PAGE_BREAKDOWNS
        else {}
    )

    return {
        "dimension": dimension,
        "label": str(BREAKDOWNS[dimension]),
        "rows": [
            {
                "key": row.key,
                "label": row.label,
                "value": row.value,
                "object": objects.get(row.key),
                **({"extra": row.extra} if row.extra else {}),
            }
            for row in rows
        ],
    }


def link_pages(request, paths: list[str]) -> dict[str, dict]:
    """
    The objects behind page paths: for every studio with an Analytics
    component that can turn a path back into an object, the objects the
    request may see, as {"model", "id", "title"} by path.
    """
    from ..admin import iter_components
    from .components import Analytics

    site = cs_settings.ADMIN_SITE
    paths = [path for path in paths if path]
    found = {}

    for model, studio in site._registry.items():
        components = [c for c in iter_components(studio) if isinstance(c, Analytics)]

        if not components or not studio.has_view_permission(request):
            continue

        queryset = get_tenant_scoped_queryset(request, model)

        if getattr(studio, "soft_delete", ""):
            queryset = queryset.filter(**{f"{studio.soft_delete}__isnull": True})

        for component in components:
            missing = [path for path in paths if path not in found]

            if not missing:
                return found

            for path, obj in (
                component.get_objects(missing, queryset, request) or {}
            ).items():
                found[path] = {
                    "model": model._meta.label_lower,
                    "id": str(obj.pk),
                    "title": str(obj)[:200],
                }

    return found


def build_report(
    analytics, request, params, path: Optional[str] = None, parts=PARTS
) -> Response:
    """
    Answer one report request: part is summary, timeseries (with a
    metric), breakdown (with a dimension and a limit) or realtime; range,
    start and end pick the period.
    """
    part = params.get("part") or "summary"

    if part not in parts:
        raise NotFound()

    try:
        if part == "realtime":
            if not analytics.provider.implements("get_realtime"):
                raise NotFound()
            return Response({"visitors": analytics.get_realtime(request)})

        query = get_query(
            params.get("range") or "30d",
            start=params.get("start"),
            end=params.get("end"),
            path=path,
        )
        data = {"range": range_data(query), "path": path}

        if part == "summary":
            if not analytics.provider.implements("get_summary"):
                raise NotFound()
            data.update(summary_data(analytics, request, query))
            data["dashboard_url"] = analytics.get_dashboard_url(request, query)
        elif part == "timeseries":
            if not analytics.provider.implements("get_timeseries"):
                raise NotFound()
            data.update(
                timeseries_data(
                    analytics, request, query, params.get("metric") or "visitors"
                )
            )
        else:
            try:
                limit = min(max(int(params.get("limit") or 10), 1), MAX_LIMIT)
            except ValueError:
                limit = 10
            data.update(
                breakdown_data(
                    analytics, request, query, params.get("dimension") or "", limit
                )
            )

        return Response(data)
    except InvalidRange as error:
        return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)
    except AnalyticsError as error:
        logger.warning("Analytics provider failed: %s", error)
        return Response(
            {"detail": "unavailable", "provider": str(analytics.provider.name)},
            status=status.HTTP_502_BAD_GATEWAY,
        )
