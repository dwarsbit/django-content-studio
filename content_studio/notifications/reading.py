"""
Which notifications a request may see. The list and the unread count
use the same queryset, so the badge never counts what the list cannot
show. Rows are hidden, never deleted: a revoked permission hides old
notifications at once, and a restored one shows them again.
"""

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied

from ..settings import cs_settings
from ..utils import validate_tenant_access
from .models import Notification
from .permissions import get_studio, has_model_permission, load_objects
from .permissions import overrides_view_permission


def request_tenant(request) -> str:
    """The request's tenant as text, when the user may access it; empty
    without one."""
    tenant = request.headers.get("x-dcs-tenant", "") or ""

    if not tenant or cs_settings.TENANT_MODEL is None:
        return ""

    try:
        return str(validate_tenant_access(request, tenant))
    except PermissionDenied:
        return ""


def visible_notifications(request):
    """
    The request user's notifications that the request may see: outside
    tenants or in the request's tenant (without a tenant header, only
    those outside tenants), and on models the user may view, asking the
    studio about each object when it checks objects.
    """
    user = request.user

    if not (user and user.is_authenticated and user.is_active and user.is_staff):
        return Notification.objects.none()

    queryset = Notification.objects.filter(recipient=user)
    tenant = request_tenant(request)
    queryset = queryset.filter(
        Q(tenant="") | Q(tenant=tenant) if tenant else Q(tenant="")
    )

    content_type_ids = set(
        queryset.exclude(content_type=None)
        .values_list("content_type_id", flat=True)
        .distinct()
    )
    allowed = []
    hidden = Q(pk__in=[])

    for content_type_id in content_type_ids:
        model = ContentType.objects.get_for_id(content_type_id).model_class()

        if model is None:
            continue

        studio = get_studio(model)

        if studio is None:
            if has_model_permission(user, model):
                allowed.append(content_type_id)
            continue

        if not studio.has_view_permission(request):
            continue

        allowed.append(content_type_id)

        if overrides_view_permission(studio):
            object_ids = set(
                queryset.filter(content_type_id=content_type_id)
                .exclude(object_id="")
                .values_list("object_id", flat=True)
            )
            refused = [
                object_id
                for object_id, obj in load_objects(model, object_ids).items()
                if not studio.has_view_permission(request, obj)
            ]

            if refused:
                hidden |= Q(content_type_id=content_type_id, object_id__in=refused)

    return queryset.filter(
        Q(content_type=None) | Q(content_type_id__in=allowed)
    ).exclude(hidden)


def unread_count(request) -> int:
    return visible_notifications(request).filter(read_at=None).count()
