"""
Tests for colors: ColorField, ColorValidator, ColorPickerWidget and
ColorFormat. The parsing cases match frontend/src/__tests__/colors.test.ts,
so the picker writes what the server saves.
"""

from types import SimpleNamespace

import pytest
from django.contrib.auth import models as auth_models
from django.core.exceptions import ValidationError
from django.db import models

from content_studio import formats, widgets
from content_studio.admin import admin_site
from content_studio.colors import normalize_color, parse_color
from content_studio.fields import ColorField
from content_studio.serializers import ModelSerializer
from content_studio.validators import ColorValidator


@pytest.mark.parametrize(
    "value, color_format, alpha, expected",
    [
        ("#F00", "hex", False, "#ff0000"),
        ("#ff000080", "hex", True, "#ff000080"),
        ("rgb(255 0 0 / 50%)", "hex", True, "#ff000080"),
        ("#f00", "hex", True, "#ff0000ff"),
        ("hsl(210deg 50% 40%)", "hex", False, "#336699"),
        ("#336699", "rgb", False, "rgb(51, 102, 153)"),
        ("rgba(10,20,30,.25)", "rgb", True, "rgba(10, 20, 30, 0.25)"),
        ("rgb(100%, 0%, 0%)", "rgb", False, "rgb(255, 0, 0)"),
        ("#ff000080", "rgb", True, "rgba(255, 0, 0, 0.502)"),
        ("#336699", "hsl", False, "hsl(210, 50%, 40%)"),
        ("rgba(10, 20, 30, 0.25)", "hsl", True, "hsla(210, 50%, 7.8%, 0.25)"),
        ("hsl(0.5turn, 100%, 50%)", "hsl", False, "hsl(180, 100%, 50%)"),
        ("hsl(-30, 100%, 50%)", "hsl", False, "hsl(330, 100%, 50%)"),
        ("hsl(359.97, 50%, 50%)", "hsl", False, "hsl(0, 50%, 50%)"),
    ],
)
def test_normalize_color(value, color_format, alpha, expected):
    assert normalize_color(value, color_format, alpha) == expected


def test_translucent_colors_need_alpha():
    assert normalize_color("#ff000080", "hex", False) is None
    # Opaque alpha is no transparency.
    assert normalize_color("rgba(0, 0, 0, 1)", "hex", False) == "#000000"


NOT_COLORS = [
    "",
    "red",
    "#ggg",
    "#12345",
    "rgb(256, 0, 0)",
    "rgb(1, 2)",
    "rgb(1 2 3 4)",
    "rgba(0, 0, 0, 2)",
    "hsl(10%, 1%, 1%)",
    "hsl(0, 101%, 50%)",
    "rgb(1px, 2, 3)",
    None,
    123,
]


@pytest.mark.parametrize("value", NOT_COLORS)
def test_not_colors(value):
    assert parse_color(value) is None


# ColorValidator


@pytest.mark.parametrize("value", ["#336699", "rgb(51, 102, 153)", "hsl(210 50% 40%)"])
def test_validator_accepts_every_notation(value):
    ColorValidator()(value)


@pytest.mark.parametrize("value", [v for v in NOT_COLORS if v])
def test_validator_rejects_other_values(value):
    with pytest.raises(ValidationError) as error:
        ColorValidator()(value)

    assert error.value.code == "invalid_color"


def test_validator_with_a_format_accepts_only_that_notation():
    validator = ColorValidator(color_format="rgb")

    validator("rgb(51, 102, 153)")
    with pytest.raises(ValidationError):
        validator("#336699")


def test_validator_rejects_translucent_colors_without_alpha():
    with pytest.raises(ValidationError, match="Transparent"):
        ColorValidator()("#33669980")

    ColorValidator(alpha=True)("#33669980")


def test_validator_options_are_checked():
    with pytest.raises(ValueError, match="color_format"):
        ColorValidator(color_format="cmyk")
    with pytest.raises(TypeError, match="alpha"):
        ColorValidator(alpha="yes")


def test_validator_deconstructs():
    validator = ColorValidator(color_format="hsl", alpha=True)
    path, args, kwargs = validator.deconstruct()

    assert path == "content_studio.validators.ColorValidator"
    assert kwargs == {"color_format": "hsl", "alpha": True}
    assert ColorValidator(**kwargs) == validator


# ColorField


def make_field(**kwargs):
    field = ColorField(**kwargs)
    field.set_attributes_from_name("color")
    return field


def test_field_accepts_any_notation():
    field = make_field(color_format="rgb")

    for value in ("#336699", "rgb(51 102 153)", "hsl(210, 50%, 40%)"):
        assert field.clean(value, None) == value


def test_field_rejects_invalid_and_translucent_colors():
    with pytest.raises(ValidationError):
        make_field().clean("blue", None)
    with pytest.raises(ValidationError):
        make_field().clean("#33669980", None)

    make_field(alpha=True).clean("#33669980", None)


def test_field_allows_blank_when_blank():
    make_field(blank=True).clean("", None)


@pytest.mark.parametrize(
    "kwargs, value, saved",
    [
        ({}, "RGB(51, 102, 153)", "#336699"),
        ({"color_format": "rgb"}, "#369", "rgb(51, 102, 153)"),
        ({"color_format": "hsl"}, "#336699", "hsl(210, 50%, 40%)"),
        ({"alpha": True}, "rgba(51, 102, 153, 0.5)", "#33669980"),
        ({"alpha": True, "color_format": "rgb"}, "#336699", "rgba(51, 102, 153, 1)"),
        # Not colors are left for the validator to report.
        ({}, "blue", "blue"),
        ({}, "", ""),
        ({}, None, None),
    ],
)
def test_field_saves_in_its_format(kwargs, value, saved):
    instance = SimpleNamespace(color=value)

    assert make_field(**kwargs).pre_save(instance, add=True) == saved
    assert instance.color == saved


def test_field_options_are_checked():
    with pytest.raises(ValueError, match="color_format"):
        ColorField(color_format="cmyk")
    with pytest.raises(TypeError, match="alpha"):
        ColorField(alpha=1)


def test_field_deconstructs_without_defaults():
    _, path, _, kwargs = make_field().deconstruct()

    assert path == "content_studio.fields.ColorField"
    assert "color_format" not in kwargs
    assert "alpha" not in kwargs
    assert "max_length" not in kwargs

    _, _, _, kwargs = make_field(color_format="hsl", alpha=True).deconstruct()
    assert kwargs["color_format"] == "hsl"
    assert kwargs["alpha"] is True

    rebuilt = ColorField(**kwargs)
    assert rebuilt.color_format == "hsl"
    assert rebuilt.alpha is True


def test_field_keeps_extra_validators():
    def no_black(value):
        if value == "#000000":
            raise ValidationError("No black.")

    field = make_field(validators=[no_black])

    assert ColorValidator() in field.validators
    with pytest.raises(ValidationError, match="No black"):
        field.clean("#000000", None)


def test_field_sends_its_format():
    data = ModelSerializer(auth_models.User).get_field(
        make_field(color_format="rgb", alpha=True)
    )

    assert data["type"] == "ColorField"
    assert data["color_format"] == "rgb"
    assert data["alpha"] is True


def test_plain_field_with_validator_sends_the_validator_format():
    field = models.CharField(
        max_length=30, validators=[ColorValidator(color_format="hsl")]
    )
    field.set_attributes_from_name("color")

    data = ModelSerializer(auth_models.User).get_field(field)

    assert data["color_format"] == "hsl"
    assert data["alpha"] is False


def test_validator_without_format_sends_hex():
    field = models.CharField(max_length=30, validators=[ColorValidator()])
    field.set_attributes_from_name("color")

    data = ModelSerializer(auth_models.User).get_field(field)

    assert data["color_format"] == "hex"


def test_field_defaults_to_the_picker_and_color_format():
    assert admin_site.default_widget_mapping[ColorField] is widgets.ColorPickerWidget
    assert admin_site.default_format_mapping[ColorField] is formats.ColorFormat


# ColorPickerWidget


def test_widget_defaults():
    assert widgets.ColorPickerWidget().serialize() == {
        "name": "ColorPickerWidget",
        "options": {"show_input": True},
    }


def test_widget_options():
    widget = widgets.ColorPickerWidget(
        show_input=False, swatches=("#336699", "hsl(0, 100%, 50%)")
    )

    assert widget.serialize()["options"] == {
        "show_input": False,
        "swatches": ["#336699", "hsl(0, 100%, 50%)"],
    }


def test_widget_options_are_checked():
    with pytest.raises(TypeError, match="show_input"):
        widgets.ColorPickerWidget(show_input="no")
    with pytest.raises(TypeError, match="swatches"):
        widgets.ColorPickerWidget(swatches="#336699")
    with pytest.raises(ValueError, match="blue"):
        widgets.ColorPickerWidget(swatches=["#336699", "blue"])
