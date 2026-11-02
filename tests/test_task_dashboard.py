"""
Tests for the backend-agnostic task dashboard: the adapter contract,
the widgets built from it, the TaskDashboard page and its visibility.
"""

from datetime import datetime, timedelta, timezone

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIRequestFactory, force_authenticate

from content_studio.admin import admin_site
from content_studio.checks import dashboard_page_errors, duplicate_id_errors
from content_studio.dashboard import Dashboard, DashboardViewSet
from content_studio.dashboard.tasks import (
    TaskAdapter,
    TaskDashboard,
    TaskListWidget,
    TaskRow,
    TaskStatistic,
    TaskStatisticWidget,
    TaskStatus,
)

RAN_AT = datetime(2026, 11, 2, 10, 0, tzinfo=timezone.utc)


class FullAdapter(TaskAdapter):
    statistics = ("queued", "succeeded", "failed")

    def get_statistics(self, request):
        return {
            "queued": TaskStatistic(4),
            "succeeded": TaskStatistic(120, trend=12.34),
            "failed": TaskStatistic(3, trend=50),
        }

    def get_periodic_tasks(self, request):
        return [
            TaskRow(
                title="Clean up",
                status=TaskStatus.FAILURE,
                description="Every hour",
                last_run_at=RAN_AT,
                next_run_at=RAN_AT + timedelta(hours=1),
                duration=3,
                error_message="Boom",
            )
        ]

    def get_recent_tasks(self, request, limit):
        return [TaskRow(title=f"Run {i}", status="SUCCESS") for i in range(50)]


class StatisticsOnlyAdapter(TaskAdapter):
    statistics = ("queued",)

    def get_statistics(self, request):
        return {"queued": TaskStatistic(1)}


def request_for(user=None):
    request = APIRequestFactory().get("/")
    request.user = user
    return request


def test_a_task_dashboard_builds_its_widgets_from_the_adapter():
    page = TaskDashboard(adapter=FullAdapter())
    widgets = page.dashboard.widgets

    assert page.path == "tasks/"
    assert str(page.title) == "Tasks"
    assert [type(w) for w in widgets] == [TaskStatisticWidget] * 3 + [
        TaskListWidget
    ] * 2
    assert [w.statistic for w in widgets[:3]] == ["queued", "succeeded", "failed"]
    assert [w.kind for w in widgets[3:]] == ["periodic", "recent"]
    assert all(w.refresh_interval == 10 for w in widgets)


def test_a_task_dashboard_leaves_out_what_the_adapter_does_not_implement():
    page = TaskDashboard(adapter=StatisticsOnlyAdapter())

    assert [type(w) for w in page.dashboard.widgets] == [TaskStatisticWidget]


def test_a_task_dashboard_needs_an_adapter():
    with pytest.raises(ValueError):
        TaskDashboard()


def test_unknown_statistics_and_lists_are_rejected():
    class Adapter(StatisticsOnlyAdapter):
        statistics = ("queued", "bogus")

    with pytest.raises(ValueError):
        TaskDashboard(adapter=Adapter())
    with pytest.raises(ValueError):
        TaskListWidget(FullAdapter(), "bogus")


def test_a_statistic_widget_reports_its_value_title_and_trend():
    adapter = FullAdapter()
    data = lambda key: (  # noqa: E731
        TaskStatisticWidget(adapter, key).get_data(request_for())
    )

    queued = data("queued")
    queued.is_valid(raise_exception=True)
    assert queued.data["value"] == 4
    assert queued.data["title"] == "Queued"
    assert queued.data["trend"] is None

    succeeded = data("succeeded")
    succeeded.is_valid(raise_exception=True)
    assert succeeded.data["title"] == "Succeeded (24h)"
    assert succeeded.data["trend"] == "12.3"
    assert succeeded.data["trend_sentiment"] == "positive"

    # More failures is bad news.
    failed = data("failed")
    failed.is_valid(raise_exception=True)
    assert failed.data["trend_sentiment"] == "negative"


def test_the_window_shows_in_the_title():
    class Adapter(FullAdapter):
        window = timedelta(minutes=15)

    widget = TaskStatisticWidget(Adapter(), "failed")

    assert widget.get_title() == "Failed (15m)"


def test_a_missing_statistic_counts_as_zero():
    data = TaskStatisticWidget(StatisticsOnlyAdapter(), "running").get_data(
        request_for()
    )
    data.is_valid(raise_exception=True)

    assert data.data["value"] == 0


def test_a_task_list_widget_serializes_the_rows():
    data = TaskListWidget(FullAdapter(), "periodic").get_data(request_for())
    data.is_valid(raise_exception=True)

    assert data.data["title"] == "Periodic tasks"
    assert data.data["tasks"] == [
        {
            "title": "Clean up",
            "description": "Every hour",
            "status": "FAILURE",
            "last_run_at": "2026-11-02T10:00:00Z",
            "next_run_at": "2026-11-02T11:00:00Z",
            "duration": 3,
            "error_message": "Boom",
        }
    ]


def test_recent_runs_are_cut_at_the_limit():
    data = TaskListWidget(FullAdapter(), "recent", limit=5).get_data(request_for())
    data.is_valid(raise_exception=True)

    assert [t["title"] for t in data.data["tasks"]] == [f"Run {i}" for i in range(5)]


def test_the_widgets_also_work_on_another_dashboard():
    adapter = FullAdapter()

    class Site:
        dashboard = Dashboard(widgets=[TaskStatisticWidget(adapter, "queued")])
        extensions = [TaskDashboard(adapter=adapter)]
        _registry = {}

    assert duplicate_id_errors(Site()) == []
    assert dashboard_page_errors(Site()) == []


def test_two_task_dashboards_on_other_paths_do_not_collide():
    class Site:
        dashboard = None
        extensions = [
            TaskDashboard(adapter=FullAdapter()),
            TaskDashboard(adapter=FullAdapter(), path="emails/", title="Emails"),
        ]
        _registry = {}

    assert duplicate_id_errors(Site()) == []


@pytest.fixture
def task_page(monkeypatch):
    page = TaskDashboard(adapter=FullAdapter())
    monkeypatch.setattr(admin_site, "extensions", [page], raising=False)
    return page


def widget_response(user, widget_id):
    view = DashboardViewSet.as_view({"get": "get"})
    request = APIRequestFactory().get("/")
    force_authenticate(request, user=user)
    return view(request, widget_id=str(widget_id))


@pytest.mark.django_db
def test_only_superusers_see_the_task_dashboard(task_page):
    widget_id = task_page.dashboard.widgets[0].widget_id
    staff = User.objects.create_user(username="editor", password="x", is_staff=True)
    admin = User.objects.create_superuser(username="admin", password="x")

    assert not task_page.is_visible(request_for(staff))
    assert widget_response(staff, widget_id).status_code == 404

    response = widget_response(admin, widget_id)
    assert response.status_code == 200
    assert response.data["value"] == 4
