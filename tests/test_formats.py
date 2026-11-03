"""
Tests for the display formats: their options, validated when the format
is made and serialized for the admin, and the default formats of the
field types they cover.
"""

import pytest
from django.db import models
from django.test import TestCase

from content_studio import formats
from content_studio.admin import admin_site
from content_studio.form import TableColumn


def options(fmt):
    return fmt.serialize()["options"]


def test_number_format_defaults_send_no_options():
    assert options(formats.NumberFormat()) == {}


def test_number_format_options():
    fmt = formats.NumberFormat(decimals=2, compact=True, prefix="~", suffix="km")

    assert options(fmt) == {
        "decimals": 2,
        "compact": True,
        "prefix": "~",
        "suffix": "km",
    }


@pytest.mark.parametrize(
    "kwargs",
    [
        {"decimals": -1},
        {"decimals": 21},
        {"decimals": 1.5},
        {"decimals": True},
        {"compact": "yes"},
        {"prefix": 5},
        {"suffix": ["km"]},
    ],
)
def test_number_format_rejects_invalid_options(kwargs):
    with pytest.raises((TypeError, ValueError)):
        formats.NumberFormat(**kwargs)


def test_currency_format():
    fmt = formats.CurrencyFormat("EUR", decimals=0)

    assert isinstance(fmt, formats.NumberFormat)
    assert fmt.serialize() == {
        "name": "CurrencyFormat",
        "options": {"decimals": 0, "currency": "EUR"},
    }


@pytest.mark.parametrize("currency", ["eur", "EURO", "€", "", None, 978])
def test_currency_format_rejects_invalid_codes(currency):
    with pytest.raises(ValueError):
        formats.CurrencyFormat(currency)


def test_currency_format_needs_a_currency():
    with pytest.raises(TypeError):
        formats.CurrencyFormat()


def test_percent_format():
    assert options(formats.PercentFormat()) == {}
    assert options(formats.PercentFormat(decimals=1, fraction=True)) == {
        "decimals": 1,
        "fraction": True,
    }

    with pytest.raises(TypeError):
        formats.PercentFormat(fraction=1)


def test_badge_format_options():
    fmt = formats.BadgeFormat(colors={"published": "green", 3: "red"})

    # Keys are sent as strings, as JSON object keys are.
    assert options(fmt) == {
        "colors": {"published": "green", "3": "red"},
        "default_color": "gray",
    }
    assert options(formats.BadgeFormat(default_color="blue")) == {
        "default_color": "blue"
    }


@pytest.mark.parametrize(
    "kwargs",
    [
        {"colors": {"published": "lime"}},
        {"colors": {"published": "#00ff00"}},
        {"colors": [("published", "green")]},
        {"colors": {None: "green"}},
        {"colors": {True: "green"}},
        {"default_color": "orange"},
    ],
)
def test_badge_format_rejects_invalid_options(kwargs):
    with pytest.raises((TypeError, ValueError)):
        formats.BadgeFormat(**kwargs)


def test_date_formats():
    assert options(formats.DateFormat()) == {"style": "medium"}
    assert options(formats.DateFormat(style="long")) == {"style": "long"}
    assert options(formats.DateTimeFormat()) == {
        "relative": True,
        "style": "medium",
    }
    assert options(formats.DateTimeFormat(relative=False, style="short")) == {
        "relative": False,
        "style": "short",
    }


@pytest.mark.parametrize(
    "make",
    [
        lambda: formats.DateFormat(style="full"),
        lambda: formats.DateFormat(style="D MMM YYYY"),
        lambda: formats.DateTimeFormat(style="tiny"),
        lambda: formats.DateTimeFormat(relative="yes"),
    ],
)
def test_date_formats_reject_invalid_options(make):
    with pytest.raises((TypeError, ValueError)):
        make()


@pytest.mark.parametrize(
    "fmt",
    [
        formats.LinkFormat,
        formats.EmailFormat,
        formats.ManyToManyFormat,
        formats.ManyMediaFormat,
        formats.TagFormat,
        formats.HtmlFormat,
    ],
)
def test_formats_without_options(fmt):
    assert fmt().serialize() == {"name": fmt.__name__, "options": {}}


def test_formats_with_options_work_on_table_columns():
    column = TableColumn("price", format=formats.CurrencyFormat("USD"))

    assert column.serialize()["format"] == {
        "name": "CurrencyFormat",
        "options": {"currency": "USD"},
    }


def test_default_formats_of_new_field_types():
    mapping = admin_site.default_format_mapping

    assert mapping[models.EmailField] is formats.EmailFormat
    assert mapping[models.URLField] is formats.LinkFormat
    assert mapping[models.ManyToManyField] is formats.ManyToManyFormat


class InfoFormatsTests(TestCase):
    def test_info_lists_the_new_default_formats(self):
        data = self.client.get("/api/info").json()

        self.assertEqual(
            data["formats"]["EmailField"], {"name": "EmailFormat", "options": {}}
        )
        self.assertEqual(
            data["formats"]["URLField"], {"name": "LinkFormat", "options": {}}
        )
        self.assertEqual(
            data["formats"]["ManyToManyField"],
            {"name": "ManyToManyFormat", "options": {}},
        )
        self.assertEqual(
            data["formats"]["DateTimeField"],
            {
                "name": "DateTimeFormat",
                "options": {"relative": True, "style": "medium"},
            },
        )
