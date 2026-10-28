"""
The webhooks app's studios, registered like any project's: the
webhooks with their delivery log, and the buttons that trigger a
webhook, regenerate its secret and retry a failed delivery.
"""

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from django.utils.translation import gettext_lazy as _

from .. import register
from ..admin import InlineModelStudio, ModelStudio
from ..form import Button, ButtonResult
from ..settings import cs_settings
from ..signals import record_change
from .delivery import deliver, retry, trigger
from .models import Webhook, WebhookDelivery, generate_secret


def webhook_studio():
    return cs_settings.ADMIN_SITE._registry[Webhook]


def outcome(delivery) -> str:
    """What became of a delivery's latest attempt, for the editor."""
    delivery.refresh_from_db()

    if delivery.status == WebhookDelivery.Status.SUCCESS:
        return _("Delivered: the webhook responded with %(status)s.") % {
            "status": delivery.response_status
        }

    if delivery.status == WebhookDelivery.Status.PENDING:
        return _("The delivery failed and is retried later: %(error)s") % {
            "error": delivery.error
        }

    return _("The delivery failed: %(error)s") % {"error": delivery.error}


class TriggerButton(Button):
    label = _("Trigger now")
    icon = "ph-bold ph-paper-plane-tilt"
    allowed_permissions = ["change"]

    def is_visible(self, obj, request):
        return obj.is_active

    def handle(self, obj, request):
        delivery = trigger(obj)
        deliver(delivery.pk)

        return outcome(delivery)


class RegenerateSecretButton(Button):
    label = _("Regenerate secret")
    icon = "ph-bold ph-key"
    confirm = _(
        "Requests are signed with the new secret from now on: receivers that "
        "check the signature need the new secret. Regenerate it?"
    )
    allowed_permissions = ["change"]

    def handle(self, obj, request):
        obj.secret = generate_secret()
        obj.save(update_fields=["secret"])
        record_change(request, obj, "updated", "Regenerated the secret.")

        return ButtonResult(message=_("The secret was regenerated."), value=obj.secret)


class RetryButton(Button):
    label = _("Retry")
    icon = "ph-bold ph-arrow-clockwise"

    def is_visible(self, obj, request):
        return obj.status == WebhookDelivery.Status.FAILED and (
            webhook_studio().has_change_permission(request, obj.webhook)
        )

    def handle(self, obj, request):
        if not retry(obj):
            return _("The delivery is already being retried.")

        return outcome(obj)


class WebhookDeliveryInline(InlineModelStudio):
    """The delivery log: read-only, for whoever may view the webhook."""

    model = WebhookDelivery
    table_display = ["created_at", "status", "attempts", "response_status", "error"]
    ordering = ["-created_at"]
    edit_header = [RetryButton()]

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return webhook_studio().has_view_permission(
            request, obj.webhook if obj is not None else None
        )


@register(Webhook)
class WebhookStudio(ModelStudio):
    icon = "ph-bold ph-webhooks-logo"
    table_display = ["name", "url", "is_active"]
    search_fields = ["name", "url"]
    list_filter = ["is_active"]
    # The secret is only shown once: after creating the webhook and
    # after regenerating it.
    exclude = ["secret"]
    edit_header = [TriggerButton(), RegenerateSecretButton()]
    inlines = [WebhookDeliveryInline]

    def get_fields(self, request, obj=None):
        fields = super().get_fields(request, obj)

        # The tenant only means something with multi-tenancy.
        if cs_settings.TENANT_MODEL is None:
            fields = [name for name in fields if name != "tenant"]

        return fields

    def get_created_result(self, request, obj):
        return ButtonResult(
            message=_(
                "The webhook was created. Copy its secret now: it is not shown "
                "again."
            ),
            value=obj.secret,
        )

    def get_related_content_types(self, search, form_data, related_model, request):
        """The models a webhook can fire on: those registered in the admin."""
        registered = [
            model
            for model in cs_settings.ADMIN_SITE._registry
            if model not in (Webhook, WebhookDelivery)
        ]
        content_types = ContentType.objects.filter(
            pk__in=[
                content_type.pk
                for content_type in ContentType.objects.get_for_models(
                    *registered
                ).values()
            ]
        ).order_by("app_label", "model")

        if search:
            content_types = content_types.filter(
                Q(app_label__icontains=search) | Q(model__icontains=search)
            )

        return content_types
