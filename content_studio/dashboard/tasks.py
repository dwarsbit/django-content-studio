"""
A task dashboard that works with any task backend: an adapter reports
the statistics and tasks of the backend, and the widgets and the
TaskDashboard page show them. Content Studio ships one for Huey
(content_studio.contrib.huey); for another backend, subclass TaskAdapter.
"""

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from enum import StrEnum
from typing import Optional, Union

from django.utils.translation import gettext_lazy as _

from ..extensions import DashboardPage
from ..utils import derive_uuid
from . import Dashboard
from .scheduled_tasks import ScheduledTasksWidget, ScheduledTasksWidgetSerializer
from .statistic import StatisticWidget, StatisticWidgetSerializer

__all__ = [
    "TaskAdapter",
    "TaskDashboard",
    "TaskListWidget",
    "TaskRow",
    "TaskStatistic",
    "TaskStatisticWidget",
    "TaskStatus",
]


class TaskStatus(StrEnum):
    RUNNING = "RUNNING"
    SCHEDULED = "SCHEDULED"
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"


@dataclass
class TaskStatistic:
    """
    One number about the backend. trend is the change as a percentage,
    such as against the previous window, or None when unknown.
    """

    value: int
    trend: Optional[Union[Decimal, float]] = None


@dataclass
class TaskRow:
    """
    One task in a task list: a periodic task with its latest run, or one
    recent run. duration is in seconds; unknown values are None.
    """

    title: str
    status: TaskStatus
    description: str = ""
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    duration: Optional[int] = None
    error_message: Optional[str] = None


# The statistics a task dashboard knows: their title, whether they count
# over the adapter's window, and whether a rise is good (1) or bad (-1).
STATISTICS = {
    "queued": (_("Queued"), False, 0),
    "scheduled": (_("Scheduled"), False, 0),
    "running": (_("Running"), False, 0),
    "succeeded": (_("Succeeded"), True, 1),
    "failed": (_("Failed"), True, -1),
    "retried": (_("Retried"), True, -1),
}

# The task lists a task dashboard knows, with the adapter method that
# fills them, their title and their description.
TASK_LISTS = {
    "periodic": (
        "get_periodic_tasks",
        _("Periodic tasks"),
        _("Tasks that run on a schedule, with their latest run"),
    ),
    "recent": (
        "get_recent_tasks",
        _("Recent runs"),
        _("The latest tasks the workers ran"),
    ),
}


class TaskAdapter:
    """
    Reports a task backend's state to the task dashboard. Subclass it for
    your backend and implement the methods it supports:

    - get_statistics(request): a dict from statistic key to a
      TaskStatistic, for every key in `statistics`.
    - get_periodic_tasks(request): a list of TaskRow, one per periodic task.
    - get_recent_tasks(request, limit): a list of at most `limit` TaskRow,
      the latest first.

    A task dashboard leaves out the widgets of the methods an adapter
    does not implement. Every method gets the request, so an adapter can
    show each user or tenant their own tasks.
    """

    # The statistics the adapter reports, in the order they show. Keys
    # from: queued, scheduled, running, succeeded, failed, retried.
    statistics: tuple[str, ...] = ()
    # The period the succeeded, failed and retried counts cover.
    window: timedelta = timedelta(hours=24)

    def get_id(self) -> str:
        """
        The adapter's identity, part of its widgets' IDs. Override it when
        a site uses two adapters of the same class, such as two queues.
        """
        return f"{self.__class__.__module__}.{self.__class__.__qualname__}"

    def get_statistics(self, request) -> dict[str, TaskStatistic]:
        raise NotImplementedError

    def get_periodic_tasks(self, request) -> list[TaskRow]:
        raise NotImplementedError

    def get_recent_tasks(self, request, limit: int) -> list[TaskRow]:
        raise NotImplementedError

    def check(self) -> list[tuple[str, str]]:
        """
        Problems with the adapter's setup, as (check id, message) pairs
        that the system checks report as warnings. None by default.
        """
        return []

    def implements(self, method: str) -> bool:
        """Whether the adapter overrides one of the methods above."""
        return getattr(type(self), method) is not getattr(TaskAdapter, method)


def window_label(window: timedelta) -> str:
    """A short label for a window, such as "24h", "7d" or "15m"."""
    seconds = int(window.total_seconds())

    if seconds % 86400 == 0 and seconds > 86400:
        return f"{seconds // 86400}d"
    if seconds % 3600 == 0:
        return f"{seconds // 3600}h"
    return f"{max(seconds // 60, 1)}m"


class TaskStatisticWidget(StatisticWidget):
    """
    One statistic of a task adapter, such as the number of queued tasks.
    """

    name = "TaskStatisticWidget"
    refresh_interval = 10

    def __init__(self, adapter: TaskAdapter, statistic: str, widget_id=None):
        if statistic not in STATISTICS:
            raise ValueError(
                f"Unknown task statistic {statistic!r}; choose from "
                f"{', '.join(STATISTICS)}."
            )

        self.adapter = adapter
        self.statistic = statistic
        super().__init__(widget_id)

    def get_id_parts(self):
        return (self.name, self.adapter.get_id(), self.statistic)

    def get_title(self) -> str:
        title, windowed, _sign = STATISTICS[self.statistic]

        if windowed:
            return f"{title} ({window_label(self.adapter.window)})"
        return str(title)

    def get_data(self, request):
        statistic = self.adapter.get_statistics(request).get(self.statistic)
        value = statistic.value if statistic else 0
        trend = statistic.trend if statistic else None
        sign = STATISTICS[self.statistic][2]
        sentiment = "default"

        if trend and sign:
            sentiment = "positive" if trend * sign > 0 else "negative"

        return StatisticWidgetSerializer(
            data={
                "title": self.get_title(),
                "value": value,
                "trend": None if trend is None else round(Decimal(str(trend)), 1),
                "trend_sentiment": sentiment,
            }
        )


class TaskListWidget(ScheduledTasksWidget):
    """
    A list of tasks from a task adapter: its periodic tasks ("periodic")
    or its latest runs ("recent", at most `limit`).
    """

    name = "TaskListWidget"

    def __init__(
        self,
        adapter: TaskAdapter,
        kind: str,
        title=None,
        description=None,
        limit: int = 20,
        widget_id=None,
    ):
        if kind not in TASK_LISTS:
            raise ValueError(
                f"Unknown task list {kind!r}; choose from {', '.join(TASK_LISTS)}."
            )

        self.adapter = adapter
        self.kind = kind
        self.title = title or TASK_LISTS[kind][1]
        self.description = description or TASK_LISTS[kind][2]
        self.limit = limit
        super().__init__(widget_id)

    def get_id_parts(self):
        return (self.name, self.adapter.get_id(), self.kind)

    def get_tasks(self, request) -> list[TaskRow]:
        if self.kind == "recent":
            return self.adapter.get_recent_tasks(request, self.limit)[: self.limit]
        return self.adapter.get_periodic_tasks(request)

    def get_data(self, request):
        return ScheduledTasksWidgetSerializer(
            data={
                "title": str(self.title),
                "description": str(self.description),
                "tasks": [asdict(task) for task in self.get_tasks(request)],
            }
        )


class TaskDashboard(DashboardPage):
    """
    A page with the state of a task backend: a statistic per key in the
    adapter's `statistics`, then its periodic tasks and its latest runs.
    Lists the adapter does not implement are left out.

        class StudioSite(ContentStudioSite):
            extensions = [
                TaskDashboard(adapter=MyQueueAdapter()),
                UserMenuLink(url="/tasks/", label=_("Tasks")),
            ]

    Only superusers see the page; override is_visible(request) to show
    it to more users. Override get_widgets() to change the layout.
    """

    path = "tasks/"
    title = _("Tasks")

    def __init__(
        self,
        adapter: TaskAdapter = None,
        path: str = None,
        title: str = None,
        description: str = None,
        extension_id=None,
    ):
        if adapter is not None:
            self.adapter = adapter
        if getattr(self, "adapter", None) is None:
            raise ValueError("A task dashboard needs an adapter.")
        if path is not None:
            self.path = path

        super().__init__(
            title=title,
            dashboard=Dashboard(widgets=self.get_widgets()),
            description=description,
            extension_id=extension_id,
        )

    def get_widget_id(self, *parts):
        """
        Widget IDs derived from the page's path, so the same adapter can
        also feed widgets on the start page or on another task dashboard.
        """
        return derive_uuid(
            self.__class__.__module__, self.__class__.__qualname__, self.path, *parts
        )

    def get_widgets(self) -> list:
        adapter = self.adapter
        widgets = []

        if adapter.implements("get_statistics"):
            widgets += [
                TaskStatisticWidget(
                    adapter, key, widget_id=self.get_widget_id("statistic", key)
                )
                for key in adapter.statistics
            ]

        for kind, (method, _title, _description) in TASK_LISTS.items():
            if adapter.implements(method):
                widgets.append(
                    TaskListWidget(
                        adapter, kind, widget_id=self.get_widget_id("list", kind)
                    )
                )

        return widgets

    def is_visible(self, request) -> bool:
        return bool(request.user and request.user.is_superuser)
