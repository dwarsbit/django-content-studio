"""Keeping versions: called by record_change for every create and update."""

from django.contrib.contenttypes.models import ContentType

from ..settings import cs_settings
from .models import Version


def save_version(entry, instance, changed_fields, before, after):
    """
    Keep the object's values after a change as a version of the log
    entry, then drop the object's oldest versions beyond
    HISTORY_MAX_VERSIONS.
    """
    before = before or {}
    content_type = ContentType.objects.get_for_model(instance)
    object_id = str(instance.pk)

    Version.objects.create(
        log_entry=entry,
        content_type=content_type,
        object_id=object_id,
        fields=list(changed_fields),
        previous={name: before.get(name) for name in changed_fields},
        data=after,
        created_at=entry.action_time,
    )

    trim_versions(content_type, object_id)


def trim_versions(content_type, object_id) -> int:
    """Remove an object's versions beyond the newest HISTORY_MAX_VERSIONS."""
    limit = cs_settings.HISTORY_MAX_VERSIONS

    if limit is None:
        return 0

    stale = list(
        Version.objects.filter(content_type=content_type, object_id=object_id)
        .order_by("-created_at", "-pk")
        .values_list("pk", flat=True)[limit:]
    )

    if not stale:
        return 0

    return Version.objects.filter(pk__in=stale).delete()[0]
