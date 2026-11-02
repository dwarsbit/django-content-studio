"""
The email digest: the unread notifications an editor left alone for a
while, mailed once. content_studio_send_notification_digest runs it,
with NOTIFICATION_EMAIL_DIGEST on and ADMIN_URL set for the links.

A notification is mailed when it is unread, was not mailed before and
did not change for the delay (an hour by default): an editor working in
the admin reads it there first. Each editor gets one email per run, with
what they may see by the same filter as the list, per tenant. An editor
turns the emails off on their settings page; that choice is stored as a
subscription to the event "digest", which no registered key can be.
"""

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone, translation
from django.utils.translation import gettext as _, ngettext

from ..settings import cs_settings
from .models import Notification, NotificationSubscription
from .permissions import get_studio, load_objects, recipient_request
from .reading import visible_notifications

logger = logging.getLogger("content_studio.notifications")

# The subscription row of an editor's choice; not dotted, so no
# registered event can take it.
DIGEST_EVENT = "digest"

# Minutes a notification stays unchanged and unread before it is mailed.
DEFAULT_DELAY = 60

# Notifications named in one email; the rest are counted.
MAX_ITEMS = 20


def digest_available() -> bool:
    """Whether the site sends the digest."""
    return bool(cs_settings.NOTIFICATION_EMAIL_DIGEST and cs_settings.ADMIN_URL)


def get_email(user) -> str:
    return getattr(user, get_user_model().get_email_field_name(), "") or ""


def digest_enabled(user) -> bool:
    """The editor's choice: on until they turn it off."""
    row = NotificationSubscription.objects.filter(
        user=user, content_type=None, event=DIGEST_EVENT, tenant=""
    ).first()
    return True if row is None else row.enabled


def set_digest_enabled(user, enabled: bool):
    NotificationSubscription.objects.update_or_create(
        user=user,
        content_type=None,
        event=DIGEST_EVENT,
        tenant="",
        defaults={"enabled": enabled},
    )


def admin_link(path: str) -> str:
    """An absolute URL for a path in the admin; absolute URLs as given."""
    if path.startswith(("http://", "https://")):
        return path

    return f"{cs_settings.ADMIN_URL.rstrip('/')}/{path.lstrip('/')}"


def pending(user, cutoff):
    """
    The user's notifications to mail: unread, not mailed, unchanged since
    cutoff, and visible by the list's filter in their own tenant.
    """
    candidates = Notification.objects.filter(
        recipient=user, read_at=None, emailed_at=None, updated_at__lte=cutoff
    )
    ids = []

    for tenant in set(candidates.values_list("tenant", flat=True)):
        visible = visible_notifications(recipient_request(user, tenant))
        ids += visible.filter(
            pk__in=candidates.filter(tenant=tenant).values("pk"), tenant=tenant
        ).values_list("pk", flat=True)

    return (
        Notification.objects.filter(pk__in=ids)
        .select_related("actor")
        .order_by("-updated_at", "-pk")
    )


@dataclass
class Item:
    text: str
    detail: str
    url: Optional[str]


def content_path(model, object_id: str = "") -> str:
    from ..admin import get_is_singleton

    studio = get_studio(model)

    if object_id and not (studio is not None and get_is_singleton(studio)):
        return f"content/{model._meta.label_lower}/{object_id}"

    return f"content/{model._meta.label_lower}"


def actor_name(user) -> str:
    if user is None:
        return _("Someone")

    full_name = ""

    if callable(getattr(user, "get_full_name", None)):
        full_name = (user.get_full_name() or "").strip()

    return full_name or user.get_username()


def content_sentence(action: str, single: bool, count: int, values: dict) -> str:
    """The sentence of a content change, as the admin's list says it."""
    if single:
        templates = {
            "created": _("%(actor)s created the %(model)s %(object)s"),
            "updated": _("%(actor)s updated the %(model)s %(object)s"),
            "deleted": _("%(actor)s deleted the %(model)s %(object)s"),
            "restored": _("%(actor)s restored the %(model)s %(object)s"),
            "reordered": _("%(actor)s moved the %(model)s %(object)s"),
        }
    else:
        templates = {
            "created": ngettext(
                "%(actor)s created %(count)s %(models)s",
                "%(actor)s created %(count)s %(models)s",
                count,
            ),
            "updated": ngettext(
                "%(actor)s updated %(count)s %(models)s",
                "%(actor)s updated %(count)s %(models)s",
                count,
            ),
            "deleted": ngettext(
                "%(actor)s deleted %(count)s %(models)s",
                "%(actor)s deleted %(count)s %(models)s",
                count,
            ),
            "restored": ngettext(
                "%(actor)s restored %(count)s %(models)s",
                "%(actor)s restored %(count)s %(models)s",
                count,
            ),
            "reordered": ngettext(
                "%(actor)s reordered %(count)s %(models)s",
                "%(actor)s reordered %(count)s %(models)s",
                count,
            ),
        }

    template = templates.get(action, templates["updated"])
    return template % {**values, "count": count}


def describe(notifications) -> list[Item]:
    """The digest's lines, with links to what still exists."""
    existing = {}

    for notification in notifications:
        if notification.content_type_id and notification.object_id:
            existing.setdefault(notification.content_type_id, set()).add(
                notification.object_id
            )

    models = {}

    for content_type_id in {n.content_type_id for n in notifications} - {None}:
        models[content_type_id] = ContentType.objects.get_for_id(
            content_type_id
        ).model_class()

    for content_type_id, object_ids in existing.items():
        model = models.get(content_type_id)
        existing[content_type_id] = (
            set(load_objects(model, object_ids)) if model else set()
        )

    items = []

    for notification in notifications:
        model = models.get(notification.content_type_id)
        exists = notification.object_id in existing.get(
            notification.content_type_id, ()
        )

        if not notification.event.startswith("content."):
            if model is not None and notification.object_id and exists:
                url = admin_link(content_path(model, notification.object_id))
            else:
                url = admin_link(notification.url) if notification.url else None

            items.append(
                Item(
                    text=notification.get_title() or notification.event,
                    detail=notification.get_body(),
                    url=url,
                )
            )
            continue

        action = notification.event[len("content.") :]
        single = bool(notification.object_id)
        opts = model._meta if model is not None else None
        values = {
            "actor": actor_name(notification.actor),
            "model": str(opts.verbose_name) if opts else "",
            "models": str(opts.verbose_name_plural) if opts else "",
            "object": notification.object_repr,
        }
        text = content_sentence(action, single, notification.count, values)

        if single:
            detail = (
                ngettext("%(count)s change", "%(count)s changes", notification.count)
                % {"count": notification.count}
                if notification.count > 1
                else ""
            )
            url = (
                admin_link(content_path(model, notification.object_id))
                if model is not None and exists
                else None
            )
        else:
            objects = (
                notification.params.get("objects", [])
                if isinstance(notification.params, dict)
                else []
            )
            names = ", ".join(str(o.get("repr", "")) for o in objects)
            rest = notification.count - len(objects)
            detail = (
                f"{names} "
                + ngettext("and %(count)s more", "and %(count)s more", rest)
                % {"count": rest}
                if rest > 0
                else names
            )
            url = admin_link(content_path(model)) if model is not None else None

        items.append(Item(text=text, detail=detail, url=url))

    return items


def build_message(user, notifications) -> EmailMultiAlternatives:
    count = len(notifications)
    items = describe(notifications[:MAX_ITEMS])
    site = cs_settings.ADMIN_SITE
    context = {
        "user": user,
        "name": actor_name(user),
        "site_name": str(site.site_header or ""),
        "count": count,
        "items": items,
        "rest": max(count - len(items), 0),
        "admin_url": admin_link(""),
        "notifications_url": admin_link("notifications"),
        "settings_url": admin_link("notifications/settings"),
    }
    subject = ngettext(
        "You have %(count)s unread notification",
        "You have %(count)s unread notifications",
        count,
    ) % {"count": count}
    message = EmailMultiAlternatives(
        subject=subject,
        body=render_to_string("content_studio/notifications/digest.txt", context),
        to=[get_email(user)],
    )
    message.attach_alternative(
        render_to_string("content_studio/notifications/digest.html", context),
        "text/html",
    )
    return message


def recipients(cutoff):
    """Active staff users with an email address, the digest on and
    something to mail."""
    User = get_user_model()
    opted_out = NotificationSubscription.objects.filter(
        content_type=None, event=DIGEST_EVENT, tenant="", enabled=False
    ).values("user_id")
    user_ids = (
        Notification.objects.filter(
            read_at=None, emailed_at=None, updated_at__lte=cutoff
        )
        .exclude(recipient_id__in=opted_out)
        .values("recipient_id")
    )

    for user in User._default_manager.filter(
        pk__in=user_ids, is_active=True, is_staff=True
    ).order_by("pk"):
        if get_email(user):
            yield user


def send_digests(delay: int = DEFAULT_DELAY, now=None) -> tuple[int, int]:
    """
    Mail every editor their pending notifications, once. Returns how many
    emails were sent and how many notifications they held. A user whose
    email fails is logged and tried again on the next run.
    """
    now = now or timezone.now()
    cutoff = now - timedelta(minutes=delay)
    emails = 0
    mailed = 0

    with translation.override(settings.LANGUAGE_CODE):
        for user in recipients(cutoff):
            try:
                notifications = list(pending(user, cutoff))

                if not notifications:
                    continue

                build_message(user, notifications).send()
            except Exception:
                logger.exception("Could not send the notification digest to %s", user)
                continue

            Notification.objects.filter(pk__in=[n.pk for n in notifications]).update(
                emailed_at=now
            )
            emails += 1
            mailed += len(notifications)

    return emails, mailed
