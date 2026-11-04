"""
Tests for the dashboard: widget serialization and the widget data
endpoint.
"""

import pytest
from django.contrib.admin.models import ADDITION, LogEntry
from django.contrib.auth import models as auth_models
from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import NotFound
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from content_studio.dashboard import (
    DashboardWidget,
    Dashboard,
    DashboardViewSet,
    SpacingWidget,
)
from content_studio.dashboard.activity_log import ActivityLogWidget
from content_studio.dashboard.scheduled_tasks import (
    ScheduledTaskSerializer,
    ScheduledTasksWidget,
)
from content_studio.dashboard.statistic import (
    StatisticWidget,
    StatisticWidgetSerializer,
)


class TotalArticlesWidget(StatisticWidget):
    name = "TotalArticles"

    def get_data(self, request):
        return StatisticWidgetSerializer(
            data={
                "value": 42,
                "title": "Articles",
                "trend": 1.5,
                "trend_sentiment": "positive",
            }
        )


def test_widget_id_derived_from_name():
    widget = TotalArticlesWidget()

    assert widget.widget_id is not None
    # Two widgets with the same name share an ID (and need an explicit
    # widget_id to disambiguate).
    assert TotalArticlesWidget().widget_id == widget.widget_id


def test_dashboard_serializes_widgets():
    dashboard = Dashboard(widgets=[TotalArticlesWidget(), SpacingWidget(col_span=2)])

    data = dashboard.serialize()

    assert data == {
        "widgets": [
            {
                "name": "TotalArticles",
                "widget_type": "StatisticWidget",
                "widget_id": TotalArticlesWidget().widget_id,
                "col_span": 1,
                "refresh_interval": None,
            },
            {
                "name": "SpacingWidget",
                "widget_type": "SpacingWidget",
                "widget_id": SpacingWidget().widget_id,
                "col_span": 2,
                "refresh_interval": None,
            },
        ]
    }


def test_widget_data_endpoint_returns_serializer_output():
    viewset = DashboardViewSet()
    viewset.dashboard = Dashboard(widgets=[TotalArticlesWidget()])
    request = Request(APIRequestFactory().get("/"), parsers=[JSONParser()])

    response = viewset.get(request, widget_id=str(TotalArticlesWidget().widget_id))

    assert response.data == {
        "value": 42,
        "prefix": "",
        "suffix": "",
        "title": "Articles",
        "trend": "1.5",
        "trend_sentiment": "positive",
        "trend_label": "",
        "number_format": "compact",
        "currency": "",
        "icon": "",
        "footnote": "",
        "series": [],
        "max_value": None,
    }


def test_widget_data_endpoint_rejects_unknown_widgets():
    viewset = DashboardViewSet()
    viewset.dashboard = Dashboard(widgets=[])
    request = Request(APIRequestFactory().get("/"), parsers=[JSONParser()])

    with pytest.raises(NotFound):
        viewset.get(request, widget_id="00000000-0000-0000-0000-000000000000")


def test_widget_data_endpoint_rejects_widgets_without_data():
    """A SpacingWidget is layout only; asking for its data is 404, not 500."""
    spacing = SpacingWidget()
    viewset = DashboardViewSet()
    viewset.dashboard = Dashboard(widgets=[spacing])
    request = Request(APIRequestFactory().get("/"), parsers=[JSONParser()])

    with pytest.raises(NotFound):
        viewset.get(request, widget_id=str(spacing.widget_id))


def _log(user, model, repr_):
    return LogEntry.objects.create(
        user=user,
        action_flag=ADDITION,
        content_type=ContentType.objects.get_for_model(model),
        object_id="1",
        object_repr=repr_,
        change_message="",
    )


def _request_for(user):
    request = Request(APIRequestFactory().get("/"), parsers=[JSONParser()])
    request.user = user
    return request


@pytest.mark.django_db
def test_activity_log_widget_returns_latest_entries():
    user = auth_models.User.objects.create_superuser(username="staff", password="x")
    _log(user, auth_models.Group, "editors")

    data = ActivityLogWidget().get_data(_request_for(user))

    # The widget serializes the latest five entries as a list.
    assert len(data) == 1
    assert data[0]["object_model"] == "auth.group"
    assert data[0]["object_repr"] == "editors"


def test_widgets_require_get_data():
    with pytest.raises(NotImplementedError):
        StatisticWidget().get_data(request=None)


def test_scheduled_task_serializer_shape():
    serializer = ScheduledTaskSerializer(
        data={
            "title": "Cleanup",
            "last_run_at": None,
            "next_run_at": None,
            "duration": None,
            "status": "SCHEDULED",
        }
    )

    assert serializer.is_valid(), serializer.errors


def test_content_list_widget_serializer_shape():
    from content_studio.dashboard.content_list import ContentListWidgetSerializer

    serializer = ContentListWidgetSerializer(
        data={
            "title": "Recently edited",
            "content": [{"model": "testapp.article", "id": "3", "title": "Article"}],
        }
    )

    assert serializer.is_valid(), serializer.errors


@pytest.mark.django_db
def test_activity_log_widget_hides_models_the_user_cannot_view():
    from tests.testapp.models import Article

    admin = auth_models.User.objects.create_superuser(username="admin", password="x")
    _log(admin, auth_models.Group, "editors")
    _log(admin, Article, "secret article")

    viewer = auth_models.User.objects.create_user(
        username="viewer", password="x", is_staff=True
    )
    viewer.user_permissions.add(
        auth_models.Permission.objects.get(codename="view_group")
    )
    viewer = auth_models.User.objects.get(pk=viewer.pk)

    data = ActivityLogWidget().get_data(_request_for(viewer))

    assert [entry["object_repr"] for entry in data] == ["editors"]


@pytest.mark.django_db
@pytest.mark.parametrize("kind", ["anonymous", "non_staff", "inactive_staff"])
def test_widget_data_endpoint_requires_active_staff(kind):
    from rest_framework.test import force_authenticate

    view = DashboardViewSet.as_view({"get": "get"})
    request = APIRequestFactory().get("/")
    widget_id = str(TotalArticlesWidget().widget_id)

    if kind != "anonymous":
        user = auth_models.User.objects.create_user(
            username=kind,
            password="x",
            is_staff=kind == "inactive_staff",
            is_active=kind != "inactive_staff",
        )
        force_authenticate(request, user=user)

    response = view(request, widget_id=widget_id)

    assert response.status_code in (401, 403)


def test_renamed_subclasses_keep_their_widget_type():
    """The name feeds the ID; the widget type decides the display, so a
    subclass with its own name still shows as a statistic."""
    widget = TotalArticlesWidget()

    assert widget.name == "TotalArticles"
    assert widget.widget_type == "StatisticWidget"
    assert widget.widget_id != StatisticWidget().widget_id


def test_widgets_without_a_built_in_type_are_reported():
    from content_studio.checks import dashboard_widget_warnings

    class CustomWidget(DashboardWidget):
        name = "Custom"

    class Site:
        dashboard = Dashboard(widgets=[TotalArticlesWidget(), CustomWidget()])

    warnings = dashboard_widget_warnings(Site())

    assert [check_id for check_id, _ in warnings] == ["content_studio.W012"]
    assert "CustomWidget" in warnings[0][1]


TENANT_SETTINGS = {
    "ADMIN_SITE": "content_studio.admin.admin_site",
    "TENANT_MODEL": "tests.testapp.models.Category",
}


def _log_object(user, obj, repr_=None):
    return LogEntry.objects.create(
        user=user,
        action_flag=ADDITION,
        content_type=ContentType.objects.get_for_model(obj),
        object_id=str(obj.pk),
        object_repr=repr_ or str(obj),
        change_message="",
    )


def _tenant_request_for(user, tenant=None):
    headers = {"HTTP_X_DCS_TENANT": str(tenant.pk)} if tenant else {}
    request = Request(APIRequestFactory().get("/", **headers), parsers=[JSONParser()])
    request.user = user
    return request


@pytest.mark.django_db
def test_activity_log_widget_shows_the_tenant_only():
    from django.test import override_settings
    from django.utils import timezone

    from tests.testapp.models import Category, Page

    admin = auth_models.User.objects.create_superuser(username="admin", password="x")
    a = Category.objects.create(name="A")
    b = Category.objects.create(name="B")
    own = Page.objects.create(title="own", slug="own", category=a)
    trashed = Page.objects.create(
        title="trashed", slug="trashed", category=a, removed_at=timezone.now()
    )
    other = Page.objects.create(title="other", slug="other", category=b)
    gone = Page.objects.create(title="gone", slug="gone", category=a)

    _log(admin, auth_models.Group, "editors")
    _log_object(admin, own)
    _log_object(admin, trashed)
    _log_object(admin, other)
    _log_object(admin, gone)
    gone.delete()

    with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
        in_a = ActivityLogWidget().get_data(_tenant_request_for(admin, a))
        without_tenant = ActivityLogWidget().get_data(_tenant_request_for(admin))

    # Shared models show; of the tenant model, only objects in the tenant
    # (trashed ones included). A deleted object cannot be placed.
    assert {entry["object_repr"] for entry in in_a} == {"editors", "own", "trashed"}
    assert [entry["object_repr"] for entry in without_tenant] == ["editors"]


@pytest.mark.django_db
def test_activity_log_widget_skips_other_tenants_to_fill_up():
    from django.test import override_settings

    from tests.testapp.models import Category, Page

    admin = auth_models.User.objects.create_superuser(username="admin", password="x")
    a = Category.objects.create(name="A")
    b = Category.objects.create(name="B")
    own = Page.objects.create(title="own", slug="own", category=a)
    other = Page.objects.create(title="other", slug="other", category=b)

    _log_object(admin, own)
    # More recent entries of another tenant than one batch holds.
    for _ in range(ActivityLogWidget.limit * 5):
        _log_object(admin, other)

    with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
        data = ActivityLogWidget().get_data(_tenant_request_for(admin, a))

    assert [entry["object_repr"] for entry in data] == ["own"]


@pytest.mark.parametrize(
    "value, expected",
    [(15, 15), (45.9, 45.9), ("12.50", 12.5), ("3", 3), (2.0, 2)],
)
def test_statistic_value_accepts_decimals(value, expected):
    serializer = StatisticWidgetSerializer(data={"value": value})

    assert serializer.is_valid(), serializer.errors
    assert serializer.data["value"] == expected


@pytest.mark.parametrize("value", [True, "abc", float("nan"), float("inf"), None])
def test_statistic_value_refuses_non_numbers(value):
    serializer = StatisticWidgetSerializer(data={"value": value})

    assert not serializer.is_valid()
    assert "value" in serializer.errors


def test_statistic_defaults_to_compact_numbers():
    serializer = StatisticWidgetSerializer(data={"value": 45940})

    assert serializer.is_valid(), serializer.errors
    assert serializer.data["number_format"] == "compact"
    assert serializer.data["series"] == []
    assert serializer.data["max_value"] is None


def test_statistic_extras():
    serializer = StatisticWidgetSerializer(
        data={
            "value": 1250.5,
            "number_format": "currency",
            "currency": "eur",
            "icon": "ph-bold ph-coins",
            "footnote": "This month",
            "trend": 4.2,
            "trend_label": "vs last month",
            "series": [1, 2.5, 3],
            "max_value": 2000,
        }
    )

    assert serializer.is_valid(), serializer.errors
    assert serializer.data["currency"] == "EUR"
    assert serializer.data["series"] == [1, 2.5, 3]
    assert serializer.data["max_value"] == 2000


@pytest.mark.parametrize(
    "data, field",
    [
        ({"number_format": "currency"}, "currency"),
        ({"number_format": "currency", "currency": "euro"}, "currency"),
        ({"number_format": "bytes"}, "number_format"),
        ({"max_value": 0}, "max_value"),
        ({"series": [1, "x"]}, "series"),
    ],
)
def test_statistic_extras_are_validated(data, field):
    serializer = StatisticWidgetSerializer(data={"value": 1, **data})

    assert not serializer.is_valid()
    assert field in serializer.errors


def test_content_list_items_take_optional_status_thumbnail_and_time():
    from content_studio.dashboard.content_list import ContentListWidgetSerializer

    serializer = ContentListWidgetSerializer(
        data={
            "title": "Latest articles",
            "content": [
                {
                    "model": "testapp.article",
                    "id": "3",
                    "title": "Article",
                    "status": "Published",
                    "status_variant": "success",
                    "thumbnail": "/media/cover.jpg",
                    "timestamp": "2026-11-03T08:00:00Z",
                },
                {"model": "testapp.article", "id": "4", "title": "Other"},
            ],
        }
    )

    assert serializer.is_valid(), serializer.errors
    first, second = serializer.data["content"]
    assert first["status_variant"] == "success"
    assert first["timestamp"].startswith("2026-11-03T08:00:00")
    assert second["status"] == ""
    assert second["timestamp"] is None


def test_content_list_status_variant_is_validated():
    from content_studio.dashboard.content_list import ContentListWidgetSerializer

    serializer = ContentListWidgetSerializer(
        data={
            "content": [
                {"model": "a.b", "id": "1", "title": "x", "status_variant": "pink"}
            ]
        }
    )

    assert not serializer.is_valid()
