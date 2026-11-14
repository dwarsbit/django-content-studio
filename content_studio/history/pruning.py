from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db.models import Count

from ..settings import cs_settings
from .models import Version
from .recording import trim_versions


def prune_versions() -> int:
    """
    Remove the versions of objects that no longer exist, and the
    versions beyond HISTORY_MAX_VERSIONS of every object (useful after
    lowering it). Returns the number of versions removed.
    """
    deleted = 0

    for content_type_id in set(
        Version.objects.values_list("content_type_id", flat=True)
    ):
        content_type = ContentType.objects.get_for_id(content_type_id)
        versions = Version.objects.filter(content_type_id=content_type_id)
        model = content_type.model_class()

        if model is None:
            deleted += versions.delete()[0]
            continue

        object_ids = set(versions.values_list("object_id", flat=True))
        pks = {}

        for object_id in object_ids:
            try:
                pks[model._meta.pk.to_python(object_id)] = object_id
            except ValidationError:
                pass

        # The base manager: trashed objects still exist.
        existing = {
            str(pk)
            for pk in model._base_manager.filter(pk__in=list(pks)).values_list(
                "pk", flat=True
            )
        }
        gone = [object_id for object_id in object_ids if object_id not in existing]
        deleted += versions.filter(object_id__in=gone).delete()[0]

        limit = cs_settings.HISTORY_MAX_VERSIONS

        if limit is None:
            continue

        for row in (
            Version.objects.filter(content_type_id=content_type_id)
            .values("object_id")
            .annotate(count=Count("pk"))
            .filter(count__gt=limit)
        ):
            deleted += trim_versions(content_type, row["object_id"])

    return deleted
