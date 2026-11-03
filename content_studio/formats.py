__all__ = [
    "BaseFormat",
    "BadgeFormat",
    "BlockFormat",
    "BooleanFormat",
    "ColorFormat",
    "CodeFormat",
    "CurrencyFormat",
    "DateFormat",
    "DateTimeFormat",
    "DurationFormat",
    "EmailFormat",
    "FileFormat",
    "FileSizeFormat",
    "ForeignKeyFormat",
    "HtmlFormat",
    "ImageFormat",
    "JSONFormat",
    "LinkFormat",
    "ManyMediaFormat",
    "ManyToManyFormat",
    "MediaFormat",
    "NumberFormat",
    "PercentFormat",
    "ProgressFormat",
    "TagFormat",
    "TextFormat",
    "TimeFormat",
]

import re
from typing import Mapping, Union

###
# Formats determine how fields are displayed in Django Content Studio.
# Each Django model field has a default format, but this can be
# overridden in the admin model.
#
# A format is given as a class, or as an instance to pass options. A
# class is the instance without options.
###

# The colors a BadgeFormat offers, tuned for the light and dark theme.
BADGE_COLORS = ("gray", "blue", "green", "yellow", "red", "purple")

# The date styles of DateFormat and DateTimeFormat, in the editor's
# language: "short" is 03/11/2026, "medium" 3 Nov 2026, "long"
# 3 November 2026 (in English).
DATE_STYLES = ("short", "medium", "long")

# The styles of DurationFormat, in the editor's language: "narrow" is
# 1h 20m, "short" 1 hr, 20 min, "long" 1 hour, 20 minutes (in English).
DURATION_STYLES = ("narrow", "short", "long")

CURRENCY_CODE = re.compile(r"[A-Z]{3}")


class BaseFormat:
    def get_options(self) -> dict:
        """
        The format's options for the admin, as JSON-safe values. Unset
        options (None) are left out.
        """
        return {}

    def serialize(self):
        return {
            "name": self.__class__.__name__,
            "options": {
                key: value
                for key, value in self.get_options().items()
                if value is not None
            },
        }


def check_bool(owner: str, name: str, value):
    if not isinstance(value, bool):
        raise TypeError(f"{owner} {name} must be True or False; got {value!r}.")


def check_positive_int(owner: str, name: str, value):
    if value is not None and (
        isinstance(value, bool) or not isinstance(value, int) or value < 1
    ):
        raise ValueError(f"{owner} {name} must be a positive int; got {value!r}.")


def check_style(owner: str, style):
    if style not in DATE_STYLES:
        raise ValueError(
            f"{owner} style must be one of {list(DATE_STYLES)!r}; got {style!r}."
        )


class ForeignKeyFormat(BaseFormat):
    pass


class ManyToManyFormat(BaseFormat):
    """The related objects as chips: the first three, then "+N"."""


class MediaFormat(BaseFormat):
    pass


class ManyMediaFormat(BaseFormat):
    """A stack of the first three thumbnails, then "+N"."""


class TextFormat(BaseFormat):
    """
    The text. On the list page, max_length cuts it at that many
    characters and lines clamps it to that many lines, with the full
    text on hover; a read-only field always shows it in full.
    """

    def __init__(self, *, max_length: int = None, lines: int = None):
        check_positive_int("TextFormat", "max_length", max_length)
        check_positive_int("TextFormat", "lines", lines)
        self.max_length = max_length
        self.lines = lines

    def get_options(self):
        return {"max_length": self.max_length, "lines": self.lines}


class HtmlFormat(BaseFormat):
    """
    Rich text: a plain-text excerpt on the list page, the formatted text
    in a read-only field on the edit page.
    """


class LinkFormat(BaseFormat):
    """A URL as a link that opens in a new tab."""


class EmailFormat(BaseFormat):
    """An email address as a mailto: link."""


class BooleanFormat(BaseFormat):
    """
    A check or a dash. labels=("Yes", "No") shows words instead, the
    second one muted; colors=("green", "red") shows them as badges, in
    two of BADGE_COLORS.
    """

    def __init__(self, *, labels: tuple = None, colors: tuple = None):
        for name, value in (("labels", labels), ("colors", colors)):
            if value is not None and not (
                isinstance(value, (tuple, list))
                and len(value) == 2
                and all(isinstance(item, str) for item in value)
            ):
                raise TypeError(
                    f"BooleanFormat {name} must be a pair of strings, for "
                    f"True and False; got {value!r}."
                )

        if colors is not None:
            if labels is None:
                raise ValueError("BooleanFormat colors needs labels to color.")

            for color in colors:
                if color not in BADGE_COLORS:
                    raise ValueError(
                        f"BooleanFormat color {color!r} is not one of "
                        f"{list(BADGE_COLORS)!r}."
                    )

        self.labels = tuple(labels) if labels is not None else None
        self.colors = tuple(colors) if colors is not None else None

    def get_options(self):
        return {
            "labels": list(self.labels) if self.labels else None,
            "colors": list(self.colors) if self.colors else None,
        }


class ColorFormat(BaseFormat):
    """A color swatch with the color's value."""


class BadgeFormat(BaseFormat):
    """
    A value as a colored badge, with the choice's label when the field
    has choices. colors maps values to one of BADGE_COLORS; other values
    get default_color.
    """

    def __init__(
        self,
        *,
        colors: Mapping[Union[str, int], str] = None,
        default_color: str = "gray",
    ):
        if colors is not None:
            if not isinstance(colors, Mapping):
                raise TypeError(
                    "BadgeFormat colors must be a dict of values to colors; "
                    f"got {colors!r}."
                )

            for key, color in colors.items():
                if isinstance(key, bool) or not isinstance(key, (str, int)):
                    raise TypeError(
                        "BadgeFormat colors keys must be strings or ints; "
                        f"got {key!r}."
                    )

                if color not in BADGE_COLORS:
                    raise ValueError(
                        f"BadgeFormat color {color!r} for {key!r} is not one "
                        f"of {list(BADGE_COLORS)!r}."
                    )

        if default_color not in BADGE_COLORS:
            raise ValueError(
                f"BadgeFormat default_color must be one of {list(BADGE_COLORS)!r}; "
                f"got {default_color!r}."
            )

        self.colors = dict(colors) if colors is not None else None
        self.default_color = default_color

    def get_options(self):
        return {
            # JSON object keys are strings; the admin matches values by
            # their string form.
            "colors": (
                {str(key): color for key, color in self.colors.items()}
                if self.colors is not None
                else None
            ),
            "default_color": self.default_color,
        }


class DateFormat(BaseFormat):
    """A date in the editor's language, in one of DATE_STYLES."""

    def __init__(self, *, style: str = "medium"):
        check_style("DateFormat", style)
        self.style = style

    def get_options(self):
        return {"style": self.style}


class DateTimeFormat(BaseFormat):
    """
    A date and time. relative (the default) shows it relative to now,
    such as "3 hours ago", with the exact time on hover; relative=False
    shows the date in style, with the time.
    """

    def __init__(self, *, relative: bool = True, style: str = "medium"):
        check_bool("DateTimeFormat", "relative", relative)
        check_style("DateTimeFormat", style)
        self.relative = relative
        self.style = style

    def get_options(self):
        return {"relative": self.relative, "style": self.style}


class TimeFormat(BaseFormat):
    pass


class NumberFormat(BaseFormat):
    """
    A number in the editor's language, with grouped digits (45,940).
    decimals fixes the digits after the decimal point; compact shortens
    large numbers (45.9K) with the exact value on hover; prefix and
    suffix are shown around the number (a unit).
    """

    def __init__(
        self,
        *,
        decimals: int = None,
        compact: bool = False,
        prefix: str = None,
        suffix: str = None,
    ):
        owner = self.__class__.__name__

        if decimals is not None and (
            isinstance(decimals, bool)
            or not isinstance(decimals, int)
            or not 0 <= decimals <= 20
        ):
            raise ValueError(
                f"{owner} decimals must be an int from 0 to 20; got {decimals!r}."
            )

        check_bool(owner, "compact", compact)

        for name, value in (("prefix", prefix), ("suffix", suffix)):
            if value is not None and not isinstance(value, str):
                raise TypeError(f"{owner} {name} must be a string; got {value!r}.")

        self.decimals = decimals
        self.compact = compact
        self.prefix = prefix
        self.suffix = suffix

    def get_options(self):
        return {
            "decimals": self.decimals,
            # Only when set, so the admin's defaults stay the defaults.
            "compact": self.compact or None,
            "prefix": self.prefix,
            "suffix": self.suffix,
        }


class CurrencyFormat(NumberFormat):
    """
    An amount in a currency (an ISO 4217 code such as "EUR"), in the
    editor's language: € 1,250.00.
    """

    def __init__(self, currency: str, *, decimals: int = None, compact: bool = False):
        if not isinstance(currency, str) or not CURRENCY_CODE.fullmatch(currency):
            raise ValueError(
                "CurrencyFormat currency must be a three-letter ISO 4217 code "
                f'such as "EUR"; got {currency!r}.'
            )

        super().__init__(decimals=decimals, compact=compact)
        self.currency = currency

    def get_options(self):
        return {**super().get_options(), "currency": self.currency}


class PercentFormat(NumberFormat):
    """
    A percentage. The value is the percentage (91 is 91%), or with
    fraction=True a fraction of one (0.91 is 91%).
    """

    def __init__(self, *, decimals: int = None, fraction: bool = False):
        check_bool("PercentFormat", "fraction", fraction)
        super().__init__(decimals=decimals)
        self.fraction = fraction

    def get_options(self):
        return {**super().get_options(), "fraction": self.fraction or None}


class FileFormat(BaseFormat):
    """A FileField or ImageField: the file's name, linked to the file."""


class FileSizeFormat(BaseFormat):
    pass


class ImageFormat(BaseFormat):
    """An ImageField as a small thumbnail, the image itself on hover."""


class CodeFormat(BaseFormat):
    """
    The value in a monospace font with a copy button, for identifiers
    such as UUIDs, SKUs and keys.
    """


class DurationFormat(BaseFormat):
    """A duration in the editor's language, in one of DURATION_STYLES."""

    def __init__(self, *, style: str = "narrow"):
        if style not in DURATION_STYLES:
            raise ValueError(
                f"DurationFormat style must be one of {list(DURATION_STYLES)!r}; "
                f"got {style!r}."
            )
        self.style = style

    def get_options(self):
        return {"style": self.style}


class ProgressFormat(BaseFormat):
    """
    A number as a small meter from 0 to max_value, with the number next
    to it. Values outside the range fill the meter or leave it empty.
    """

    def __init__(self, *, max_value: Union[int, float] = 100):
        if (
            isinstance(max_value, bool)
            or not isinstance(max_value, (int, float))
            or max_value <= 0
        ):
            raise ValueError(
                f"ProgressFormat max_value must be a positive number; got {max_value!r}."
            )
        self.max_value = max_value

    def get_options(self):
        return {"max_value": self.max_value}


class TagFormat(BaseFormat):
    """Tags as pills: the first three, then "+N"."""


class JSONFormat(BaseFormat):
    pass


class BlockFormat(BaseFormat):
    pass
