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
    BaseWidget,
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
                "widget_id": TotalArticlesWidget().widget_id,
                "col_span": 1,
            },
            {
                "name": "SpacingWidget",
                "widget_id": SpacingWidget().widget_id,
                "col_span": 2,
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
    }


def test_widget_data_endpoint_rejects_unknown_widgets():
    viewset = DashboardViewSet()
    viewset.dashboard = Dashboard(widgets=[])
    request = Request(APIRequestFactory().get("/"), parsers=[JSONParser()])

    with pytest.raises(NotFound):
        viewset.get(request, widget_id="00000000-0000-0000-0000-000000000000")


@pytest.mark.django_db
def test_activity_log_widget_returns_latest_entries():
    user = auth_models.User.objects.create_user(username="staff", password="x")
    LogEntry.objects.create(
        user=user,
        action_flag=ADDITION,
        content_type=ContentType.objects.get_for_model(auth_models.Group),
        object_id="1",
        object_repr="editors",
        change_message="",
    )

    data = ActivityLogWidget().get_data(request=None)

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
