"""
The webhooks dashboard widget: every webhook with its latest delivery,
shown like the scheduled tasks. Add it to the site's dashboard yourself.
"""

from django.utils.translation import gettext_lazy as _

from ..dashboard.scheduled_tasks import (
    ScheduledTasksWidget,
    ScheduledTasksWidgetSerializer,
)
from ..settings import cs_settings

__all__ = [
    "WebhookDeliveriesWidget",
]


class WebhookDeliveriesWidget(ScheduledTasksWidget):
    """
    The latest delivery of each webhook the editor may view: when it was
    made, whether it was delivered, and when a failed one is retried.
    """

    name = "WebhookDeliveriesWidget"

    def __init__(self, title=None, description=None, widget_id=None):
        self.title = title or _("Webhooks")
        self.description = description or _("The latest delivery of each webhook")
        super().__init__(widget_id)

    def get_data(self, request):
        from .models import Webhook, WebhookDelivery

        studio = cs_settings.ADMIN_SITE._registry.get(Webhook)
        tasks = []

        if studio is not None and studio.has_view_permission(request):
            for webhook in Webhook.objects.order_by("name"):
                delivery = webhook.deliveries.order_by("-created_at").first()
                tasks.append(self.get_task(webhook, delivery, WebhookDelivery))

        return ScheduledTasksWidgetSerializer(
            data={
                "title": str(self.title),
                "description": str(self.description),
                "tasks": tasks,
            }
        )

    def get_task(self, webhook, delivery, WebhookDelivery) -> dict:
        status = "SCHEDULED"
        next_run_at = None

        if delivery is not None:
            if delivery.status == WebhookDelivery.Status.SUCCESS:
                status = "SUCCESS"
            elif delivery.status == WebhookDelivery.Status.FAILED:
                status = "FAILURE"
            else:
                # Pending: waiting for its first attempt, or for a retry.
                status = "RUNNING" if delivery.attempts == 0 else "SCHEDULED"
                next_run_at = delivery.next_attempt_at

        return {
            "title": webhook.name,
            "description": (webhook.url if webhook.is_active else str(_("Paused"))),
            "last_run_at": delivery.created_at if delivery else None,
            "next_run_at": next_run_at,
            "duration": None,
            "status": status,
            "error_message": delivery.error if delivery else None,
        }
