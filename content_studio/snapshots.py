"""
Snapshots of an object's values as the edit page has them, taken around
a save in the admin. The activity log names the fields a change touched,
like the classic admin's history, and the optional history app
(content_studio.history) keeps the snapshots, so editors can see what
changed and restore an earlier version.
"""

import json
import logging
from typing import Optional

from django.core.exceptions import FieldDoesNotExist
from django.core.serializers.json import DjangoJSONEncoder
from django.utils.text import capfirst

from .settings import cs_settings
from .utils import get_tenant_field_name

logger = logging.getLogger("content_studio.snapshots")


def get_tracked_field_names(model, studio=None) -> set[str]:
    """
    The fields a snapshot holds: the model's editable fields and
    many-to-many fields. The primary key, fields the model sets itself
    (auto_now, editable=False), the editor and creator stamps, the
    tenant and the soft delete field are left out: they change on
    their own and are never restored.
    """
    opts = model._meta
    skipped = {
        cs_settings.EDITED_BY_ATTR,
        cs_settings.EDITED_AT_ATTR,
        cs_settings.CREATED_BY_ATTR,
        cs_settings.CREATED_AT_ATTR,
        get_tenant_field_name(model),
        getattr(studio, "soft_delete", None),
    }

    return {
        field.name
        for field in [*opts.concrete_fields, *opts.many_to_many]
        if field.editable and not field.primary_key and field.name not in skipped
    }


def take_snapshot(data, model, studio=None) -> Optional[dict]:
    """
    The tracked fields of a serializer's representation of an object,
    as plain JSON (the form the snapshot is stored and compared in).
    Fields the serializer does not send, such as the fields a studio
    excludes, are not in it.
    """
    try:
        names = get_tracked_field_names(model, studio)

        return json.loads(
            json.dumps(
                {name: value for name, value in data.items() if name in names},
                cls=DjangoJSONEncoder,
            )
        )
    except Exception:
        logger.exception("Could not take a snapshot of a %s.", model._meta.label)
        return None


def get_changed_fields(before: dict, after: dict) -> list[str]:
    """The names of the fields whose values differ, in field order."""
    return [name for name in after if name in before and before[name] != after[name]]


def get_change_message(model, names) -> str:
    """
    The activity log's message for a change of these fields, in the
    classic admin's format, so LogEntry.get_change_message() (and the
    classic admin's history page) render it as "Changed Title and Body."
    """
    labels = []

    for name in names:
        try:
            labels.append(str(capfirst(model._meta.get_field(name).verbose_name)))
        except FieldDoesNotExist:
            labels.append(name)

    return json.dumps([{"changed": {"fields": labels}}]) if labels else ""
