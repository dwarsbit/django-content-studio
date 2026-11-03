from rest_framework import serializers

from ..dashboard import DashboardWidget

__all__ = [
    "ContentListWidget",
]


class ContentSerializer(serializers.Serializer):
    model = serializers.CharField(allow_blank=False, required=True)
    id = serializers.CharField(allow_blank=False, required=True)
    title = serializers.CharField(allow_blank=False, required=True)
    description = serializers.CharField(
        default="",
        allow_blank=True,
        required=False,
    )
    # A short state shown as a badge, such as "Published", colored by
    # its variant.
    status = serializers.CharField(default="", allow_blank=True, required=False)
    status_variant = serializers.ChoiceField(
        default="default",
        required=False,
        choices=["default", "success", "warning", "info", "danger"],
    )
    # The URL of a small image shown before the title.
    thumbnail = serializers.CharField(default="", allow_blank=True, required=False)
    # Shown relative to now ("2h") at the end of the row.
    timestamp = serializers.DateTimeField(default=None, allow_null=True, required=False)


class ContentListWidgetSerializer(serializers.Serializer):
    title = serializers.CharField(default="", allow_blank=True, required=False)
    description = serializers.CharField(
        default="",
        allow_blank=True,
        required=False,
    )
    content = serializers.ListField(child=ContentSerializer())


class ContentListWidget(DashboardWidget):
    """
    Widget for showing a list of content.
    """

    widget_type = "ContentListWidget"
    name = "ContentListWidget"

    col_span = 2

    def get_data(self, request):
        raise NotImplementedError("You need to implement get_data for your widget.")
