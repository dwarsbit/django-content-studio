"""
The content_changed signal: sent after the admin changed content.

Every change an editor makes in the admin is recorded once: as a
LogEntry (the activity log) and as a Change in the request's batch. The
batch is sent as one content_changed signal after the request's
transaction commits, so a bulk action on fifty objects sends one signal
with fifty changes, and a rolled back change is never sent.
"""

import contextvars
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.db import models, router, transaction
from django.dispatch import Signal

from .utils import get_tenant_field_name

__all__ = [
    "Change",
    "content_changed",
    "record_change",
]

# Sent with changes=[Change, ...] and user. The sender is None.
content_changed = Signal()

CREATED = "created"
UPDATED = "updated"
DELETED = "deleted"
RESTORED = "restored"
REORDERED = "reordered"

# The LogEntry action flag each change is recorded with.
ACTION_FLAGS = {
    CREATED: ADDITION,
    UPDATED: CHANGE,
    DELETED: DELETION,
    RESTORED: CHANGE,
    REORDERED: CHANGE,
}


@dataclass(frozen=True)
class Change:
    """
    One change made in the admin. action is one of "created",
    "updated", "deleted", "restored" or "reordered"; object_id is the
    primary key as a string, like LogEntry's. tenant_id is the pk of
    the object's tenant, or None when the model is not tenant-scoped.
    """

    action: str
    model: type[models.Model]
    object_id: str
    object_repr: str
    tenant_id: Optional[Any]
    user: Any
    timestamp: datetime


# The changes of the request being handled; None outside a batch.
_batch: contextvars.ContextVar[Optional[list[Change]]] = contextvars.ContextVar(
    "content_studio_changes", default=None
)


def _send(changes: list[Change], user):
    if changes:
        content_changed.send(sender=None, changes=list(changes), user=user)


def record_change(request, instance, action: str, message: str = "") -> LogEntry:
    """
    Record a change made in the admin: log it in the activity log and
    add it to the request's batch once its transaction commits. Outside
    a batch, the change is sent on its own. Custom bulk actions call it
    for each object they change; action is one of "created",
    "updated", "deleted", "restored" or "reordered", and a deleted
    object is recorded before it is deleted (deleting clears its pk).
    """
    if action not in ACTION_FLAGS:
        raise ValueError(
            f"Unknown action {action!r}; expected one of {', '.join(ACTION_FLAGS)}."
        )

    model = type(instance)
    entry = LogEntry.objects.create(
        user=request.user,
        action_flag=ACTION_FLAGS[action],
        content_type=ContentType.objects.get_for_model(instance),
        object_id=instance.pk,
        object_repr=str(instance)[:200],
        change_message=message,
    )

    tenant_field_name = get_tenant_field_name(model)
    change = Change(
        action=action,
        model=model._meta.concrete_model,
        object_id=str(instance.pk),
        object_repr=entry.object_repr,
        tenant_id=(
            getattr(instance, f"{tenant_field_name}_id") if tenant_field_name else None
        ),
        user=request.user,
        timestamp=entry.action_time,
    )

    # Joining the batch on commit ties the change to the fate of its
    # LogEntry: a rolled back savepoint drops both.
    using = router.db_for_write(LogEntry)
    batch = _batch.get()

    if batch is None:
        transaction.on_commit(lambda: _send([change], request.user), using=using)
    else:
        transaction.on_commit(lambda: batch.append(change), using=using)

    return entry


@contextmanager
def collect_changes(request):
    """
    Collect the changes recorded while handling a request, and send
    them as one signal once they are committed.
    """
    batch: list[Change] = []
    token = _batch.set(batch)

    try:
        yield batch
    finally:
        _batch.reset(token)
        # Registered after every change, so it runs after them: right
        # away outside a transaction, else on commit (and never on a
        # rollback, like the changes).
        transaction.on_commit(
            lambda: _send(batch, getattr(request, "user", None)),
            using=router.db_for_write(LogEntry),
        )
