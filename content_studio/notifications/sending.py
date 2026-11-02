"""
notify(): send a registered event to its subscribers or to given users.

Imported with the package, before the app registry is ready: models are
imported where they are used.
"""

from django.contrib.auth import get_user_model
from django.db import router, transaction
from django.db.models import Model, QuerySet
from django.utils import translation
from django.utils.functional import Promise

from ..utils import get_tenant_field_name
from .events import LEVELS, get_event


def msgid(value) -> str:
    """The message id of a lazy translation, so the text is translated
    when it is read; other values as text."""
    if isinstance(value, Promise):
        with translation.override(None):
            return str(value)

    return "" if value is None else str(value)


def resolve_recipients(recipients) -> set:
    """The user ids of users, groups, querysets of either, or an
    iterable mixing them."""
    from django.contrib.auth.models import Group

    User = get_user_model()

    if isinstance(recipients, (Model, QuerySet)):
        recipients = [recipients]

    user_ids = set()
    group_ids = set()

    for item in recipients:
        if isinstance(item, QuerySet):
            if item.model is Group:
                group_ids.update(item.values_list("pk", flat=True))
            elif issubclass(item.model, User):
                user_ids.update(item.values_list("pk", flat=True))
            else:
                raise TypeError(
                    f"Recipients must be users or groups, not {item.model.__name__}."
                )
        elif isinstance(item, Group):
            group_ids.add(item.pk)
        elif isinstance(item, User):
            user_ids.add(item.pk)
        else:
            raise TypeError(
                f"Recipients must be users or groups, not {type(item).__name__}."
            )

    if group_ids:
        user_ids.update(
            User._default_manager.filter(groups__in=group_ids).values_list(
                "pk", flat=True
            )
        )

    return user_ids


def subscriber_ids(event, tenant: str) -> set:
    """The users who get an event sent to its subscribers: everyone for
    a required event, else the users who subscribed, plus everyone who
    did not opt out when the event is on by default."""
    from .models import NotificationSubscription

    User = get_user_model()
    staff = User._default_manager.filter(is_active=True, is_staff=True)

    if event.required:
        return set(staff.values_list("pk", flat=True))

    rows = NotificationSubscription.objects.filter(
        content_type=None, event=event.key, tenant=tenant
    )

    if event.default:
        return set(
            staff.exclude(
                pk__in=rows.filter(enabled=False).values("user_id")
            ).values_list("pk", flat=True)
        )

    return set(
        staff.filter(pk__in=rows.filter(enabled=True).values("user_id")).values_list(
            "pk", flat=True
        )
    )


def notify(
    event: str,
    *,
    title="",
    body="",
    params=None,
    target=None,
    url="",
    level=None,
    actor=None,
    recipients=None,
    key="",
) -> int:
    """
    Notify users of a registered event. Without recipients it goes to
    the event's subscribers; with users or groups (or querysets of
    either) it goes to them. Only active staff users are notified, never
    the actor, and with a target only users who may view its model.

    title and body are message ids, translated when the notification is
    read and filled in with params (title % params), like
    gettext_lazy("%(count)s comments await moderation"). A notification
    with a key bumps the recipient's unread notification of the same
    event and key instead of adding one.

    Inside a transaction the notifications are written once it commits,
    and not at all when it rolls back. Returns the number of recipients.
    """
    from django.contrib.contenttypes.models import ContentType

    from .fan_out import write
    from .models import Notification
    from .permissions import may_receive

    definition = get_event(event)
    level = definition.level if level is None else level

    if level not in LEVELS:
        raise ValueError(
            f"Unknown notification level {level!r}; expected one of "
            f"{', '.join(LEVELS)}."
        )

    tenant = ""
    target_fields = {}

    if target is not None:
        model = type(target)
        tenant_field_name = get_tenant_field_name(model)
        tenant_id = (
            getattr(target, f"{tenant_field_name}_id") if tenant_field_name else None
        )
        tenant = "" if tenant_id is None else str(tenant_id)
        target_fields = {
            "content_type": ContentType.objects.get_for_model(model),
            "object_id": str(target.pk),
            "object_repr": str(target)[:200],
        }

    if recipients is None:
        user_ids = subscriber_ids(definition, tenant)
    else:
        user_ids = resolve_recipients(recipients)

    if actor is not None:
        user_ids.discard(actor.pk)

    users = list(
        get_user_model()._default_manager.filter(
            pk__in=user_ids, is_active=True, is_staff=True
        )
    )

    if target is not None:
        users = [user for user in users if may_receive(user, model, tenant, target)]

    notifications = [
        Notification(
            recipient=user,
            event=definition.key,
            level=level,
            actor=actor,
            url=url,
            title=msgid(title),
            body=msgid(body),
            params=dict(params or {}),
            key=key,
            tenant=tenant,
            **target_fields,
        )
        for user in users
    ]

    if notifications:
        # Right away outside a transaction, else after it commits.
        transaction.on_commit(
            lambda: write(notifications), using=router.db_for_write(Notification)
        )

    return len(notifications)
