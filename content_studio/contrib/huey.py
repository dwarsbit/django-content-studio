"""
A task adapter for Huey: the task dashboard shows a Huey queue's counts,
its periodic tasks and its latest runs.

The queue counts come from Huey's storage. Runs, durations and errors
come from Huey's stats app (huey.contrib.djhuey.stats), which records
what the workers do; without it, the dashboard shows the queued and
scheduled counts and the periodic tasks without their runs, and a
system check warns.
"""

from datetime import UTC, datetime, timedelta
from typing import Optional

from django.conf import settings
from django.utils.translation import gettext_lazy as _

from ..dashboard.tasks import TaskAdapter, TaskRow, TaskStatistic, TaskStatus

__all__ = [
    "HueyAdapter",
]

STATS_APP = "huey.contrib.djhuey.stats"

# Huey's signals for how one attempt at a task ended. Every outcome
# other than complete shows as a failure, with its reason as the message
# when the stats app records no error.
COMPLETE = "complete"
OUTCOMES = {
    "complete": None,
    "error": _("Failed"),
    "timeout": _("Timed out"),
    "interrupted": _("Interrupted"),
    "canceled": _("Canceled"),
    "revoked": _("Revoked"),
    "expired": _("Expired"),
    "locked": _("Locked"),
    "rate-limited": _("Rate-limited"),
}
RETRYING = "retrying"

# The Huey task that runs Django tasks enqueued through Huey's Django
# tasks backend, and the key of the record holding the task's path.
DJANGO_TASKS_SHIM = "djtasks.run"
DJANGO_TASK_RECORD = "djt.%s"

ALL_STATISTICS = ("queued", "scheduled", "running", "succeeded", "failed", "retried")

# How far ahead the next run of a periodic task is looked for.
NEXT_RUN_HORIZON = timedelta(days=7)


def stats_app_installed() -> bool:
    return any(
        app == STATS_APP or app.startswith(STATS_APP + ".")
        for app in settings.INSTALLED_APPS
    )


def from_timestamp(ts: Optional[float]) -> Optional[datetime]:
    return None if ts is None else datetime.fromtimestamp(ts, tz=UTC)


def seconds(duration: Optional[float]) -> Optional[int]:
    return None if duration is None else round(duration)


class HueyAdapter(TaskAdapter):
    """
    Reports a Huey queue to the task dashboard: djhuey's HUEY unless
    another Huey instance is given.

        TaskDashboard(adapter=HueyAdapter())

    `statistics` defaults to every statistic when Huey's stats app
    records the queue, and to queued and scheduled otherwise.
    """

    def __init__(self, huey=None, statistics: tuple[str, ...] = None, window=None):
        self._huey = huey
        self._statistics = None if statistics is None else tuple(statistics)
        if window is not None:
            self.window = window

    @property
    def huey(self):
        if self._huey is None:
            from huey.contrib.djhuey import HUEY

            return HUEY
        return self._huey

    @property
    def stats(self):
        """The stats app's recorder for the queue, or None."""
        return getattr(self.huey, "_stats", None)

    def has_stats(self) -> bool:
        """
        Whether Huey's stats app records the queue. Also answers before
        the stats app's ready() ran: djhuey's HUEY is recorded when the
        app is installed.
        """
        if self.stats is not None:
            return True
        return self._huey is None and stats_app_installed()

    @property
    def statistics(self) -> tuple[str, ...]:
        # The default depends on the stats app, so it is looked up when
        # read, unless given to the constructor.
        if self._statistics is not None:
            return self._statistics
        if self.has_stats():
            return ALL_STATISTICS
        return ("queued", "scheduled")

    @statistics.setter
    def statistics(self, value):
        self._statistics = tuple(value)

    def get_id(self) -> str:
        return f"{super().get_id()}.{self.huey.name}"

    def implements(self, method: str) -> bool:
        # Recent runs are only known through the stats app.
        if method == "get_recent_tasks" and not self.has_stats():
            return False
        return super().implements(method)

    def check(self) -> list[tuple[str, str]]:
        if self.has_stats():
            return []
        return [
            (
                "content_studio.W020",
                "The Huey task dashboard cannot show runs, durations or "
                f"errors; add {STATS_APP!r} to INSTALLED_APPS so Huey "
                "records them.",
            )
        ]

    # Statistics

    def get_statistics(self, request) -> dict[str, TaskStatistic]:
        huey = self.huey
        result = {
            "queued": TaskStatistic(huey.pending_count()),
            "scheduled": TaskStatistic(huey.scheduled_count()),
        }
        stats = self.stats

        if stats is not None:
            from huey.contrib.stats import HueyInflight

            counts = stats.window_counts(int(self.window.total_seconds()))
            failed = sum(
                n for signal, n in counts.items() if OUTCOMES.get(signal, None)
            )
            result.update(
                running=TaskStatistic(
                    HueyInflight.select()
                    .where(HueyInflight.queue == stats.name)
                    .count()
                ),
                succeeded=TaskStatistic(counts.get(COMPLETE, 0)),
                failed=TaskStatistic(failed),
                retried=TaskStatistic(counts.get(RETRYING, 0)),
            )

        return {key: value for key, value in result.items() if key in self.statistics}

    # Periodic tasks

    def get_task_description(self, task_class) -> str:
        """
        The description of a periodic task, as Huey cannot describe its
        schedule: the first line of its docstring, or its module.
        Override it to describe the schedules yourself.
        """
        doc = (task_class.__doc__ or "").strip()
        return doc.splitlines()[0] if doc else task_class.__module__

    def get_next_run(self, task_class, now: datetime = None) -> Optional[datetime]:
        """
        The next minute the consumer runs a periodic task, looked for up
        to NEXT_RUN_HORIZON ahead; None when it does not run in that time.
        """
        huey = self.huey
        if now is None:
            now = huey._get_timestamp()
        task = task_class()
        minute = now.replace(second=0, microsecond=0) + timedelta(minutes=1)

        for _i in range(int(NEXT_RUN_HORIZON.total_seconds() // 60)):
            if task.validate_datetime(minute):
                if huey.utc:
                    return minute.replace(tzinfo=UTC)
                return minute.astimezone()
            minute += timedelta(minutes=1)

        return None

    def get_periodic_tasks(self, request) -> list[TaskRow]:
        registry = self.huey._registry
        stats = self.stats
        inflight = {}

        if stats is not None:
            from huey.contrib.stats import HueyInflight

            for row in (
                HueyInflight.select()
                .where(HueyInflight.queue == stats.name)
                .order_by(HueyInflight.started)
            ):
                inflight.setdefault(row.task, row.started)

        rows = []
        for task_class in sorted(registry._periodic_tasks, key=lambda t: t.__name__):
            full_name = registry.task_to_string(task_class)
            last = self.get_last_outcome(full_name) if stats is not None else None
            row = TaskRow(
                title=task_class.__name__,
                description=self.get_task_description(task_class),
                status=TaskStatus.SCHEDULED,
                next_run_at=self.get_next_run(task_class),
            )

            if last is not None:
                row.status, row.error_message = self.get_outcome(last)
                row.last_run_at = from_timestamp(last.ts)
                row.duration = seconds(last.duration)

            if full_name in inflight:
                row.status = TaskStatus.RUNNING
                row.last_run_at = from_timestamp(inflight[full_name])
                row.duration = None
                row.error_message = None

            rows.append(row)

        return rows

    # Recent runs

    def get_last_outcome(self, full_name: str):
        """The latest recorded outcome of a task, or None."""
        from huey.contrib.stats import HueyEvent

        return (
            HueyEvent.select()
            .where(
                HueyEvent.queue == self.stats.name,
                HueyEvent.task == full_name,
                HueyEvent.signal.in_(list(OUTCOMES)),
            )
            .order_by(HueyEvent.ts.desc(), HueyEvent.id.desc())
            .first()
        )

    def get_outcome(self, event) -> tuple[TaskStatus, Optional[str]]:
        reason = OUTCOMES.get(event.signal)

        if reason is None:
            return TaskStatus.SUCCESS, None
        return TaskStatus.FAILURE, event.error or str(reason)

    def get_run_name(self, event) -> tuple[str, str]:
        """
        The title and description of a run: the task's name and module,
        or for a Django task run through Huey's Django tasks backend, the
        Django task's.
        """
        module, _sep, name = event.task.rpartition(".")

        if event.task.endswith("." + DJANGO_TASKS_SHIM):
            name, module = DJANGO_TASKS_SHIM, ""
            try:
                record = self.huey.get(DJANGO_TASK_RECORD % event.task_id, peek=True)
            except Exception:
                record = None

            if isinstance(record, dict) and record.get("task_path"):
                module, _sep, name = record["task_path"].rpartition(".")

        return name, module

    def get_recent_tasks(self, request, limit: int) -> list[TaskRow]:
        if self.stats is None:
            return []

        from huey.contrib.stats import HueyEvent

        events = (
            HueyEvent.select()
            .where(
                HueyEvent.queue == self.stats.name,
                HueyEvent.signal.in_(list(OUTCOMES)),
            )
            .order_by(HueyEvent.ts.desc(), HueyEvent.id.desc())
            .limit(limit)
        )
        rows = []

        for event in events:
            title, description = self.get_run_name(event)
            status, error = self.get_outcome(event)
            rows.append(
                TaskRow(
                    title=title,
                    description=description,
                    status=status,
                    last_run_at=from_timestamp(event.ts),
                    duration=seconds(event.duration),
                    error_message=error,
                )
            )

        return rows
