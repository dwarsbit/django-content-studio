"""
Bulk actions: batch operations the table view offers on selected rows.

A model studio declares custom actions with the @bulk_action decorator;
the built-in delete action is offered by default. The actions available
to a request (permissions included) serialize into the admin payload,
and the bulk endpoint dispatches to the decorated method with a
tenant-scoped queryset of the selected rows.
"""

from dataclasses import dataclass
from typing import Callable, Optional

from django.contrib.admin.models import DELETION, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.db import router
from django.db.models.deletion import Collector
from django.utils import timezone
from django.utils.text import capfirst
from django.utils.translation import gettext_lazy as _

# The id of the built-in delete action.
DELETE_ACTION_ID = "delete"

# The permission names an action may list in allowed_permissions,
# mirroring the classic admin.
BULK_ACTION_PERMISSIONS = ("add", "change", "delete", "view")


@dataclass(frozen=True)
class BulkActionMeta:
    """The metadata the @bulk_action decorator puts on a method."""

    label: Optional[str]
    icon: Optional[str]
    confirm: Optional[str]
    allowed_permissions: tuple[str, ...]
    destructive: bool


def bulk_action(
    label=None,
    icon=None,
    confirm=None,
    allowed_permissions=None,
    destructive=False,
):
    """
    Declare a bulk action on a ModelStudio method. The method receives
    the request and a queryset of the selected rows:

        @bulk_action(label="Publish", allowed_permissions=["change"])
        def publish(self, request, queryset):
            queryset.update(status=Article.Status.PUBLISHED)

    label defaults to the method name; icon is a Phosphor class (like
    the model icon); confirm, when set, is shown before the action runs;
    allowed_permissions gates the action on the model-level permissions
    it lists (available to anyone who can see the list when empty);
    destructive marks actions that cannot be undone.
    """

    def decorator(func):
        func.bulk_action = BulkActionMeta(
            label=label,
            icon=icon,
            confirm=confirm,
            allowed_permissions=tuple(allowed_permissions or ()),
            destructive=destructive,
        )
        return func

    # @bulk_action, without arguments: label carries the function.
    if callable(label):
        func, label = label, None
        return decorator(func)

    return decorator


@dataclass(frozen=True)
class BulkAction:
    """A resolved action: its id, handler and metadata. The handler
    receives the request and the selected queryset, and may return an
    int (a count) or a str (a message) for the response."""

    id: str
    handler: Callable
    meta: BulkActionMeta

    @property
    def label(self):
        if self.meta.label:
            return self.meta.label

        return capfirst(self.handler.__name__.replace("_", " "))

    def serialize(self):
        return {
            "id": self.id,
            "label": str(self.label),
            "icon": self.meta.icon,
            "confirm": str(self.meta.confirm) if self.meta.confirm else None,
            "destructive": self.meta.destructive,
        }


def delete_action(request, queryset):
    """
    The built-in delete: it collects related rows and fires deletion
    signals like the classic admin, and logs one LogEntry per object.
    Returns the number of deleted objects.
    """
    objects = list(queryset)

    collector = Collector(using=router.db_for_write(queryset.model))
    collector.collect(objects)
    collector.delete()

    content_type = ContentType.objects.get_for_model(queryset.model)

    for obj in objects:
        LogEntry.objects.create(
            user=request.user,
            action_flag=DELETION,
            content_type=content_type,
            object_id=obj.pk,
            object_repr=str(obj)[:200],
            change_message="",
        )

    return len(objects)


_DELETE_META = BulkActionMeta(
    label=_("Delete"),
    icon="ph-bold ph-trash",
    confirm=_("Are you sure you want to delete the selected items?"),
    allowed_permissions=("delete",),
    destructive=True,
)

_SOFT_DELETE_META = BulkActionMeta(
    label=_DELETE_META.label,
    icon=_DELETE_META.icon,
    confirm=_(
        "The selected items will be moved to the trash, where they can be "
        "restored. Are you sure you want to delete?"
    ),
    allowed_permissions=("delete",),
    destructive=False,
)


def _soft_delete_action(field):
    """
    The built-in delete for studios that configure soft_delete: it
    stamps the soft delete field instead of removing the rows, moving
    the selected objects to the trash, and logs one LogEntry per
    object. Returns the number of trashed objects.
    """

    def handler(request, queryset):
        objects = list(queryset)
        queryset.update(**{field: timezone.now()})

        content_type = ContentType.objects.get_for_model(queryset.model)

        for obj in objects:
            LogEntry.objects.create(
                user=request.user,
                action_flag=DELETION,
                content_type=content_type,
                object_id=obj.pk,
                object_repr=str(obj)[:200],
                change_message="",
            )

        return len(objects)

    return handler


def declared_bulk_actions(studio) -> dict[str, Callable]:
    """
    The @bulk_action methods of a studio, in definition order. Base
    classes come first; an override without the decorator replaces the
    inherited action.
    """
    actions = {}

    for klass in reversed(type(studio).__mro__):
        for name, attr in vars(klass).items():
            if callable(attr) and hasattr(attr, "bulk_action"):
                if name in actions:
                    del actions[name]
                actions[name] = getattr(studio, name)

    return actions


def get_bulk_actions(studio, request=None) -> list[BulkAction]:
    """
    The bulk actions offered to the request, in the configured order.

    The studio's actions attribute selects them: None (the default)
    offers the built-in delete plus every declared action, an empty list
    disables bulk actions entirely, and an explicit list offers exactly
    those names (with "delete" naming the built-in). Actions the user
    lacks permission for are left out.
    """
    declared = declared_bulk_actions(studio)

    names = getattr(studio, "actions", None)
    if names is None:
        names = [DELETE_ACTION_ID, *declared.keys()]

    actions = []

    for name in names:
        if name == DELETE_ACTION_ID:
            # The built-in delete honors a configured soft_delete: it
            # moves the selection to the trash instead of removing it.
            if getattr(studio, "soft_delete", ""):
                action = BulkAction(
                    id=name,
                    handler=_soft_delete_action(studio.soft_delete),
                    meta=_SOFT_DELETE_META,
                )
            else:
                action = BulkAction(id=name, handler=delete_action, meta=_DELETE_META)
        else:
            handler = declared.get(name)

            # Unresolvable names are reported by the system checks.
            if handler is None:
                continue

            action = BulkAction(id=name, handler=handler, meta=handler.bulk_action)

        if request is None or _allowed(studio, request, action.meta):
            actions.append(action)

    return actions


def _allowed(studio, request, meta: BulkActionMeta) -> bool:
    """Whether the request may run an action: a gate on each of the
    permissions it lists, or none when it lists none."""
    return not meta.allowed_permissions or any(
        getattr(studio, f"has_{permission}_permission")(request)
        for permission in meta.allowed_permissions
    )
