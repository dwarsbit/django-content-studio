"""
Tests for the text, progress, duration, image, code and boolean formats:
their options and the default formats of the field types they cover.
"""

from unittest import mock

import pytest
from django.db import models
from django.test import TestCase

from content_studio import formats
from content_studio.admin import admin_site
from content_studio.serializers import ContentFileField


def options(fmt):
    return fmt.serialize()["options"]


def test_text_format():
    assert options(formats.TextFormat()) == {}
    assert options(formats.TextFormat(max_length=40, lines=2)) == {
        "max_length": 40,
        "lines": 2,
    }


@pytest.mark.parametrize(
    "kwargs", [{"max_length": 0}, {"lines": -1}, {"lines": 1.5}, {"lines": True}]
)
def test_text_format_rejects_invalid_options(kwargs):
    with pytest.raises(ValueError):
        formats.TextFormat(**kwargs)


def test_progress_format():
    assert options(formats.ProgressFormat()) == {"max_value": 100}
    assert options(formats.ProgressFormat(max_value=5)) == {"max_value": 5}

    for value in (0, -1, "100", True):
        with pytest.raises(ValueError):
            formats.ProgressFormat(max_value=value)


def test_duration_format():
    assert options(formats.DurationFormat()) == {"style": "narrow"}
    assert options(formats.DurationFormat(style="long")) == {"style": "long"}

    with pytest.raises(ValueError):
        formats.DurationFormat(style="medium")


def test_boolean_format():
    assert options(formats.BooleanFormat()) == {}
    assert options(formats.BooleanFormat(labels=("Yes", "No"))) == {
        "labels": ["Yes", "No"]
    }
    assert options(
        formats.BooleanFormat(labels=("In stock", "Sold out"), colors=("green", "red"))
    ) == {"labels": ["In stock", "Sold out"], "colors": ["green", "red"]}


@pytest.mark.parametrize(
    "kwargs",
    [
        {"labels": ("Yes",)},
        {"labels": "Yes/No"},
        {"labels": ("Yes", 0)},
        {"colors": ("green", "red")},
        {"labels": ("Yes", "No"), "colors": ("green", "pink")},
    ],
)
def test_boolean_format_rejects_invalid_options(kwargs):
    with pytest.raises((TypeError, ValueError)):
        formats.BooleanFormat(**kwargs)


def test_default_formats():
    mapping = admin_site.default_format_mapping

    assert mapping[models.DurationField] is formats.DurationFormat
    assert mapping[models.UUIDField] is formats.CodeFormat
    assert mapping[models.ImageField] is formats.ImageFormat
    assert mapping[models.FileField] is formats.FileFormat
    assert options(mapping[models.TextField]) == {"lines": 2}
    # Short text is not clamped.
    assert mapping[models.CharField] is formats.TextFormat


def test_image_values_carry_a_thumbnail():
    image = mock.Mock()
    image.name = "logos/logo.png"
    image.url = "/media/logos/logo.png"

    with mock.patch(
        "content_studio.thumbnails.get_thumbnail_url", return_value="/t/logo.webp"
    ) as get_thumbnail_url:
        image_field = ContentFileField(model_field=models.ImageField(name="logo"))
        file_field = ContentFileField(model_field=models.FileField(name="manual"))

        assert image_field.to_representation(image) == {
            "name": "logo.png",
            "url": "/media/logos/logo.png",
            "thumbnail": "/t/logo.webp",
        }
        assert "thumbnail" not in file_field.to_representation(image)

    get_thumbnail_url.assert_called_once_with(image, "small")


class InfoTests(TestCase):
    def test_text_fields_clamp_to_two_lines(self):
        response = self.client.get("/api/info")
        formats_info = response.json()["formats"]

        assert formats_info["TextField"] == {
            "name": "TextFormat",
            "options": {"lines": 2},
        }
        assert formats_info["DurationField"]["name"] == "DurationFormat"
        assert formats_info["UUIDField"]["name"] == "CodeFormat"
