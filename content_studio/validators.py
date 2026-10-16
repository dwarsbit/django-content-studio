import jsonschema
from django.core.exceptions import ValidationError
from django.utils.deconstruct import deconstructible
from django.utils.translation import gettext_lazy as _


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
