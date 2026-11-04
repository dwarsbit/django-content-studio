from rest_framework import serializers

from ..dashboard import DashboardWidget
from .statistic import NumberField

__all__ = [
    "ContentListWidget",
]


class ContentSerializer(serializers.Serializer):
    # The object the row links to; a row without one is not a link.
    model = serializers.CharField(default="", allow_blank=True, required=False)
    id = serializers.CharField(default="", allow_blank=True, required=False)
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
    # A number shown at the end of the row, such as its visitors.
    value = NumberField(default=None, allow_null=True, required=False)


class ContentListWidgetSerializer(serializers.Serializer):
    title = serializers.CharField(default="", allow_blank=True, required=False)
    description = serializers.CharField(
        default="",
        allow_blank=True,
        required=False,
    )
    content = serializers.ListField(child=ContentSerializer())
    # A path in the admin for the header's "View all"; by default the
    # list of the model all rows belong to.
    view_all = serializers.CharField(default="", allow_blank=True, required=False)


class ContentListWidget(DashboardWidget):
    """
    Widget for showing a list of content.
    """

    widget_type = "ContentListWidget"
    name = "ContentListWidget"

    col_span = 2

    def get_data(self, request):
        raise NotImplementedError("You need to implement get_data for your widget.")
