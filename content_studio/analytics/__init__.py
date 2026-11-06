"""
Analytics in the admin, from any analytics tool: an AnalyticsExtension
connects a provider (Umami ships with Content Studio), AnalyticsPage
and its links show the site's report, the Analytics component an
object's, and the analytics widgets put numbers on a dashboard.
"""

from .components import Analytics
from .extensions import (
    AnalyticsExtension,
    AnalyticsLink,
    AnalyticsPage,
    AnalyticsUserMenuLink,
    get_analytics,
)
from .providers import (
    AnalyticsError,
    AnalyticsProvider,
    AnalyticsQuery,
    BreakdownRow,
    MetricValue,
    TimeseriesPoint,
)
from .umami import UmamiProvider
from .widgets import AnalyticsStatisticWidget, AnalyticsTopPagesWidget

__all__ = [
    "Analytics",
    "AnalyticsError",
    "AnalyticsExtension",
    "AnalyticsLink",
    "AnalyticsPage",
    "AnalyticsProvider",
    "AnalyticsQuery",
    "AnalyticsStatisticWidget",
    "AnalyticsTopPagesWidget",
    "AnalyticsUserMenuLink",
    "BreakdownRow",
    "MetricValue",
    "TimeseriesPoint",
    "UmamiProvider",
    "get_analytics",
]
