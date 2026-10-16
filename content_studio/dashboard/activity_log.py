from django.contrib.admin.models import LogEntry
from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers

from content_studio.serializers import ContentSerializer
from content_studio.settings import cs_settings
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

    name = "ActivityLogWidget"

    col_span = 2

    # The number of entries shown.
    limit = 5

    def get_data(self, request):
        """
        The latest entries on the models the user may view: registered
        models through their studio's view permission hook, other models
        (like the media library's) through Django's view or change
        permission.
        """
        content_types = viewable_content_type_ids(request)
        entries = LogEntry.objects.filter(content_type_id__in=content_types)

        return LogEntrySerializer(
            entries.order_by("-action_time")[: self.limit], many=True
        ).data


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
