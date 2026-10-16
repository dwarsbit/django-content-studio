from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from ..dashboard import DashboardWidget

__all__ = [
    "ScheduledTasksWidget",
]


class ScheduledTaskSerializer(serializers.Serializer):
    title = serializers.CharField()
    description = serializers.CharField(allow_blank=True, required=False)
    last_run_at = serializers.DateTimeField(allow_null=True)
    next_run_at = serializers.DateTimeField(allow_null=True)
    duration = serializers.IntegerField(allow_null=True)
    status = serializers.ChoiceField(
        choices=["RUNNING", "SCHEDULED", "SUCCESS", "FAILURE"]
    )
    error_message = serializers.CharField(
        allow_blank=True, allow_null=True, required=False
    )


class ScheduledTasksWidgetSerializer(serializers.Serializer):
    title = serializers.CharField(
        default=_("Scheduled tasks"), allow_blank=True, required=False
    )
    description = serializers.CharField(
        default=_("Monitor and manage automated tasks"),
        allow_blank=True,
        required=False,
    )
    tasks = serializers.ListField(child=ScheduledTaskSerializer())


class ScheduledTasksWidget(DashboardWidget):
    """
    Widget for showing a list of scheduled tasks.
    """

    widget_type = "ScheduledTasksWidget"
    name = "ScheduledTasksWidget"

    col_span = 2

    def get_data(self, request):
        raise NotImplementedError("You need to implement get_data for your widget.")
