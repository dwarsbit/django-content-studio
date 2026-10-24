from django.contrib.admin.models import LogEntry
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from content_studio.serializers import ContentSerializer
from content_studio.settings import cs_settings
from content_studio.utils import get_tenant_field_name, get_tenant_scoped_queryset
from ..dashboard import DashboardWidget

__all__ = [
    "ActivityLogWidget",
]


class LogEntrySerializer(ContentSerializer):
    object_model = serializers.SerializerMethodField()

    class Meta:
        model = LogEntry
        fields = [
            "id",
            "action_flag",
            "action_time",
            "user",
            "object_id",
            "object_repr",
            "object_model",
        ]

    def get_object_model(self, obj):
        return f"{obj.content_type.app_label}.{obj.content_type.model}"


class ActivityLogWidget(DashboardWidget):
    """
    Widget for showing activity logs.
    """

    widget_type = "ActivityLogWidget"
    name = "ActivityLogWidget"

    col_span = 2

    # The number of entries shown.
    limit = 5

    # Entries scanned at most to fill the widget when entries of other
    # tenants have to be skipped.
    max_scanned = 200

    def get_data(self, request):
        """
        The latest entries on the models the user may view: registered
        models through their studio's view permission hook, other models
        (like the media library's) through Django's view or change
        permission. On tenant-scoped models only the entries of objects
        in the request's tenant are shown (see visible_entries).
        """
        content_types = viewable_content_type_ids(request)
        entries = (
            LogEntry.objects.filter(content_type_id__in=content_types)
            .select_related("user", "content_type")
            .order_by("-action_time", "-pk")
        )
        scoped = tenant_scoped_models(content_types)

        if not scoped:
            return LogEntrySerializer(entries[: self.limit], many=True).data

        # Entries of other tenants are skipped, so read in batches until
        # the widget is full.
        visible = []
        batch_size = self.limit * 4

        for offset in range(0, self.max_scanned, batch_size):
            batch = list(entries[offset : offset + batch_size])
            visible += visible_entries(request, batch, scoped)

            if len(visible) >= self.limit or len(batch) < batch_size:
                break

        return LogEntrySerializer(visible[: self.limit], many=True).data


def viewable_content_type_ids(request) -> list[int]:
    site = cs_settings.ADMIN_SITE
    user = request.user
    ids = []

    for content_type in ContentType.objects.filter(
        pk__in=LogEntry.objects.values("content_type_id").distinct()
    ):
        model = content_type.model_class()

        if model is None:
            continue

        if site.is_registered(model):
            allowed = site._registry[model].has_view_permission(request)
        else:
            opts = model._meta
            allowed = user.has_perm(
                f"{opts.app_label}.view_{opts.model_name}"
            ) or user.has_perm(f"{opts.app_label}.change_{opts.model_name}")

        if allowed:
            ids.append(content_type.pk)

    return ids


def tenant_scoped_models(content_type_ids) -> dict:
    """The tenant-scoped models among the content types, by id."""
    if cs_settings.TENANT_MODEL is None:
        return {}

    scoped = {}

    for content_type in ContentType.objects.filter(pk__in=content_type_ids):
        model = content_type.model_class()

        if model is not None and get_tenant_field_name(model):
            scoped[content_type.pk] = model

    return scoped


def visible_entries(request, entries, scoped) -> list:
    """
    The entries the request's tenant may see. Log entries carry no
    tenant, so an entry of a tenant-scoped model is shown only when its
    object still exists in the tenant (trashed objects included). Entries
    whose object is gone, such as deletions, cannot be placed in a tenant
    and are hidden.
    """
    object_pks = {}

    for entry in entries:
        model = scoped.get(entry.content_type_id)

        if model is None:
            continue

        try:
            object_pks[entry.pk] = model._meta.pk.to_python(entry.object_id)
        except DjangoValidationError:
            continue

    in_tenant = {}

    for content_type_id, model in scoped.items():
        pks = {
            object_pks[entry.pk]
            for entry in entries
            if entry.content_type_id == content_type_id and entry.pk in object_pks
        }

        if not pks:
            continue

        # The base manager: managers that hide trashed objects would
        # hide their entries too.
        queryset = get_tenant_scoped_queryset(request, model, model._base_manager.all())
        in_tenant[content_type_id] = set(
            queryset.filter(pk__in=pks).values_list("pk", flat=True)
        )

    return [
        entry
        for entry in entries
        if entry.content_type_id not in scoped
        or (
            entry.pk in object_pks
            and object_pks[entry.pk] in in_tenant.get(entry.content_type_id, set())
        )
    ]
