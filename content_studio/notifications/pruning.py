from datetime import timedelta

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from ..settings import cs_settings
from .models import Follow, Notification, NotificationSubscription
from .permissions import load_objects


def prune_notifications() -> int:
    """Remove read notifications older than NOTIFICATION_RETENTION days
    and unread ones older than NOTIFICATION_UNREAD_RETENTION days; None
    keeps them."""
    deleted = 0

    for retention, unread in (
        (cs_settings.NOTIFICATION_RETENTION, False),
        (cs_settings.NOTIFICATION_UNREAD_RETENTION, True),
    ):
        if retention is None:
            continue

        cutoff = timezone.now() - timedelta(days=retention)
        deleted += Notification.objects.filter(
            read_at__isnull=unread, updated_at__lt=cutoff
        ).delete()[0]

    return deleted


def prune_follows() -> int:
    """Remove follows of objects that no longer exist (trashed objects
    still exist)."""
    deleted = 0
    content_type_ids = Follow.objects.values_list("content_type_id", flat=True)

    for content_type_id in set(content_type_ids):
        follows = Follow.objects.filter(content_type_id=content_type_id)
        model = ContentType.objects.get_for_id(content_type_id).model_class()

        if model is not None:
            existing = load_objects(
                model, set(follows.values_list("object_id", flat=True))
            )
            follows = follows.exclude(object_id__in=list(existing))

        deleted += follows.delete()[0]

    return deleted


def prune_subscriptions() -> int:
    """Remove subscriptions to models that no longer exist."""
    stale = [
        content_type.pk
        for content_type in ContentType.objects.filter(
            pk__in=NotificationSubscription.objects.exclude(content_type=None).values(
                "content_type_id"
            )
        )
        if content_type.model_class() is None
    ]

    if not stale:
        return 0

    return NotificationSubscription.objects.filter(content_type_id__in=stale).delete()[
        0
    ]


def prune() -> tuple[int, int, int]:
    return prune_notifications(), prune_follows(), prune_subscriptions()
