"""
Tests for the Huey task adapter: the counts from Huey's storage, and the
periodic tasks and runs that Huey's stats app records. Each test has its
own in-memory Huey; the stats share one database, kept apart by the
queue name.
"""

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import peewee
import pytest
from huey import MemoryHuey, crontab
from huey.contrib.stats import HueyStats
from rest_framework.test import APIRequestFactory

from content_studio.checks import task_adapter_warnings
from content_studio.contrib.huey import HueyAdapter
from content_studio.dashboard.tasks import (
    TaskDashboard,
    TaskListWidget,
    TaskStatisticWidget,
    TaskStatus,
)


@pytest.fixture(scope="session")
def stats_db(tmp_path_factory):
    # A file, not :memory:, as the stats writer uses its own thread.
    return peewee.SqliteDatabase(str(tmp_path_factory.mktemp("huey") / "stats.db"))


def make_huey():
    return MemoryHuey(f"queue-{uuid.uuid4().hex}", immediate=True)


@pytest.fixture
def huey():
    return make_huey()


@pytest.fixture
def stats(huey, stats_db):
    recorder = HueyStats(huey, stats_db)
    huey._stats = recorder
    recorder.connect()
    yield recorder
    recorder.close()


def flush(stats):
    stats._flush()


@pytest.fixture
def request_():
    return APIRequestFactory().get("/")


def test_without_stats_only_the_queue_counts_and_periodic_tasks_show(huey):
    adapter = HueyAdapter(huey)
    page = TaskDashboard(adapter=adapter)

    assert adapter.statistics == ("queued", "scheduled")
    assert [type(w) for w in page.dashboard.widgets] == [TaskStatisticWidget] * 2 + [
        TaskListWidget
    ]
    assert page.dashboard.widgets[-1].kind == "periodic"


def test_without_stats_a_system_check_warns(huey):
    site = SimpleNamespace(
        dashboard=None, extensions=[TaskDashboard(adapter=HueyAdapter(huey))]
    )

    warnings = task_adapter_warnings(site)

    assert [check_id for check_id, _message in warnings] == ["content_studio.W020"]
    assert "huey.contrib.djhuey.stats" in warnings[0][1]


def test_with_stats_every_statistic_and_list_shows(huey, stats):
    adapter = HueyAdapter(huey)
    page = TaskDashboard(adapter=adapter)
    site = SimpleNamespace(dashboard=None, extensions=[page])

    assert adapter.statistics == (
        "queued",
        "scheduled",
        "running",
        "succeeded",
        "failed",
        "retried",
    )
    assert [w.kind for w in page.dashboard.widgets[6:]] == ["periodic", "recent"]
    assert task_adapter_warnings(site) == []


def test_djhuey_is_recorded_when_the_stats_app_is_installed(monkeypatch):
    monkeypatch.setattr("content_studio.contrib.huey.stats_app_installed", lambda: True)
    monkeypatch.setattr("content_studio.contrib.huey.HueyAdapter.stats", None)

    assert HueyAdapter().has_stats()


def test_given_statistics_are_kept(huey):
    assert HueyAdapter(huey, statistics=["failed"]).statistics == ("failed",)


def test_the_queue_name_is_part_of_the_id(huey):
    assert HueyAdapter(huey).get_id() != HueyAdapter(make_huey()).get_id()


def test_statistics_count_the_queue_and_the_runs(huey, stats, request_):
    @huey.task()
    def works():
        return 1

    @huey.task()
    def breaks():
        raise ValueError("Boom")

    @huey.task(retries=1)
    def breaks_twice():
        raise ValueError("Boom")

    works()
    works()
    breaks()
    breaks_twice()
    huey.immediate = False
    works()
    later = works.s()
    later.eta = datetime.now() + timedelta(hours=1)
    huey.add_schedule(later)
    flush(stats)

    result = HueyAdapter(huey).get_statistics(request_)

    assert {key: value.value for key, value in result.items()} == {
        "queued": 1,
        "scheduled": 1,
        "running": 0,
        "succeeded": 2,
        "failed": 3,
        "retried": 1,
    }
    assert all(value.trend is None for value in result.values())


def test_recent_runs_show_the_outcomes_latest_first(huey, stats, request_):
    @huey.task()
    def works():
        """Does the work."""

    @huey.task()
    def breaks():
        raise ValueError("Boom")

    works()
    breaks()
    works.revoke()
    works()
    flush(stats)

    rows = HueyAdapter(huey).get_recent_tasks(request_, 10)

    assert [(row.title, row.status) for row in rows] == [
        ("works", TaskStatus.FAILURE),
        ("breaks", TaskStatus.FAILURE),
        ("works", TaskStatus.SUCCESS),
    ]
    assert rows[0].error_message == "Revoked"
    assert "Boom" in rows[1].error_message
    assert rows[2].error_message is None
    assert rows[2].description == __name__
    assert rows[2].duration == 0
    assert rows[2].last_run_at.tzinfo is UTC
    assert len(HueyAdapter(huey).get_recent_tasks(request_, 2)) == 2


def test_django_tasks_show_under_their_own_name(huey, stats, request_):
    shim = type("djtasks.run", (), {"__module__": "huey.contrib.djhuey.tasks_backend"})
    task = shim()
    task.id = "abc"
    huey.put("djt.abc", {"task_path": "content_studio.webhooks.delivery.deliver"})
    stats._on_signal("executing", task)
    stats._on_signal("complete", task)
    flush(stats)

    (row,) = HueyAdapter(huey).get_recent_tasks(request_, 10)

    assert (row.title, row.description) == (
        "deliver",
        "content_studio.webhooks.delivery",
    )
    assert row.status == TaskStatus.SUCCESS


def test_a_django_task_without_its_record_keeps_the_shim_name(huey, stats, request_):
    shim = type("djtasks.run", (), {"__module__": "huey.contrib.djhuey.tasks_backend"})
    task = shim()
    task.id = "gone"
    stats._on_signal("complete", task)
    flush(stats)

    (row,) = HueyAdapter(huey).get_recent_tasks(request_, 10)

    assert row.title == "djtasks.run"


def test_periodic_tasks_show_their_latest_run_and_next_run(huey, stats, request_):
    @huey.periodic_task(crontab(minute="*/15"))
    def sync():
        """Sync the catalogue."""

    @huey.periodic_task(crontab(minute="0", hour="3"))
    def clean_up():
        raise ValueError("Boom")

    @huey.periodic_task(crontab(minute="30"))
    def never_ran():
        pass

    sync()
    clean_up()
    flush(stats)

    rows = {row.title: row for row in HueyAdapter(huey).get_periodic_tasks(request_)}

    assert list(rows) == ["clean_up", "never_ran", "sync"]
    assert rows["sync"].status == TaskStatus.SUCCESS
    assert rows["sync"].description == "Sync the catalogue."
    assert rows["sync"].last_run_at is not None
    assert rows["sync"].next_run_at.minute % 15 == 0
    assert rows["clean_up"].status == TaskStatus.FAILURE
    assert "Boom" in rows["clean_up"].error_message
    assert rows["never_ran"].status == TaskStatus.SCHEDULED
    assert rows["never_ran"].last_run_at is None
    assert rows["never_ran"].description == __name__


def test_a_running_periodic_task_shows_as_running(huey, stats, request_):
    @huey.periodic_task(crontab(minute="*/15"))
    def sync():
        pass

    task = sync.s()
    stats._on_signal("executing", task)
    flush(stats)

    (row,) = HueyAdapter(huey).get_periodic_tasks(request_)
    statistics = HueyAdapter(huey).get_statistics(request_)

    assert row.status == TaskStatus.RUNNING
    assert row.last_run_at is not None
    assert statistics["running"].value == 1


def test_periodic_tasks_without_stats_have_no_runs(huey, request_):
    @huey.periodic_task(crontab(minute="*/15"))
    def sync():
        pass

    (row,) = HueyAdapter(huey).get_periodic_tasks(request_)

    assert row.status == TaskStatus.SCHEDULED
    assert row.last_run_at is None
    assert row.next_run_at is not None
    assert HueyAdapter(huey).get_recent_tasks(request_, 10) == []


def test_the_next_run_is_the_next_matching_minute(huey):
    @huey.periodic_task(crontab(minute="0", hour="3"))
    def nightly():
        pass

    @huey.periodic_task(crontab(month="2", day="30"))
    def never():
        pass

    adapter = HueyAdapter(huey)
    now = datetime(2026, 11, 2, 3, 0, 30)

    assert adapter.get_next_run(nightly.task_class, now) == datetime(
        2026, 11, 3, 3, 0, tzinfo=UTC
    )
    assert adapter.get_next_run(never.task_class, now) is None


def test_the_next_run_of_a_local_time_queue_is_in_local_time():
    huey = MemoryHuey(f"queue-{uuid.uuid4().hex}", utc=False)

    @huey.periodic_task(crontab(minute="0"))
    def hourly():
        pass

    next_run = HueyAdapter(huey).get_next_run(
        hourly.task_class, datetime(2026, 11, 2, 10, 5)
    )

    assert next_run.tzinfo is not None
    assert next_run.replace(tzinfo=None) == datetime(2026, 11, 2, 11, 0)


def test_the_widgets_serialize_huey_rows(huey, stats, request_):
    @huey.task()
    def works():
        pass

    works()
    flush(stats)
    widget = TaskListWidget(HueyAdapter(huey), "recent")

    data = widget.get_data(request_)
    data.is_valid(raise_exception=True)

    assert data.data["tasks"][0]["status"] == "SUCCESS"
    assert data.data["tasks"][0]["title"] == "works"


def test_runs_of_other_queues_are_left_out(huey, stats, stats_db, request_):
    other = make_huey()
    other_stats = HueyStats(other, stats_db)
    other._stats = other_stats
    other_stats.connect()

    @other.task()
    def elsewhere():
        pass

    elsewhere()
    other_stats.close()
    flush(stats)

    assert HueyAdapter(huey).get_recent_tasks(request_, 10) == []
    assert HueyAdapter(huey).get_statistics(request_)["succeeded"].value == 0
