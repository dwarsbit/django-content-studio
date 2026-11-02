"""
The content_changed receiver: who is notified about a batch of changes.

A user is notified about a change when they follow the object, when
they subscribed to the event on every object of the model, or when they
created the object and get that event for their own objects (without a
stored choice: updated, deleted and restored). Never about their own
changes, and only on models they may view.

A batch writes at most one notification per recipient, model, action
and tenant: a bulk action on fifty objects is one summary naming the
first few. A single object's notification that is still unread is
bumped (count, actor, time) when the object changes again.

The receiver runs in the editor's request after the commit, so it keeps
to a fixed number of queries per batch, whatever its size: the
subscriptions, the follows, the creators, the recipients, the unread
notifications to bump, and the writes. Objects are loaded only for
studios that check view permission per object, and each recipient's
model permissions are loaded once.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

from django.contrib.admin.models import ADDITION, LogEntry
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from .events import CONTENT_EVENTS, DEFAULT_CONTENT_ACTIONS, FOLLOW_ONLY_ACTIONS
from .models import Follow, Notification, NotificationSubscription
from .permissions import (
    get_studio,
    load_objects,
    may_receive,
    notifications_enabled,
    overrides_view_permission,
)

# How many objects a summary names, besides the followed ones.
NAMED_OBJECTS = 3

OWN_MODELS = (Notification, NotificationSubscription, Follow)


@dataclass(frozen=True)
class FlatChange:
    """A Change reduced to plain values, as a task would need them."""

    action: str
    content_type_id: int
    object_id: str
    object_repr: str
    tenant: str
    actor_id: Optional[Any]
    timestamp: datetime


def flatten(changes) -> list[FlatChange]:
    flat = []

    for change in changes:
        if change.model in OWN_MODELS or not notifications_enabled(change.model):
            continue

        flat.append(
            FlatChange(
                action=change.action,
                content_type_id=ContentType.objects.get_for_model(change.model).pk,
                object_id=change.object_id,
                object_repr=change.object_repr,
                tenant="" if change.tenant_id is None else str(change.tenant_id),
                actor_id=getattr(change.user, "pk", None),
                timestamp=change.timestamp,
            )
        )

    return flat


def notify_changes(sender, changes, **kwargs):
    """The content_changed receiver."""
    fan_out(flatten(changes))


def content_key(content_type_id, object_id) -> str:
    return f"{content_type_id}:{object_id}"


def fan_out(changes: list[FlatChange]) -> int:
    """Write the notifications for a batch of changes; returns how many
    were written or bumped."""
    if not changes:
        return 0

    # One group per model, action and tenant; an object changed twice
    # in the batch counts once, with its latest change.
    groups: dict[tuple, dict[str, FlatChange]] = defaultdict(dict)

    for change in changes:
        group = groups[(change.content_type_id, change.action, change.tenant)]
        group.pop(change.object_id, None)
        group[change.object_id] = change

    content_type_ids = {key[0] for key in groups}
    object_ids = {change.object_id for change in changes}
    events = {CONTENT_EVENTS[key[1]] for key in groups}

    subscriptions = {
        (row.user_id, row.content_type_id, row.event, row.tenant): row
        for row in NotificationSubscription.objects.filter(
            content_type_id__in=content_type_ids, event__in=events
        )
    }

    followers = defaultdict(set)

    for user_id, content_type_id, object_id in Follow.objects.filter(
        content_type_id__in=content_type_ids, object_id__in=object_ids
    ).values_list("user_id", "content_type_id", "object_id"):
        followers[(content_type_id, object_id)].add(user_id)

    # Creators come from the activity log, so "objects I created" works
    # for every model, with or without a creator field. Your own
    # creation never notifies you, and reorders only notify followers.
    creators = {}
    creator_actions = set(DEFAULT_CONTENT_ACTIONS) | {
        row.event.removeprefix("content.")
        for row in subscriptions.values()
        if row.enabled
    }
    creator_actions -= {"created", *FOLLOW_ONLY_ACTIONS}

    if any(key[1] in creator_actions for key in groups):
        for content_type_id, object_id, user_id in LogEntry.objects.filter(
            action_flag=ADDITION,
            content_type_id__in=content_type_ids,
            object_id__in=object_ids,
        ).values_list("content_type_id", "object_id", "user_id"):
            creators[(content_type_id, object_id)] = user_id

    # Recipient -> the changes of each group they are notified about.
    matches: dict[tuple, dict[Any, list[FlatChange]]] = {}

    for (content_type_id, action, tenant), group in groups.items():
        event = CONTENT_EVENTS[action]
        recipients: dict[Any, list[FlatChange]] = defaultdict(list)
        everything = set()

        if action not in FOLLOW_ONLY_ACTIONS:
            everything = {
                user_id
                for (user_id, ct_id, row_event, row_tenant), row in (
                    subscriptions.items()
                )
                if ct_id == content_type_id
                and row_event == event
                and row_tenant == tenant
                and row.enabled
                and row.scope == NotificationSubscription.Scope.ALL
            }

        for object_id, change in group.items():
            users = set(everything) | followers.get((content_type_id, object_id), set())
            creator = creators.get((content_type_id, object_id))

            if creator is not None and action not in FOLLOW_ONLY_ACTIONS:
                row = subscriptions.get((creator, content_type_id, event, tenant))
                enabled = row.enabled if row else action in DEFAULT_CONTENT_ACTIONS

                if enabled:
                    users.add(creator)

            users.discard(change.actor_id)

            for user_id in users:
                recipients[user_id].append(change)

        if recipients:
            matches[(content_type_id, action, tenant)] = recipients

    if not matches:
        return 0

    user_ids = {user_id for recipients in matches.values() for user_id in recipients}
    users = {
        user.pk: user
        for user in get_user_model()._default_manager.filter(
            pk__in=user_ids, is_active=True, is_staff=True
        )
    }

    notifications = []

    for (content_type_id, action, tenant), recipients in matches.items():
        model = ContentType.objects.get_for_id(content_type_id).model_class()

        if model is None:
            continue

        objects = None

        if overrides_view_permission(get_studio(model)):
            objects = load_objects(
                model,
                {
                    change.object_id
                    for changes in recipients.values()
                    for change in changes
                },
            )

        for user_id, user_changes in recipients.items():
            user = users.get(user_id)

            if user is None:
                continue

            if objects is None:
                allowed = user_changes if may_receive(user, model, tenant) else []
            else:
                allowed = [
                    change
                    for change in user_changes
                    if may_receive(user, model, tenant, objects.get(change.object_id))
                ]

            if allowed:
                notifications.append(
                    build(
                        user,
                        content_type_id,
                        action,
                        tenant,
                        allowed,
                        followers,
                    )
                )

    return write(notifications)


def build(user, content_type_id, action, tenant, changes, followers) -> Notification:
    latest = max(changes, key=lambda change: change.timestamp)
    followed = [
        change
        for change in changes
        if user.pk in followers.get((content_type_id, change.object_id), ())
    ]
    named = changes[:NAMED_OBJECTS] + [
        change for change in followed if change not in changes[:NAMED_OBJECTS]
    ]
    single = len(changes) == 1

    return Notification(
        recipient=user,
        event=CONTENT_EVENTS[action],
        actor_id=latest.actor_id,
        content_type_id=content_type_id,
        object_id=latest.object_id if single else "",
        object_repr=latest.object_repr if single else "",
        params={
            "objects": [
                {
                    "id": change.object_id,
                    "repr": change.object_repr,
                    "followed": change in followed,
                }
                for change in named
            ]
        },
        count=len(changes),
        # A single object's notification is bumped while unread; a
        # summary is not.
        key=content_key(content_type_id, latest.object_id) if single else "",
        tenant=tenant,
    )


def write(notifications: list[Notification]) -> int:
    """
    Store the notifications: one with a key bumps the recipient's
    unread notification with the same event and key, if there is one;
    the rest are created. Returns how many were written or bumped.
    """
    if not notifications:
        return 0

    now = timezone.now()
    keyed = [notification for notification in notifications if notification.key]
    unread = {}

    if keyed:
        for row in Notification.objects.filter(
            read_at__isnull=True,
            recipient_id__in={notification.recipient_id for notification in keyed},
            key__in={notification.key for notification in keyed},
            event__in={notification.event for notification in keyed},
        ).order_by("updated_at", "pk"):
            # The newest wins when a race left two.
            unread[(row.recipient_id, row.event, row.key)] = row

    bumped = []
    created = []

    for notification in notifications:
        row = unread.get(
            (notification.recipient_id, notification.event, notification.key)
        )

        if row is None or not notification.key:
            notification.created_at = notification.updated_at = now
            created.append(notification)
            continue

        row.count += notification.count
        row.actor_id = notification.actor_id
        row.level = notification.level
        row.content_type_id = notification.content_type_id
        row.object_id = notification.object_id
        row.object_repr = notification.object_repr
        row.url = notification.url
        row.title = notification.title
        row.body = notification.body
        row.params = notification.params
        row.updated_at = now
        bumped.append(row)

    if bumped:
        Notification.objects.bulk_update(
            bumped,
            [
                "count",
                "actor",
                "level",
                "content_type",
                "object_id",
                "object_repr",
                "url",
                "title",
                "body",
                "params",
                "updated_at",
            ],
        )

    if created:
        Notification.objects.bulk_create(created)

    return len(bumped) + len(created)
