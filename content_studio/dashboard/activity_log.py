from django.contrib.admin.models import LogEntry
from rest_framework import serializers

from content_studio.serializers import ContentSerializer
from ..dashboard import DashboardWidget


class LogEntrySerializer(ContentSerializer):
    object_model = serializers.SerializerMethodField()

    class Meta:
        model = LogEntry
        fields = [
            "id",
            "action_flag",
            "action_time",
            "user",
            "object_id",
            "object_repr",
            "object_model",
        ]

    def get_object_model(self, obj):
        return f"{obj.content_type.app_label}.{obj.content_type.model}"


class ActivityLogWidget(DashboardWidget):
    """
    Widget for showing activity logs.
    """

    name = "ActivityLogWidget"

    col_span = 2

    def get_data(self, request):
        return LogEntrySerializer(
            LogEntry.objects.all().order_by("-action_time")[0:5], many=True
        ).data
