"""
The periods editors pick a report for: presets counted back from today
in the site's timezone, or a custom range of dates.
"""

from datetime import date, datetime, time, timedelta
from typing import Optional

from django.utils import timezone

from .providers import AnalyticsQuery

# The presets: their key and the number of days they cover (today
# included); "12mo" covers this month and the eleven before.
PRESETS = {
    "today": 1,
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "12mo": None,
}

# The longest custom range, so one request cannot ask for decades.
MAX_CUSTOM_DAYS = 3 * 366


class InvalidRange(ValueError):
    pass


def parse_date(value: Optional[str]) -> date:
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        raise InvalidRange(f"Not a date: {value!r}; use YYYY-MM-DD.")


def interval_for(days: int) -> str:
    """Hours for a day or two, days up to about four months, then months."""
    if days <= 2:
        return "hour"
    if days <= 120:
        return "day"
    return "month"


def get_query(
    range_key: str,
    start: Optional[str] = None,
    end: Optional[str] = None,
    path: Optional[str] = None,
    now: Optional[datetime] = None,
) -> AnalyticsQuery:
    """
    The query for a range: a preset key ("today", "7d", "30d", "90d",
    "12mo") or "custom" with start and end dates (both included).
    """
    tz = timezone.get_current_timezone()
    today = timezone.localtime(now or timezone.now(), tz).date()

    def midnight(day: date) -> datetime:
        return datetime.combine(day, time.min, tzinfo=tz)

    if range_key == "custom":
        first, last = parse_date(start), parse_date(end)

        if last < first:
            raise InvalidRange("The range ends before it starts.")
        if (last - first).days + 1 > MAX_CUSTOM_DAYS:
            raise InvalidRange(f"A range covers at most {MAX_CUSTOM_DAYS} days.")

        days = (last - first).days + 1
        return AnalyticsQuery(
            start=midnight(first),
            end=midnight(last + timedelta(days=1)),
            interval=interval_for(days),
            timezone=tz,
            path=path,
        )

    if range_key not in PRESETS:
        raise InvalidRange(
            f"Unknown range {range_key!r}; choose from "
            f"{', '.join([*PRESETS, 'custom'])}."
        )

    end_at = midnight(today + timedelta(days=1))

    if range_key == "12mo":
        month, year = today.month - 11, today.year
        if month < 1:
            month, year = month + 12, year - 1

        return AnalyticsQuery(
            start=midnight(date(year, month, 1)),
            end=end_at,
            interval="month",
            timezone=tz,
            path=path,
        )

    days = PRESETS[range_key]
    return AnalyticsQuery(
        start=midnight(today - timedelta(days=days - 1)),
        end=end_at,
        interval=interval_for(days),
        timezone=tz,
        path=path,
    )
