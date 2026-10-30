"""
Tests for widget and format options: widgets and formats are given as
classes, or as instances that carry options for the admin.
"""

import datetime
from decimal import Decimal

import pytest
from django.db import models
from django.test import TestCase, override_settings

from content_studio import formats, widgets
from content_studio.admin import admin_site
from content_studio.form import Field, TableColumn


def test_widget_class_serializes_without_options():
    assert Field("body", widget=widgets.InputWidget).serialize()["widget"] == {
        "name": "InputWidget",
        "options": {},
    }


def test_unset_options_are_left_out():
    widget = widgets.InputWidget(placeholder="Title", suffix="km")

    assert widget.serialize() == {
        "name": "InputWidget",
        "options": {"placeholder": "Title", "suffix": "km"},
    }


def test_format_instance_serializes_on_table_column():
    column = TableColumn("views", format=formats.NumberFormat())

    assert column.serialize()["format"] == {"name": "NumberFormat", "options": {}}


def test_input_widget_number_limits():
    widget = widgets.InputWidget(min_value=0, max_value=10, step=0.5)

    assert widget.serialize()["options"] == {
        "min_value": 0,
        "max_value": 10,
        "step": 0.5,
    }


def test_input_widget_decimal_limits_serialize_as_numbers():
    widget = widgets.InputWidget(min_value=Decimal("0.50"), step=Decimal("0.01"))

    assert widget.serialize()["options"] == {"min_value": 0.5, "step": 0.01}


@pytest.mark.parametrize(
    "kwargs",
    [
        {"min_value": "1"},
        {"max_value": True},
        {"step": 0},
        {"min_value": 5, "max_value": 1},
    ],
)
def test_input_widget_rejects_invalid_limits(kwargs):
    with pytest.raises((TypeError, ValueError)):
        widgets.InputWidget(**kwargs)


def test_options_are_keyword_only():
    with pytest.raises(TypeError):
        widgets.TextAreaWidget(5)


def test_text_area_rows():
    assert widgets.TextAreaWidget(rows=6).serialize()["options"] == {"rows": 6}

    with pytest.raises(ValueError):
        widgets.TextAreaWidget(rows=0)


def test_rich_text_features_and_heading_levels():
    widget = widgets.RichTextWidget(
        features=["heading", "bold", "link"], heading_levels=[3, 2, 2]
    )

    assert widget.serialize()["options"] == {
        "features": ["heading", "bold", "link"],
        "heading_levels": [2, 3],
    }


@pytest.mark.parametrize(
    "kwargs",
    [
        {"features": ["bold", "table"]},
        {"features": "bold"},
        {"heading_levels": []},
        {"heading_levels": [0, 2]},
        {"heading_levels": [7]},
    ],
)
def test_rich_text_rejects_invalid_options(kwargs):
    with pytest.raises((TypeError, ValueError)):
        widgets.RichTextWidget(**kwargs)


def test_date_limits_serialize_as_iso_dates():
    widget = widgets.DateWidget(
        min_date=datetime.date(2026, 1, 1), max_date=datetime.date(2026, 12, 31)
    )

    assert widget.serialize()["options"] == {
        "min_date": "2026-01-01",
        "max_date": "2026-12-31",
    }


def test_callable_date_limits_are_evaluated_on_serialize():
    today = datetime.date(2026, 1, 1)
    widget = widgets.DateTimeWidget(min_date=lambda: today)

    assert widget.serialize()["options"] == {"min_date": "2026-01-01"}

    today = datetime.date(2026, 2, 1)

    assert widget.serialize()["options"] == {"min_date": "2026-02-01"}


@override_settings(USE_TZ=True, TIME_ZONE="Europe/Amsterdam")
def test_aware_datetime_limits_count_by_their_local_date():
    late = datetime.datetime(2026, 1, 1, 23, 30, tzinfo=datetime.timezone.utc)

    assert widgets.DateWidget(min_date=late).serialize()["options"] == {
        "min_date": "2026-01-02"
    }


@pytest.mark.parametrize(
    "kwargs",
    [
        {"min_date": "2026-01-01"},
        {"min_date": datetime.date(2026, 2, 1), "max_date": datetime.date(2026, 1, 1)},
    ],
)
def test_date_widget_rejects_invalid_limits(kwargs):
    with pytest.raises((TypeError, ValueError)):
        widgets.DateWidget(**kwargs)


class InfoWidgetOptionsTests(TestCase):
    def test_mapping_instances_serialize_their_options(self):
        original = admin_site.default_widget_mapping
        admin_site.default_widget_mapping = {
            **original,
            models.TextField: widgets.TextAreaWidget(rows=4),
        }

        try:
            data = self.client.get("/api/info").json()
        finally:
            admin_site.default_widget_mapping = original

        self.assertEqual(
            data["widgets"]["TextField"],
            {"name": "TextAreaWidget", "options": {"rows": 4}},
        )
        self.assertEqual(
            data["widgets"]["CharField"], {"name": "InputWidget", "options": {}}
        )
        self.assertEqual(
            data["formats"]["CharField"], {"name": "TextFormat", "options": {}}
        )
