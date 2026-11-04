"""
Tests for the Markdown, code, JSON, icon picker, key-value, list and
rating widgets: their options and what the admin info sends.
"""

import pytest
from django.db import models

from content_studio import widgets
from content_studio.admin import admin_site


def serialized(widget):
    return widget.serialize()


def test_markdown_widget_takes_the_text_area_options():
    assert serialized(widgets.MarkdownWidget()) == {
        "name": "MarkdownWidget",
        "options": {},
    }
    assert serialized(
        widgets.MarkdownWidget(rows=4, placeholder="Write", show_count=True)
    )["options"] == {"rows": 4, "placeholder": "Write", "show_count": True}


def test_markdown_widget_errors_name_the_markdown_widget():
    with pytest.raises(ValueError, match="^MarkdownWidget rows"):
        widgets.MarkdownWidget(rows=0)

    with pytest.raises(ValueError, match="^TextAreaWidget rows"):
        widgets.TextAreaWidget(rows=0)


def test_code_widget_language():
    assert serialized(widgets.CodeWidget())["options"] == {}
    assert serialized(widgets.CodeWidget(language="html"))["options"] == {
        "language": "html"
    }

    with pytest.raises(ValueError, match="css, html, javascript, json"):
        widgets.CodeWidget(language="python")


def test_rating_widget_max_value():
    assert serialized(widgets.RatingWidget())["options"] == {"max_value": 5}
    assert serialized(widgets.RatingWidget(max_value=10))["options"] == {
        "max_value": 10
    }


@pytest.mark.parametrize("max_value", [1, 11, 2.5, True, "5"])
def test_rating_widget_rejects_invalid_max_value(max_value):
    with pytest.raises(ValueError):
        widgets.RatingWidget(max_value=max_value)


@pytest.mark.parametrize(
    "widget",
    [
        widgets.IconPickerWidget,
        widgets.KeyValueWidget,
        widgets.ListWidget,
        widgets.JSONWidget,
    ],
)
def test_widgets_without_options(widget):
    assert serialized(widget()) == {"name": widget.__name__, "options": {}}


def test_json_field_keeps_the_json_widget():
    assert admin_site.default_widget_mapping[models.JSONField] is widgets.JSONWidget
