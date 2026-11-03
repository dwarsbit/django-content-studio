__all__ = [
    "BaseWidget",
    "BlockWidget",
    "CheckboxWidget",
    "CodeWidget",
    "ColorPickerWidget",
    "CoverImageWidget",
    "DateTimeWidget",
    "DateWidget",
    "DurationWidget",
    "EmailWidget",
    "FileWidget",
    "ForeignKeyWidget",
    "IconPickerWidget",
    "InputWidget",
    "JSONSchemaWidget",
    "JSONWidget",
    "KeyValueWidget",
    "ListWidget",
    "ManyMediaWidget",
    "ManyToManyWidget",
    "MarkdownWidget",
    "MediaWidget",
    "MultiSelectWidget",
    "PasswordWidget",
    "PhoneWidget",
    "RadioButtonWidget",
    "RatingWidget",
    "RichTextWidget",
    "SelectWidget",
    "SliderWidget",
    "SlugWidget",
    "SwitchWidget",
    "TagWidget",
    "TextAreaWidget",
    "TimeWidget",
    "ToggleGroupWidget",
    "URLPathWidget",
    "URLWidget",
]
import datetime
from decimal import Decimal
from typing import Callable, Iterable, Optional, Union

from django.utils import timezone

from .colors import parse_color

###
# Widgets determine what input field is used for a certain
# model field. Each Django model field has a default widget,
# but this can be overridden in the admin model.
#
# A widget is given as a class, or as an instance to pass options:
# widgets.TextAreaWidget(rows=10). A class is the instance without
# options.
###

DateOption = Union[datetime.date, Callable[[], datetime.date], None]

# The rich text editor's features, in toolbar order.
RICH_TEXT_FEATURES = (
    "heading",
    "blockquote",
    "code_block",
    "bold",
    "italic",
    "underline",
    "strike",
    "ordered_list",
    "bullet_list",
    "link",
)


# The languages CodeWidget highlights.
CODE_LANGUAGES = ("css", "html", "javascript", "json")


class BaseWidget:
    def get_options(self) -> dict:
        """
        The widget's options for the admin, as JSON-safe values. Unset
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


def is_aspect_ratio(value) -> bool:
    """Whether value is an aspect ratio of two positive ints, like "16:9"."""
    if not isinstance(value, str):
        return False

    parts = value.split(":")

    return len(parts) == 2 and all(
        part.isascii() and part.isdigit() and int(part) > 0 for part in parts
    )


def as_number(value):
    """A number option as a JSON number; decimals become floats."""
    return float(value) if isinstance(value, Decimal) else value


def check_number(owner: str, name: str, value):
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise TypeError(f"{owner} {name} must be a number; got {value!r}.")


def check_bool(owner: str, name: str, value):
    if not isinstance(value, bool):
        raise TypeError(f"{owner} {name} must be True or False; got {value!r}.")


def check_counter(owner: str, show_count, recommended_length):
    """
    The character counter's options: show_count None shows it once the
    text nears its limit, True always, False never; recommended_length
    is a soft limit, such as 60 for an SEO title.
    """
    if show_count is not None:
        check_bool(owner, "show_count", show_count)

    if recommended_length is not None and (
        isinstance(recommended_length, bool)
        or not isinstance(recommended_length, int)
        or recommended_length < 1
    ):
        raise ValueError(
            f"{owner} recommended_length must be a positive int; "
            f"got {recommended_length!r}."
        )


def serialize_date_option(value: DateOption) -> Optional[str]:
    """
    A date option as an ISO date. Callables are evaluated on every
    request, so date.today stays current; datetimes count by their
    local date.
    """
    if callable(value):
        value = value()

    if value is None:
        return None

    if isinstance(value, datetime.datetime):
        value = timezone.localdate(value) if timezone.is_aware(value) else value.date()

    return value.isoformat()


class InputWidget(BaseWidget):
    """
    A single-line input. min_value, max_value and step turn it into a
    number input; prefix and suffix are shown inside the box, around
    the value (a currency or a unit).

    A field with a max_length shows a character counter once the text
    reaches 80% of it; show_count=True shows it always, False never.
    recommended_length is a soft limit the counter warns about.
    """

    def __init__(
        self,
        *,
        placeholder: str = None,
        prefix: str = None,
        suffix: str = None,
        min_value: Union[int, float, Decimal] = None,
        max_value: Union[int, float, Decimal] = None,
        step: Union[int, float, Decimal] = None,
        show_count: bool = None,
        recommended_length: int = None,
    ):
        check_counter("InputWidget", show_count, recommended_length)

        for name, value in (
            ("min_value", min_value),
            ("max_value", max_value),
            ("step", step),
        ):
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, (int, float, Decimal))
            ):
                raise TypeError(f"InputWidget {name} must be a number; got {value!r}.")

        if step is not None and step <= 0:
            raise ValueError(f"InputWidget step must be positive; got {step!r}.")

        if min_value is not None and max_value is not None and min_value > max_value:
            raise ValueError(
                f"InputWidget min_value {min_value!r} is greater than "
                f"max_value {max_value!r}."
            )

        self.placeholder = placeholder
        self.prefix = prefix
        self.suffix = suffix
        self.min_value = min_value
        self.max_value = max_value
        self.step = step
        self.show_count = show_count
        self.recommended_length = recommended_length

    def get_options(self):
        return {
            "placeholder": self.placeholder,
            "prefix": self.prefix,
            "suffix": self.suffix,
            # Decimals (for a DecimalField) as JSON numbers.
            "min_value": as_number(self.min_value),
            "max_value": as_number(self.max_value),
            "step": as_number(self.step),
            "show_count": self.show_count,
            "recommended_length": self.recommended_length,
        }


class TextAreaWidget(BaseWidget):
    """
    A multi-line input that grows with its text; rows sets the height
    it starts at. show_count and recommended_length work as on
    InputWidget.
    """

    def __init__(
        self,
        *,
        rows: int = None,
        placeholder: str = None,
        show_count: bool = None,
        recommended_length: int = None,
    ):
        owner = type(self).__name__
        check_counter(owner, show_count, recommended_length)

        if rows is not None and (
            isinstance(rows, bool) or not isinstance(rows, int) or rows < 1
        ):
            raise ValueError(f"{owner} rows must be a positive int; got {rows!r}.")

        self.rows = rows
        self.placeholder = placeholder
        self.show_count = show_count
        self.recommended_length = recommended_length

    def get_options(self):
        return {
            "rows": self.rows,
            "placeholder": self.placeholder,
            "show_count": self.show_count,
            "recommended_length": self.recommended_length,
        }


class MarkdownWidget(TextAreaWidget):
    """
    Markdown typed as text, for a TextField that stores Markdown: a
    toolbar for headings, bold, italic, links and lists, and a Preview
    tab that shows it rendered (raw HTML is not). Takes the options of
    TextAreaWidget. Not used by default.
    """


class CodeWidget(BaseWidget):
    """
    A code editor with line numbers, for embed codes and snippets.
    language ("css", "html", "javascript" or "json") turns on syntax
    highlighting; without it the code is plain text. Not used by
    default.
    """

    def __init__(self, *, language: str = None):
        if language is not None and language not in CODE_LANGUAGES:
            raise ValueError(
                f"CodeWidget language must be one of {', '.join(CODE_LANGUAGES)}; "
                f"got {language!r}."
            )

        self.language = language

    def get_options(self):
        return {"language": self.language}


class IconPickerWidget(BaseWidget):
    """
    A Phosphor icon picked from a searchable grid, for a CharField. The
    value is the icon's class, such as "ph-bold ph-star", as Callout's
    icon option and block icons take it. Not used by default.
    """


class KeyValueWidget(BaseWidget):
    """
    A JSONField dict of strings, edited as rows of a key and a value.
    A key that is empty or used twice keeps the form from saving. Not
    used by default.
    """


class ListWidget(BaseWidget):
    """
    A JSONField list of strings, edited as rows that can be added,
    removed and dragged into order. Not used by default.
    """


class RatingWidget(BaseWidget):
    """
    Stars for a small integer, from 1 to max_value. Clicking the
    current star again clears an optional field. Not used by default.
    """

    def __init__(self, *, max_value: int = 5):
        if (
            isinstance(max_value, bool)
            or not isinstance(max_value, int)
            or not 1 < max_value <= 10
        ):
            raise ValueError(
                f"RatingWidget max_value must be an int from 2 to 10; got {max_value!r}."
            )

        self.max_value = max_value

    def get_options(self):
        return {"max_value": self.max_value}


class PlaceholderWidget(BaseWidget):
    """Base of the typed inputs: an optional placeholder."""

    def __init__(self, *, placeholder: str = None):
        if placeholder is not None and not isinstance(placeholder, str):
            raise TypeError(
                f"{self.__class__.__name__} placeholder must be a string; "
                f"got {placeholder!r}."
            )

        self.placeholder = placeholder

    def get_options(self):
        return {"placeholder": self.placeholder}


class EmailWidget(PlaceholderWidget):
    """An email input with a button that writes to the address."""


class URLWidget(PlaceholderWidget):
    """A URL input with a button that opens the link in a new tab."""


class PhoneWidget(PlaceholderWidget):
    """
    A phone number input: the phone keyboard on mobile devices. The
    number is kept as typed.
    """


class PasswordWidget(PlaceholderWidget):
    """
    A masked input with a button to show the value, for API keys and
    secrets. write_only=True never sends the saved value to the admin:
    the field shows whether a value is set, and editors type a new one
    to replace it.
    """

    def __init__(self, *, write_only: bool = False, placeholder: str = None):
        check_bool("PasswordWidget", "write_only", write_only)
        super().__init__(placeholder=placeholder)
        self.write_only = write_only

    def get_options(self):
        return {**super().get_options(), "write_only": self.write_only}


class SliderWidget(BaseWidget):
    """
    A slider from min_value to max_value in steps of step, with the
    value next to it; suffix is shown after the value (a unit).
    """

    def __init__(
        self,
        *,
        min_value: Union[int, float, Decimal],
        max_value: Union[int, float, Decimal],
        step: Union[int, float, Decimal] = 1,
        suffix: str = None,
    ):
        for name, value in (
            ("min_value", min_value),
            ("max_value", max_value),
            ("step", step),
        ):
            check_number("SliderWidget", name, value)

        if step <= 0:
            raise ValueError(f"SliderWidget step must be positive; got {step!r}.")

        if min_value >= max_value:
            raise ValueError(
                f"SliderWidget min_value {min_value!r} must be less than "
                f"max_value {max_value!r}."
            )

        if suffix is not None and not isinstance(suffix, str):
            raise TypeError(f"SliderWidget suffix must be a string; got {suffix!r}.")

        self.min_value = min_value
        self.max_value = max_value
        self.step = step
        self.suffix = suffix

    def get_options(self):
        return {
            "min_value": as_number(self.min_value),
            "max_value": as_number(self.max_value),
            "step": as_number(self.step),
            "suffix": self.suffix,
        }


class DurationWidget(BaseWidget):
    """
    Hours, minutes and seconds boxes for a DurationField. show_days
    adds a days box; show_seconds=False leaves out the seconds.
    """

    def __init__(self, *, show_days: bool = False, show_seconds: bool = True):
        check_bool("DurationWidget", "show_days", show_days)
        check_bool("DurationWidget", "show_seconds", show_seconds)
        self.show_days = show_days
        self.show_seconds = show_seconds

    def get_options(self):
        return {"show_days": self.show_days, "show_seconds": self.show_seconds}


class FileWidget(BaseWidget):
    """
    A file picker for a FileField or ImageField, with drag and drop. A
    picked file is uploaded right away and attached when the object is
    saved; an ImageField shows a preview.
    """


class SwitchWidget(BaseWidget):
    pass


class ToggleGroupWidget(BaseWidget):
    pass


class CheckboxWidget(BaseWidget):
    pass


class DateLimitsWidget(BaseWidget):
    """
    Base of the date pickers: min_date and max_date limit the days they
    offer; pass a callable such as date.today for a limit that moves
    with time.
    """

    def __init__(self, *, min_date: DateOption = None, max_date: DateOption = None):
        for name, value in (("min_date", min_date), ("max_date", max_date)):
            if value is not None and not (
                callable(value) or isinstance(value, datetime.date)
            ):
                raise TypeError(
                    f"{self.__class__.__name__} {name} must be a date or a "
                    f"callable returning one; got {value!r}."
                )

        if (
            isinstance(min_date, datetime.date)
            and isinstance(max_date, datetime.date)
            and serialize_date_option(min_date) > serialize_date_option(max_date)
        ):
            raise ValueError(
                f"{self.__class__.__name__} min_date {min_date!r} is after "
                f"max_date {max_date!r}."
            )

        self.min_date = min_date
        self.max_date = max_date

    def get_options(self):
        return {
            "min_date": serialize_date_option(self.min_date),
            "max_date": serialize_date_option(self.max_date),
        }


class DateWidget(DateLimitsWidget):
    """A date picker."""


class DateTimeWidget(DateLimitsWidget):
    """A date and time picker."""


class TimeWidget(BaseWidget):
    pass


class RichTextWidget(BaseWidget):
    """
    A rich text editor. features limits the editor to the listed
    formatting (see RICH_TEXT_FEATURES); anything else is left out of
    the toolbar and stripped from pasted text. heading_levels limits
    the heading levels offered.
    """

    def __init__(
        self,
        *,
        features: Iterable[str] = None,
        heading_levels: Iterable[int] = None,
    ):
        if features is not None:
            if isinstance(features, str):
                raise TypeError(
                    "RichTextWidget features must be a list of feature names, "
                    f"not a string; got {features!r}."
                )

            features = list(features)
            unknown = [f for f in features if f not in RICH_TEXT_FEATURES]

            if unknown:
                raise ValueError(
                    f"RichTextWidget has unknown features {unknown!r}; choose "
                    f"from {list(RICH_TEXT_FEATURES)!r}."
                )

        if heading_levels is not None:
            heading_levels = sorted(set(heading_levels))

            if not heading_levels or not all(
                isinstance(level, int)
                and not isinstance(level, bool)
                and 1 <= level <= 6
                for level in heading_levels
            ):
                raise ValueError(
                    "RichTextWidget heading_levels must be one or more of 1-6; "
                    f"got {heading_levels!r}."
                )

        self.features = features
        self.heading_levels = heading_levels

    def get_options(self):
        return {"features": self.features, "heading_levels": self.heading_levels}


class RadioButtonWidget(BaseWidget):
    pass


class SelectWidget(BaseWidget):
    pass


class MultiSelectWidget(BaseWidget):
    pass


class URLPathWidget(BaseWidget):
    pass


class SlugWidget(BaseWidget):
    pass


class ForeignKeyWidget(BaseWidget):
    pass


class ManyToManyWidget(BaseWidget):
    pass


class JSONSchemaWidget(BaseWidget):
    pass


class JSONWidget(BaseWidget):
    """
    A JSONField's value in a JSON editor. JSON that does not parse is
    underlined and keeps the form from saving. The default for
    JSONField.
    """


class MediaWidget(BaseWidget):
    pass


class ManyMediaWidget(BaseWidget):
    pass


class CoverImageWidget(BaseWidget):
    """
    A single image shown large, in a 16:9 frame, for a MediaField: with
    upload by drag and drop, the media item's alt text and its focal
    point. Not used by default.

    aspect_ratio ("21:9", "1:1", ...) sets the frame's shape. min_width
    and min_height (pixels) warn editors about an image that is too
    small; they do not reject it.
    """

    def __init__(
        self,
        *,
        aspect_ratio: str = None,
        min_width: int = None,
        min_height: int = None,
    ):
        if aspect_ratio is not None and not is_aspect_ratio(aspect_ratio):
            raise ValueError(
                "CoverImageWidget aspect_ratio must be two positive whole "
                f'numbers like "16:9"; got {aspect_ratio!r}.'
            )

        for name, value in (("min_width", min_width), ("min_height", min_height)):
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, int) or value < 1
            ):
                raise ValueError(
                    f"CoverImageWidget {name} must be a positive int (pixels); "
                    f"got {value!r}."
                )

        self.aspect_ratio = aspect_ratio
        self.min_width = min_width
        self.min_height = min_height

    def get_options(self):
        return {
            "aspect_ratio": self.aspect_ratio,
            "min_width": self.min_width,
            "min_height": self.min_height,
        }


class ColorPickerWidget(BaseWidget):
    """
    A color swatch that opens a color picker. show_input adds a text
    input to type or paste a color; swatches are colors offered below
    the picker, such as a brand palette.
    """

    def __init__(self, *, show_input: bool = True, swatches: Iterable[str] = None):
        if not isinstance(show_input, bool):
            raise TypeError(
                f"ColorPickerWidget show_input must be True or False; got {show_input!r}."
            )

        if swatches is not None:
            if isinstance(swatches, str):
                raise TypeError(
                    "ColorPickerWidget swatches must be a list of colors, not a "
                    f"string; got {swatches!r}."
                )

            swatches = list(swatches)
            invalid = [swatch for swatch in swatches if parse_color(swatch) is None]

            if invalid:
                raise ValueError(
                    f"ColorPickerWidget swatches {invalid!r} are not hex, rgb() "
                    "or hsl() colors."
                )

        self.show_input = show_input
        self.swatches = swatches

    def get_options(self):
        return {"show_input": self.show_input, "swatches": self.swatches}


class TagWidget(BaseWidget):
    pass


class BlockWidget(BaseWidget):
    pass
