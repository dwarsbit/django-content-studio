"""
Tests for the DashboardPage extension: its serialization, its
visibility in discover and on the widget data endpoint, the refresh
interval and the system checks.
"""

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from content_studio.admin import admin_site
from content_studio.checks import (
    dashboard_page_errors,
    dashboard_widget_warnings,
    duplicate_id_errors,
)
from content_studio.dashboard import Dashboard, DashboardViewSet, DashboardWidget
from content_studio.dashboard.statistic import (
    StatisticWidget,
    StatisticWidgetSerializer,
)
from content_studio.extensions import DashboardPage
from content_studio.token_backends.jwt import create_access_token


class QueueLengthWidget(StatisticWidget):
    name = "QueueLength"
    refresh_interval = 5

    def get_data(self, request):
        return StatisticWidgetSerializer(data={"value": 7, "title": "Queued"})


class SuperuserPage(DashboardPage):
    path = "queue/"
    title = "Task queue"

    def is_visible(self, request):
        return request.user.is_superuser


def queue_page():
    return SuperuserPage(
        dashboard=Dashboard(widgets=[QueueLengthWidget()]),
        description="Live queue stats",
    )


@pytest.fixture
def pages(monkeypatch):
    page = queue_page()
    monkeypatch.setattr(admin_site, "extensions", [page], raising=False)
    return page


def staff(username="editor"):
    return User.objects.create_user(username=username, password="x", is_staff=True)


def superuser():
    return User.objects.create_superuser(username="admin", password="x")


def test_a_dashboard_page_serializes_its_widgets():
    page = queue_page()

    assert page.serialize() == {
        "extension_type": "DashboardPage",
        "extension_id": str(page.extension_id),
        "config": {
            "path": "queue/",
            "title": "Task queue",
            "description": "Live queue stats",
            "widgets": [
                {
                    "name": "QueueLength",
                    "widget_type": "StatisticWidget",
                    "widget_id": QueueLengthWidget().widget_id,
                    "col_span": 1,
                    "refresh_interval": 5,
                }
            ],
        },
    }


def test_the_id_is_derived_from_the_path():
    a = DashboardPage("a/", "A", Dashboard())

    assert (
        a.extension_id == DashboardPage("a/", "Other title", Dashboard()).extension_id
    )
    assert a.extension_id != DashboardPage("b/", "A", Dashboard()).extension_id


@pytest.mark.parametrize(
    "kwargs",
    [
        {"title": "A", "dashboard": Dashboard()},
        {"path": "a/", "dashboard": Dashboard()},
        {"path": "a/", "title": "A"},
    ],
)
def test_a_dashboard_page_needs_a_path_a_title_and_a_dashboard(kwargs):
    with pytest.raises(ValueError):
        DashboardPage(**kwargs)


@pytest.mark.django_db
def test_discover_lists_only_the_pages_the_request_may_see(pages):
    def listed(user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
        return client.get("/api/discover").json()["extensions"]

    assert listed(staff()) == []
    assert [e["extension_id"] for e in listed(superuser())] == [str(pages.extension_id)]


def widget_response(user, widget_id):
    view = DashboardViewSet.as_view({"get": "get"})
    request = APIRequestFactory().get("/")
    force_authenticate(request, user=user)
    return view(request, widget_id=str(widget_id))


@pytest.mark.django_db
def test_the_widgets_of_a_page_load_for_who_may_see_it(pages):
    widget_id = QueueLengthWidget().widget_id

    response = widget_response(superuser(), widget_id)

    assert response.status_code == 200
    assert response.data["value"] == 7


@pytest.mark.django_db
def test_the_widgets_of_a_hidden_page_are_not_found(pages):
    response = widget_response(staff(), QueueLengthWidget().widget_id)

    assert response.status_code == 404


def test_widget_ids_must_be_unique_across_dashboards():
    class Site:
        dashboard = Dashboard(widgets=[QueueLengthWidget()])
        extensions = [queue_page()]
        _registry = {}

    assert [check_id for check_id, _ in duplicate_id_errors(Site())] == [
        "content_studio.E004"
    ]


def test_the_widgets_of_pages_are_checked_for_a_built_in_type():
    class CustomWidget(DashboardWidget):
        name = "Custom"

    class Site:
        dashboard = None
        extensions = [DashboardPage("a/", "A", Dashboard(widgets=[CustomWidget()]))]

    assert [check_id for check_id, _ in dashboard_widget_warnings(Site())] == [
        "content_studio.W012"
    ]


@pytest.mark.parametrize("path", ["/content/", "media-library", "", "/"])
def test_a_page_path_cannot_take_an_admin_page(path):
    class Site:
        dashboard = None
        extensions = [DashboardPage(path or "/", "A", Dashboard())]

    if not path:
        # An empty path is rejected when the page is made.
        with pytest.raises(ValueError):
            DashboardPage(path, "A", Dashboard())
        return

    assert [check_id for check_id, _ in dashboard_page_errors(Site())] == [
        "content_studio.E028"
    ]


def test_a_free_page_path_passes():
    class Site:
        dashboard = None
        extensions = [DashboardPage("/queue/", "A", Dashboard())]

    assert dashboard_page_errors(Site()) == []


@pytest.mark.parametrize("interval", [0, -1, "5", True])
def test_refresh_intervals_must_be_positive_seconds(interval):
    class Widget(QueueLengthWidget):
        refresh_interval = interval

    class Site:
        dashboard = Dashboard(widgets=[Widget()])
        extensions = []

    assert [check_id for check_id, _ in dashboard_page_errors(Site())] == [
        "content_studio.E029"
    ]
