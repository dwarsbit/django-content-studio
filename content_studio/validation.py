"""
Model validation on save: like the classic admin's ModelForm, a save
runs the model's validation, so the rules of Model.clean(), the unique
checks and the model's constraints hold for the admin too.
"""

from django.core.exceptions import NON_FIELD_ERRORS, FieldDoesNotExist
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from django.utils.text import capfirst
from rest_framework import serializers
from rest_framework.settings import api_settings


def get_validation_exclusions(serializer, instance, extra=()) -> set[str]:
    """
    The model fields full_clean() leaves alone: those the serializer does
    not write, like the fields that are not on a ModelForm. The edit page
    renders exactly the writable fields, so a field the editor cannot see
    or change never blocks a save. Fields the server sets itself (extra,
    such as the tenant or the creator) are validated.
    """
    written = {
        field.source
        for field in serializer._writable_fields
        if field.source and field.source != "*"
    }
    written.update(extra)

    return {
        field.name
        for field in instance._meta.concrete_fields
        if field.name not in written and field.attname not in written
    }


def full_clean(serializer, instance, extra=()):
    """
    Validate the instance before it is saved, as Model.full_clean() does:
    clean(), then the unique checks and the constraints. Its errors become
    a serializer validation error: per field for the fields the editor
    writes, under non_field_errors for the rest, which the editor shows
    above the form.

    clean_fields() is left out: the serializer already ran the model
    fields' validators on what it writes, and it treats a null=True field
    as optional where clean_fields() would also want blank=True.
    """
    exclude = get_validation_exclusions(serializer, instance, extra)
    errors: dict = {}

    try:
        instance.clean()
    except DjangoValidationError as error:
        errors = error.update_error_dict(errors)

    # Like full_clean(): only fields that passed are checked for
    # uniqueness.
    exclude.update(name for name in errors if name != NON_FIELD_ERRORS)

    for check in (instance.validate_unique, instance.validate_constraints):
        try:
            check(exclude=exclude)
        except DjangoValidationError as error:
            errors = error.update_error_dict(errors)

    if errors:
        raise serializers.ValidationError(
            as_serializer_errors(serializer, DjangoValidationError(errors))
        )


def as_serializer_errors(serializer, error: DjangoValidationError) -> dict:
    """
    The errors of a model's ValidationError keyed like the serializer's:
    a field the serializer writes keeps its own errors; the errors of any
    other field are non-field errors, led by the field's name.
    """
    non_field_key = api_settings.NON_FIELD_ERRORS_KEY
    writable = {
        name: field for name, field in serializer.fields.items() if not field.read_only
    }
    errors: dict[str, list[str]] = {}

    if not hasattr(error, "error_dict"):
        return {non_field_key: list(error.messages)}

    for name, messages in error.message_dict.items():
        if name == NON_FIELD_ERRORS:
            errors.setdefault(non_field_key, []).extend(messages)
        elif name in writable:
            errors.setdefault(name, []).extend(messages)
        else:
            label = _field_label(serializer, name)
            errors.setdefault(non_field_key, []).extend(
                f"{label}: {message}" for message in messages
            )

    return errors


def _field_label(serializer, name: str) -> str:
    model = serializer.Meta.model

    try:
        return str(capfirst(model._meta.get_field(name).verbose_name))
    except FieldDoesNotExist:
        return name


def uses_plain_create(model: type[models.Model]) -> bool:
    """
    Whether the default manager creates objects the stock way, so the
    validated instance itself can be inserted. A manager with its own
    create() (such as SingletonManager, which updates an existing
    singleton) is called instead.
    """
    manager = model._default_manager

    return getattr(type(manager), "create", None) is models.Manager.create
