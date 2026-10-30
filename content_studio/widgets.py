__all__ = [
    "BaseWidget",
    "BlockWidget",
    "CheckboxWidget",
    "CoverImageWidget",
    "DateTimeWidget",
    "DateWidget",
    "ForeignKeyWidget",
    "InputWidget",
    "JSONSchemaWidget",
    "JSONWidget",
    "ManyMediaWidget",
    "ManyToManyWidget",
    "MediaWidget",
    "MultiSelectWidget",
    "RadioButtonWidget",
    "RichTextWidget",
    "SelectWidget",
    "SlugWidget",
    "SwitchWidget",
    "TagWidget",
    "TextAreaWidget",
    "TimeWidget",
    "ToggleGroupWidget",
    "URLPathWidget",
]
import datetime
from decimal import Decimal
from typing import Callable, Iterable, Optional, Union

from django.utils import timezone

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


def as_number(value):
    """A number option as a JSON number; decimals become floats."""
    return float(value) if isinstance(value, Decimal) else value


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
    ):
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

    def get_options(self):
        return {
            "placeholder": self.placeholder,
            "prefix": self.prefix,
            "suffix": self.suffix,
            # Decimals (for a DecimalField) as JSON numbers.
            "min_value": as_number(self.min_value),
            "max_value": as_number(self.max_value),
            "step": as_number(self.step),
        }


class TextAreaWidget(BaseWidget):
    """
    A multi-line input that grows with its text; rows sets the height
    it starts at.
    """

    def __init__(self, *, rows: int = None, placeholder: str = None):
        if rows is not None and (
            isinstance(rows, bool) or not isinstance(rows, int) or rows < 1
        ):
            raise ValueError(
                f"TextAreaWidget rows must be a positive int; got {rows!r}."
            )

        self.rows = rows
        self.placeholder = placeholder

    def get_options(self):
        return {"rows": self.rows, "placeholder": self.placeholder}


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
    pass


class MediaWidget(BaseWidget):
    pass


class ManyMediaWidget(BaseWidget):
    pass


class CoverImageWidget(BaseWidget):
    """
    A single image shown large, in a 16:9 frame, for a MediaField: with
    upload by drag and drop, the media item's alt text and its focal
    point. Not used by default.
    """

    pass


class TagWidget(BaseWidget):
    pass


class BlockWidget(BaseWidget):
    pass
