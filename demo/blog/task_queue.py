"""
A made-up task backend for the demo's task dashboard: an adapter that
reports fixed numbers and tasks, so the page shows without a queue.
A real project writes an adapter for its own backend instead.
"""

from datetime import timedelta

from django.utils import timezone

from content_studio.dashboard.tasks import (
    TaskAdapter,
    TaskRow,
    TaskStatistic,
    TaskStatus,
)


class DemoTaskAdapter(TaskAdapter):
    statistics = ("queued", "running", "succeeded", "failed")

    def get_statistics(self, request):
        return {
            "queued": TaskStatistic(3),
            "running": TaskStatistic(1),
            "succeeded": TaskStatistic(128, trend=4.2),
            "failed": TaskStatistic(2, trend=-50),
        }

    def get_periodic_tasks(self, request):
        now = timezone.now()
        return [
            TaskRow(
                title="Publish scheduled articles",
                description="Every 5 minutes",
                status=TaskStatus.SUCCESS,
                last_run_at=now - timedelta(minutes=2),
                next_run_at=now + timedelta(minutes=3),
                duration=1,
            ),
            TaskRow(
                title="Rebuild the sitemap",
                description="Every hour",
                status=TaskStatus.RUNNING,
                last_run_at=now - timedelta(seconds=20),
            ),
            TaskRow(
                title="Send the newsletter",
                description="Mondays at 08:00",
                status=TaskStatus.FAILURE,
                last_run_at=now - timedelta(days=1),
                next_run_at=now + timedelta(days=6),
                duration=12,
                error_message="SMTP server refused the connection",
            ),
        ]

    def get_recent_tasks(self, request, limit):
        now = timezone.now()
        return [
            TaskRow(
                title="Deliver webhook",
                description="Netlify deploy",
                status=TaskStatus.SUCCESS,
                last_run_at=now - timedelta(minutes=minutes),
                duration=0,
            )
            for minutes in range(1, limit + 1)
        ][:limit]
