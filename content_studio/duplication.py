"""
Duplicate (save as new): the values a copy of an object starts with,
the free suffixes of its slugs and URL paths, and the inline rows that
are copied along once the copy is saved.

A duplicate is a regular create: the admin opens the create form
prefilled with the copy's values, so nothing is saved until the editor
saves it and every validation runs as usual.
"""

import copy
import re

from django.db import models

from .fields import URLPathField
from .settings import cs_settings
from .utils import (
    get_related_field_name,
    get_tenant_field_name,
    get_tenant_scoped_queryset,
)

# A value that ends in a number suffix, such as "hello-world-2".
SUFFIXED = re.compile(r"^(?P<base>.+)-(?P<number>\d+)$")

# Returned for fields a duplicate does not copy.
SKIP = object()


def is_suffixed_field(field) -> bool:
    """Unique slugs and URL paths get a free suffix instead of a copy."""
    return field.unique and isinstance(field, (models.SlugField, URLPathField))


def get_free_value(request, model, field, value: str) -> str:
    """
    The value with the first free number suffix: "hello" becomes
    "hello-2", or "hello-3" when that is taken. A value that already
    ends in a suffix of a taken base continues its count ("hello-2"
    becomes "hello-3"). Like the duplicate warnings, the lookup is
    scoped to the request's tenant and counts trashed objects: they
    still occupy their values. The result respects max_length.
    """
    queryset = get_tenant_scoped_queryset(request, model, model._base_manager.all())
    attname = field.attname
    base = value

    match = SUFFIXED.match(value)
    if match and queryset.filter(**{attname: match["base"]}).exists():
        base = match["base"]

    taken = set(
        queryset.filter(**{f"{attname}__startswith": base}).values_list(
            attname, flat=True
        )
    )
    max_length = field.max_length
    number = 2

    while True:
        suffix = f"-{number}"
        stem = base[: max_length - len(suffix)] if max_length else base
        candidate = f"{stem}{suffix}"

        # A shortened stem falls outside the prefetched values.
        if candidate not in taken and (
            stem == base or not queryset.filter(**{attname: candidate}).exists()
        ):
            return candidate

        number += 1


def copy_field_value(request, field, obj):
    """
    The value a duplicate of obj starts with for a model field, or SKIP
    for the fields a duplicate never copies: the primary key, automatic
    and non-editable fields, one-to-one fields, files, many-to-many
    fields with a through model (those are copied as inlines) and unique
    fields other than slugs and URL paths, which get a free suffix.
    """
    if (
        not (field.concrete or field.many_to_many)
        or field.auto_created
        or field.primary_key
        or not field.editable
        or field.one_to_one
        or isinstance(field, models.FileField)
    ):
        return SKIP

    if field.many_to_many:
        if not field.remote_field.through._meta.auto_created:
            return SKIP

        return list(getattr(obj, field.name).all())

    if field.many_to_one:
        return getattr(obj, field.name)

    value = field.value_from_object(obj)

    if field.unique:
        if not is_suffixed_field(field) or value in field.empty_values:
            return SKIP

        return get_free_value(request, type(obj), field, value)

    # Mutable values (JSON, blocks) must not be shared with obj.
    return copy.deepcopy(value)


def iter_copied_fields(studio, request, model):
    """
    The model fields of a studio's create form that a duplicate may
    copy: written by the create form, and not read-only, excluded or
    the tenant (which comes from the selected tenant).
    """
    from .admin import get_form_field_names, get_readonly_field_names

    names = get_form_field_names(studio, request) - get_readonly_field_names(
        studio, request
    )
    names -= set(studio.exclude or [])
    names.discard(get_tenant_field_name(model))

    for field in model._meta.get_fields():
        if field.name in names:
            yield field


def get_default_duplicate_initial(studio, request, obj) -> dict:
    """The default of ModelStudio.get_duplicate_initial."""
    initial = {}

    for field in iter_copied_fields(studio, request, studio.model):
        value = copy_field_value(request, field, obj)

        if value is not SKIP:
            initial[field.name] = value

    return initial


def represent_initial(serializer, initial: dict) -> dict:
    """
    The duplicate's initial values in the shape the create form reads,
    through the create serializer's fields. Values for fields the
    create form does not write are dropped.
    """
    data = {}

    for name, value in initial.items():
        field = serializer.fields.get(name)

        if field is None or field.read_only:
            continue

        data[name] = None if value is None else field.to_representation(value)

    return data


def get_duplicate_inlines(studio, request) -> list:
    """
    The inline studios (instances) whose rows a duplicate copies: the
    duplicate_inlines that are inlines of the studio and that the
    request may add rows to.
    """
    inlines = []

    for inline_class in studio.duplicate_inlines or []:
        if inline_class not in (studio.inlines or []):
            continue

        inline = inline_class(studio.model, studio.admin_site)

        if inline.has_add_permission(request):
            inlines.append(inline)

    return inlines


def copy_inline_rows(request, studio, source, target) -> list[models.Model]:
    """
    Copy the rows of the studio's duplicate_inlines from source to
    target, with the same rules as the duplicate itself (slugs and URL
    paths get a free suffix). Returns the saved copies; the caller
    records them.
    """
    copies = []

    for inline in get_duplicate_inlines(studio, request):
        model = inline.model
        fk_name = get_related_field_name(inline, studio.model)
        fields = [
            field
            for field in iter_copied_fields(inline, request, model)
            if field.name != fk_name
        ]
        tenant_field = get_tenant_field_name(model)

        for row in model._default_manager.filter(**{fk_name: source}).order_by("pk"):
            values, many = {}, {}

            for field in fields:
                value = copy_field_value(request, field, row)

                if value is SKIP:
                    continue

                if field.many_to_many:
                    many[field.name] = value
                else:
                    values[field.name] = value

            # Rows stay in their tenant, which is the duplicate's.
            if tenant_field:
                values[f"{tenant_field}_id"] = getattr(row, f"{tenant_field}_id")

            if hasattr(model, cs_settings.CREATED_BY_ATTR):
                values[cs_settings.CREATED_BY_ATTR] = request.user

            new = model(**values, **{fk_name: target})
            new.save()

            for name, value in many.items():
                getattr(new, name).set(value)

            copies.append(new)

    return copies
