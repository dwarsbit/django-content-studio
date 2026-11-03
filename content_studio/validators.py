import jsonschema
from django.core.exceptions import ValidationError
from django.utils.deconstruct import deconstructible
from django.utils.translation import gettext_lazy as _

from .colors import COLOR_FORMATS, parse_color

__all__ = [
    "ChoiceOptionsValidator",
    "ColorValidator",
    "JSONSchemaValidator",
]


@deconstructible
class JSONSchemaValidator:
    json_schema = None
    message = _("Enter a valid value.")
    code = "invalid"

    def __init__(self, json_schema=None, message=None, code=None):
        if json_schema is not None:
            self.json_schema = json_schema
        if message is not None:
            self.message = message
        if code is not None:
            self.code = code

    def __call__(self, value):
        """
        Validates the value against a JSON schema.
        """
        try:
            jsonschema.validate(value, self.json_schema)
        except jsonschema.ValidationError:
            raise ValidationError(self.message, code=self.code, params={"value": value})

    def __eq__(self, other):
        return (
            isinstance(other, JSONSchemaValidator)
            and self.json_schema == other.json_schema
            and (self.message == other.message)
            and (self.code == other.code)
        )


@deconstructible
class ChoiceOptionsValidator:
    options = []
    message = _("One or more values are not valid choices.")
    code = "invalid_choice"

    def __init__(self, options=None, message=None, code=None):
        if options is not None:
            self.options = options
        if message is not None:
            self.message = message
        if code is not None:
            self.code = code

    def __call__(self, value):
        """
        Validates that every value in the list is one of the allowed choices.
        """
        allowed = {option for option, _ in self.options}
        invalid = [value for value in value if value not in allowed]

        if invalid:
            raise ValidationError(self.message, code=self.code, params={"value": value})

    def __eq__(self, other):
        return (
            isinstance(other, ChoiceOptionsValidator)
            and self.options == other.options
            and (self.message == other.message)
            and (self.code == other.code)
        )


def check_color_options(owner: str, color_format, alpha) -> None:
    """Raises when color_format or alpha is not a valid color option."""
    if color_format is not None and color_format not in COLOR_FORMATS:
        raise ValueError(
            f"{owner} color_format must be one of {list(COLOR_FORMATS)!r}; "
            f"got {color_format!r}."
        )

    if not isinstance(alpha, bool):
        raise TypeError(f"{owner} alpha must be True or False; got {alpha!r}.")


@deconstructible
class ColorValidator:
    """
    Validates a CSS color in hex, rgb() or hsl() notation. color_format
    ("hex", "rgb" or "hsl") accepts only that notation; None accepts all
    three. Translucent colors need alpha=True.
    """

    color_format = None
    alpha = False
    message = _("Enter a valid color.")
    alpha_message = _("Transparent colors are not allowed.")
    code = "invalid_color"

    def __init__(self, color_format=None, alpha=False, message=None, code=None):
        check_color_options("ColorValidator", color_format, alpha)

        self.color_format = color_format
        self.alpha = alpha
        if message is not None:
            self.message = message
        if code is not None:
            self.code = code

    def __call__(self, value):
        color = parse_color(value)

        if color is None or (
            self.color_format is not None and color.source != self.color_format
        ):
            raise ValidationError(self.message, code=self.code, params={"value": value})

        if not self.alpha and color.alpha < 1:
            raise ValidationError(
                self.alpha_message, code=self.code, params={"value": value}
            )

    def __eq__(self, other):
        return (
            isinstance(other, ColorValidator)
            and self.color_format == other.color_format
            and self.alpha == other.alpha
            and (self.message == other.message)
            and (self.code == other.code)
        )
