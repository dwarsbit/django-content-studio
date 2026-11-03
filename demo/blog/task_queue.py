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
            "succeeded": TaskStatistic(1284, trend=4.2),
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
            TaskRow(
                title="Send the notification digest",
                description="Daily at 07:00",
                status=TaskStatus.SUCCESS,
                last_run_at=now - timedelta(hours=2),
                next_run_at=now + timedelta(hours=22),
                duration=6,
            ),
            TaskRow(
                title="Prune old notifications",
                description="Sundays at 03:00",
                status=TaskStatus.SUCCESS,
                last_run_at=now - timedelta(days=2),
                next_run_at=now + timedelta(days=5),
                duration=2,
            ),
        ]

    def get_recent_tasks(self, request, limit):
        now = timezone.now()
        runs = [
            ("Make image sizes", "Alpine dawn", TaskStatus.SUCCESS, 1, 2),
            ("Deliver webhook", "Netlify deploy", TaskStatus.SUCCESS, 3, 0),
            ("Purge CDN cache", "/travel/slow-train", TaskStatus.SUCCESS, 4, 1),
            ("Send notification digest", "38 recipients", TaskStatus.SUCCESS, 9, 6),
            ("Make image sizes", "Desert dunes", TaskStatus.SUCCESS, 14, 3),
            ("Import reader reviews", "Feedback form", TaskStatus.FAILURE, 22, 4),
            ("Deliver webhook", "Search index", TaskStatus.SUCCESS, 31, 0),
            ("Rebuild the sitemap", "212 URLs", TaskStatus.SUCCESS, 58, 7),
            ("Publish scheduled articles", "1 article", TaskStatus.SUCCESS, 63, 1),
            ("Purge CDN cache", "/design/", TaskStatus.SUCCESS, 75, 1),
        ]
        return [
            TaskRow(
                title=title,
                description=description,
                status=status,
                last_run_at=now - timedelta(minutes=minutes),
                duration=duration,
                error_message=(
                    "The feedback form API answered 503"
                    if status == TaskStatus.FAILURE
                    else None
                ),
            )
            for title, description, status, minutes, duration in runs
        ][:limit]
