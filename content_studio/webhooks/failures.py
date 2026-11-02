"""
The webhooks.delivery_failed notification: with the notifications app
installed, a delivery that fails after its last attempt notifies the
editors who may change the webhook. Neither app assumes the other, so
everything here checks that the notifications app is installed first.
"""

import logging

from django.apps import apps
from django.utils.translation import gettext_lazy as _

logger = logging.getLogger("content_studio.webhooks")

EVENT_KEY = "webhooks.delivery_failed"


def notifications_installed() -> bool:
    return apps.is_installed("content_studio.notifications")


def register_failure_event():
    """Make the event subscribable; called from the app's ready()."""
    if not notifications_installed():
        return

    from ..notifications import register_event

    register_event(
        EVENT_KEY,
        label=_("Webhook delivery failed"),
        description=_(
            "A webhook delivery failed after its last attempt. Only editors "
            "who may change webhooks are notified."
        ),
        level="error",
    )


def may_change(user, webhook) -> bool:
    """Whether the user may change the webhook: its studio's answer, or
    Django's change permission without a studio."""
    from ..notifications.permissions import get_studio, recipient_request
    from .models import Webhook

    studio = get_studio(Webhook)

    if studio is None:
        return user.has_perm("content_studio_webhooks.change_webhook")

    try:
        return bool(studio.has_change_permission(recipient_request(user), webhook))
    except Exception:
        logger.exception(
            "%s.has_change_permission failed while checking a notification "
            "recipient",
            type(studio).__name__,
        )
        return False


def notify_failure(delivery) -> int:
    """
    Notify the subscribers of webhooks.delivery_failed who may change the
    delivery's webhook. An unread notification about the same webhook is
    bumped rather than repeated. Returns the number of recipients.
    """
    if not notifications_installed():
        return 0

    from django.contrib.auth import get_user_model

    from ..notifications import notify
    from ..notifications.events import get_event
    from ..notifications.sending import subscriber_ids

    webhook = delivery.webhook
    event = get_event(EVENT_KEY)
    candidates = get_user_model()._default_manager.filter(
        pk__in=subscriber_ids(event, ""), is_active=True, is_staff=True
    )
    recipients = [user for user in candidates if may_change(user, webhook)]

    if not recipients:
        return 0

    return notify(
        EVENT_KEY,
        title=_("Webhook %(name)s failed"),
        body=_("The last attempt failed: %(error)s"),
        params={"name": webhook.name, "error": (delivery.error or "")[:200]},
        target=webhook,
        recipients=recipients,
        key=f"webhook:{webhook.pk}",
    )
