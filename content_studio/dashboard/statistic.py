from rest_framework import serializers

from ..dashboard import DashboardWidget

__all__ = [
    "StatisticWidget",
]


class StatisticWidgetSerializer(serializers.Serializer):
    value = serializers.IntegerField()
    prefix = serializers.CharField(default="", allow_blank=True, required=False)
    suffix = serializers.CharField(default="", allow_blank=True, required=False)
    title = serializers.CharField(default="", allow_blank=True, required=False)
    trend = serializers.DecimalField(
        max_digits=5, decimal_places=1, allow_null=True, required=False
    )
    trend_sentiment = serializers.ChoiceField(
        default="default", required=False, choices=["default", "positive", "negative"]
    )


class StatisticWidget(DashboardWidget):
    """
    Widget for showing some statistic.
    """

    name = "StatisticWidget"

    def get_data(self, request):
        raise NotImplementedError("You need to implement get_data for your widget.")
