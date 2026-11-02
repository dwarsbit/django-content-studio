"""
Who may receive a notification, checked when it is written, for a
user who is not the request's user.

Django's model permissions need no request. A studio that overrides
has_view_permission is asked too, with a minimal request that carries
the recipient as its user and the tenant in the x-dcs-tenant header:
overrides consulted for notifications may rely on those two only.
"""

import logging

from django.http import HttpRequest

from ..admin import BaseStudio
from ..settings import cs_settings

logger = logging.getLogger("content_studio.notifications")


def get_studio(model):
    return cs_settings.ADMIN_SITE._registry.get(model)


def overrides_view_permission(studio) -> bool:
    return (
        studio is not None
        and type(studio).has_view_permission is not BaseStudio.has_view_permission
    )


def notifications_enabled(model) -> bool:
    """Whether changes to the model notify anyone: a studio opts out
    with notifications = False."""
    studio = get_studio(model)
    return studio is None or bool(getattr(studio, "notifications", True))


def recipient_request(user, tenant: str = "") -> HttpRequest:
    request = HttpRequest()
    request.method = "GET"
    request.user = user

    if tenant:
        request.META["HTTP_X_DCS_TENANT"] = tenant

    return request


def has_model_permission(user, model) -> bool:
    opts = model._meta
    return user.has_perm(f"{opts.app_label}.view_{opts.model_name}") or user.has_perm(
        f"{opts.app_label}.change_{opts.model_name}"
    )


def may_receive(user, model, tenant: str = "", obj=None) -> bool:
    """
    Whether the user may view the model (and obj, when the studio
    checks objects): its studio's override of has_view_permission when
    there is one, else Django's view or change permission. An override
    that fails counts as a refusal.
    """
    studio = get_studio(model)

    if not overrides_view_permission(studio):
        return has_model_permission(user, model)

    try:
        return bool(studio.has_view_permission(recipient_request(user, tenant), obj))
    except Exception:
        logger.exception(
            "%s.has_view_permission failed while checking a notification recipient",
            type(studio).__name__,
        )
        return False


def load_objects(model, object_ids) -> dict[str, object]:
    """The objects that still exist, by object id as text; trashed
    objects count as existing."""
    pks = []

    for object_id in object_ids:
        try:
            pks.append(model._meta.pk.to_python(object_id))
        except Exception:
            continue

    if not pks:
        return {}

    return {str(obj.pk): obj for obj in model._base_manager.filter(pk__in=pks)}
