import secrets
import uuid

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _

from ..signals import ACTION_FLAGS

__all__ = [
    "Webhook",
    "WebhookDelivery",
]


def generate_secret():
    return secrets.token_hex(32)


def validate_events(value):
    if not isinstance(value, list) or any(event not in ACTION_FLAGS for event in value):
        raise ValidationError(
            _("Events must be a list of: %(events)s."),
            params={"events": ", ".join(ACTION_FLAGS)},
        )


class Webhook(models.Model):
    """
    A URL that receives a POST request after changes made in the
    admin. Empty events, content types or tenant match everything.
    """

    class Meta:
        verbose_name = _("Webhook")
        verbose_name_plural = _("Webhooks")
        ordering = ["name"]

    name = models.CharField(max_length=100, verbose_name=_("Name"))
    url = models.URLField(max_length=2000, verbose_name=_("URL"))
    secret = models.CharField(
        max_length=64,
        default=generate_secret,
        verbose_name=_("Secret"),
        help_text=_("Signs every request, so the receiver can verify it."),
    )
    events = models.JSONField(
        default=list,
        blank=True,
        validators=[validate_events],
        verbose_name=_("Events"),
        help_text=_("The changes that trigger the webhook; empty for all."),
    )
    content_types = models.ManyToManyField(
        ContentType,
        blank=True,
        related_name="+",
        verbose_name=_("Models"),
        help_text=_("The models whose changes trigger the webhook; empty for all."),
    )
    # The tenant's pk as text, so the migration does not depend on
    # TENANT_MODEL.
    tenant = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name=_("Tenant"),
        help_text=_("Only changes in this tenant trigger the webhook; empty for all."),
    )
    is_active = models.BooleanField(default=True, verbose_name=_("Active"))
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    def clean(self):
        from .delivery import WebhookError, check_url

        try:
            check_url(self.url)
        except WebhookError as exc:
            raise ValidationError({"url": str(exc)})

    def matches(self, change, content_type_ids) -> bool:
        """Whether a change triggers the webhook; content_type_ids are
        the ids of the webhook's content types."""
        if self.events and change.action not in self.events:
            return False

        if content_type_ids and (
            ContentType.objects.get_for_model(change.model).pk not in content_type_ids
        ):
            return False

        if self.tenant and (
            change.tenant_id is None or str(change.tenant_id) != self.tenant
        ):
            return False

        return True


class WebhookDelivery(models.Model):
    """
    One request to a webhook, with the payload it sends and the outcome
    of its latest attempt.
    """

    class Meta:
        verbose_name = _("Webhook delivery")
        verbose_name_plural = _("Webhook deliveries")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "next_attempt_at"])]

    class Status(models.TextChoices):
        PENDING = "pending", _("Pending")
        SUCCESS = "success", _("Success")
        FAILED = "failed", _("Failed")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    webhook = models.ForeignKey(
        Webhook,
        on_delete=models.CASCADE,
        related_name="deliveries",
        verbose_name=_("Webhook"),
    )
    payload = models.JSONField(verbose_name=_("Payload"))
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name=_("Status"),
    )
    attempts = models.PositiveSmallIntegerField(default=0, verbose_name=_("Attempts"))
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    response_status = models.PositiveSmallIntegerField(
        null=True, blank=True, verbose_name=_("Response status")
    )
    response_body = models.TextField(blank=True, verbose_name=_("Response"))
    error = models.TextField(blank=True, verbose_name=_("Error"))
    created_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.webhook} ({self.get_status_display()})"
