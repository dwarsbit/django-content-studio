import math
import re
from decimal import Decimal

from rest_framework import serializers

from ..dashboard import DashboardWidget

__all__ = [
    "StatisticWidget",
]

NUMBER_FORMATS = ["compact", "full", "percent", "currency"]


class NumberField(serializers.Field):
    """
    A number as JSON: whole numbers stay integers, others become floats.
    Booleans are refused, though Python counts them as integers.
    """

    default_error_messages = {"invalid": "A number is required."}

    def to_internal_value(self, data):
        if isinstance(data, bool):
            self.fail("invalid")
        if isinstance(data, str):
            try:
                data = Decimal(data.strip())
            except (ArithmeticError, ValueError):
                self.fail("invalid")
        if not isinstance(data, (int, float, Decimal)):
            self.fail("invalid")
        if not math.isfinite(data):
            self.fail("invalid")
        return data

    def to_representation(self, value):
        if isinstance(value, int):
            return value
        if value == int(value):
            return int(value)
        return float(value)


class StatisticWidgetSerializer(serializers.Serializer):
    value = NumberField()
    prefix = serializers.CharField(default="", allow_blank=True, required=False)
    suffix = serializers.CharField(default="", allow_blank=True, required=False)
    title = serializers.CharField(default="", allow_blank=True, required=False)
    trend = serializers.DecimalField(
        max_digits=5, decimal_places=1, allow_null=True, required=False
    )
    trend_sentiment = serializers.ChoiceField(
        default="default", required=False, choices=["default", "positive", "negative"]
    )
    trend_label = serializers.CharField(default="", allow_blank=True, required=False)
    number_format = serializers.ChoiceField(
        default="compact", required=False, choices=NUMBER_FORMATS
    )
    currency = serializers.CharField(
        default="", allow_blank=True, required=False, max_length=3
    )
    icon = serializers.CharField(default="", allow_blank=True, required=False)
    footnote = serializers.CharField(default="", allow_blank=True, required=False)
    series = serializers.ListField(
        child=NumberField(), default=list, required=False, max_length=365
    )
    max_value = NumberField(allow_null=True, default=None, required=False)

    def validate_currency(self, value):
        if value and not re.fullmatch(r"[A-Za-z]{3}", value):
            raise serializers.ValidationError(
                "Use a three-letter ISO 4217 code, such as EUR."
            )
        return value.upper()

    def validate(self, attrs):
        if attrs.get("number_format") == "currency" and not attrs.get("currency"):
            raise serializers.ValidationError(
                {"currency": 'Required when number_format is "currency".'}
            )
        max_value = attrs.get("max_value")
        if max_value is not None and max_value <= 0:
            raise serializers.ValidationError(
                {"max_value": "Must be greater than zero."}
            )
        return attrs


class StatisticWidget(DashboardWidget):
    """
    Widget for showing some statistic.
    """

    widget_type = "StatisticWidget"
    name = "StatisticWidget"

    def get_data(self, request):
        raise NotImplementedError("You need to implement get_data for your widget.")
