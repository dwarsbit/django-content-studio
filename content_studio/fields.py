import jsonschema
from django.core.validators import RegexValidator
from django.db import models
from django.utils.module_loading import import_string
from django.utils.translation import gettext_lazy as _

from .sanitizers import get_default_sanitizer
from .validators import ChoiceOptionsValidator, JSONSchemaValidator


class HTMLField(models.TextField):
    description = "A field for HTML content, sanitized on save."

    def __init__(self, *args, sanitizer=None, **kwargs):
        """
        `sanitizer` is a callable (str -> str) or a dotted import path to
        one, and replaces the default sanitizer for this field. Use a
        module-level function so migrations can serialize it. `None`
        resolves lazily: the BLUEPRINT["HTML_SANITIZER"] setting first,
        then the built-in allowlist sanitizer.
        """
        self.sanitizer = sanitizer

        super().__init__(*args, **kwargs)

    def get_sanitizer(self):
        if callable(self.sanitizer):
            return self.sanitizer

        if isinstance(self.sanitizer, str):
            return import_string(self.sanitizer)

        return get_default_sanitizer()

    def pre_save(self, model_instance, add):
        value = super().pre_save(model_instance, add)

        if value and isinstance(value, str):
            value = self.get_sanitizer()(value)

            setattr(model_instance, self.attname, value)

        return value

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()

        if self.sanitizer is not None:
            kwargs["sanitizer"] = self.sanitizer

        return name, path, args, kwargs


class FlexField(models.JSONField):
    description = "A JSON field with automatic validation against a schema."

    json_schema = None

    def __init__(self, schema, *args, **kwargs):
        if not schema:
            raise ValueError("The schema parameter is required.")

        try:
            jsonschema.validators.validator_for(schema).check_schema(schema)
        except jsonschema.SchemaError:
            raise ValueError("Not a valid JSON schema.")

        self.json_schema = schema

        # The schema validator is a default: caller-supplied validators are
        # appended to it instead of replacing it.
        self.default_validators = [JSONSchemaValidator(json_schema=self.json_schema)]

        super().__init__(*args, **kwargs)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        kwargs["schema"] = self.json_schema
        return name, path, args, kwargs


class URLPathField(models.CharField):
    description = "A field for a unique URL path. Only accepts letters, numbers, underscores, hyphens and slashes."

    default_validators = [
        RegexValidator(
            "^[a-zA-Z0-9_/-]+$",
            message=_(
                "Only accepts letters, numbers, underscores, hyphens and slashes."
            ),
        ),
        RegexValidator(
            "//",
            inverse_match=True,
            message=_("Consecutive slashes are not allowed."),
        ),
    ]

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("unique", True)
        kwargs.setdefault("max_length", 200)

        super().__init__(*args, **kwargs)

    def pre_save(self, model_instance, add):
        """
        Make sure paths start with a slash and do not end with one.
        The root path "/" is kept as-is.
        """
        value: str = getattr(model_instance, self.attname, "")

        if value is None:
            return value

        if not value.startswith("/"):
            value = f"/{value}"

        if value.endswith("/") and len(value) > 1:
            value = value[:-1]

        setattr(model_instance, self.attname, value)

        return value


class MultipleChoiceField(models.JSONField):
    description = "A field for storing multiple choices as a JSON array."

    def __init__(self, *args, options=None, **kwargs):
        kwargs.setdefault("default", list)
        kwargs.setdefault("blank", True)

        if not options:
            options = []

        self.options = (
            list(options.items()) if isinstance(options, dict) else list(options)
        )

        # The options validator is a default: caller-supplied validators are
        # appended to it instead of replacing it.
        self.default_validators = [ChoiceOptionsValidator(options=self.options)]

        super().__init__(*args, **kwargs)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        kwargs["options"] = self.options
        return name, path, args, kwargs


class TagField(models.JSONField):
    description = "A field for storing tags as a JSON array."

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("default", list)
        kwargs.setdefault("blank", True)

        super().__init__(*args, **kwargs)

    def pre_save(self, model_instance, add):
        """
        Trims surrounding whitespace from every tag and drops duplicates
        and tags that end up empty. Tags are otherwise kept exactly as
        given: any string is valid.
        """
        value = super().pre_save(model_instance, add)

        if value is None or not isinstance(value, list):
            return value

        trimmed = []
        for tag in value:
            tag = str(tag).strip()

            if tag and tag not in trimmed:
                trimmed.append(tag)

        setattr(model_instance, self.attname, trimmed)
        return trimmed


class HashTagField(TagField):
    description = (
        "A field for storing hashtags as a JSON array. "
        "Values are normalized to lowercase, without spaces or hash signs."
    )

    def pre_save(self, model_instance, add):
        """
        Normalizes every tag to a hashtag form: lowercase, without any
        whitespace or hash signs, and without duplicates.
        """
        value = super().pre_save(model_instance, add)

        if value is None or not isinstance(value, list):
            return value

        normalized = []
        for tag in value:
            tag = "".join(tag.split()).replace("#", "").lower()

            if tag and tag not in normalized:
                normalized.append(tag)

        setattr(model_instance, self.attname, normalized)
        return normalized
