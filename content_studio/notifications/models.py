from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils.translation import gettext, gettext_lazy as _

__all__ = [
    "Follow",
    "Notification",
    "NotificationSubscription",
]


class Notification(models.Model):
    """
    One notification for one user. Changes made in the admin are
    summarised per recipient, model and action, and a notification that
    is still unread is bumped (count, actor, time) rather than repeated
    when the same thing happens again. The text is rendered when it is
    read, in the reader's language.
    """

    class Meta:
        verbose_name = _("Notification")
        verbose_name_plural = _("Notifications")
        ordering = ["-updated_at", "-pk"]
        indexes = [
            models.Index(
                fields=["recipient", "read_at", "updated_at"],
                name="cs_notification_inbox",
            ),
            models.Index(fields=["recipient", "key"], name="cs_notification_key"),
            models.Index(
                fields=["content_type", "object_id"], name="cs_notification_target"
            ),
        ]

    class Level(models.TextChoices):
        INFO = "info", _("Info")
        SUCCESS = "success", _("Success")
        WARNING = "warning", _("Warning")
        ERROR = "error", _("Error")

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("Recipient"),
    )
    # "content.created", "content.updated", ... or a registered key.
    event = models.CharField(max_length=100, verbose_name=_("Event"))
    level = models.CharField(
        max_length=10,
        choices=Level.choices,
        default=Level.INFO,
        verbose_name=_("Level"),
    )
    # Who did it, most recently; None when unknown or deleted.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        verbose_name=_("Actor"),
    )
    # The object it is about, if any: a pointer that may dangle once
    # the object is deleted, so object_repr keeps its name.
    content_type = models.ForeignKey(
        ContentType,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        verbose_name=_("Model"),
    )
    object_id = models.CharField(max_length=255, blank=True, default="")
    object_repr = models.CharField(max_length=200, blank=True, default="")
    # For notifications without an object: a path in the admin or an
    # absolute URL.
    url = models.CharField(max_length=2000, blank=True, default="")
    # Message ids, translated and filled in with params when read.
    title = models.CharField(max_length=255, blank=True, default="")
    body = models.TextField(blank=True, default="")
    params = models.JSONField(default=dict, blank=True)
    # How many times it happened since it was last read.
    count = models.PositiveIntegerField(default=1)
    # Unread notifications with the same event and key are bumped.
    key = models.CharField(max_length=255, blank=True, default="")
    # The tenant's pk as text, so the migration does not depend on
    # TENANT_MODEL; empty outside tenants.
    tenant = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    read_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.get_title() or self.event

    @property
    def is_read(self) -> bool:
        return self.read_at is not None

    def _render(self, msgid: str) -> str:
        if not msgid:
            return ""

        text = gettext(msgid)

        try:
            return text % self.params if self.params else text
        except (KeyError, TypeError, ValueError):
            # A translation or params that do not fit: show the text
            # rather than fail the list.
            return text

    def get_title(self) -> str:
        """The title in the active language, filled in with params."""
        return self._render(self.title)

    def get_body(self) -> str:
        """The body in the active language, filled in with params."""
        return self._render(self.body)


class NotificationSubscription(models.Model):
    """
    A user's choice for one event: on a model for content changes
    (content_type set), or a registered event (content_type empty), in
    one tenant. Without a row the default applies, so defaults can
    change without a data migration.
    """

    class Meta:
        verbose_name = _("Notification subscription")
        verbose_name_plural = _("Notification subscriptions")
        constraints = [
            # Two constraints, since NULLs are distinct in a unique
            # constraint on most databases.
            models.UniqueConstraint(
                fields=["user", "content_type", "event", "tenant"],
                condition=models.Q(content_type__isnull=False),
                name="cs_subscription_unique_model",
            ),
            models.UniqueConstraint(
                fields=["user", "event", "tenant"],
                condition=models.Q(content_type__isnull=True),
                name="cs_subscription_unique_event",
            ),
        ]

    class Scope(models.TextChoices):
        ALL = "all", _("All objects")
        MINE = "mine", _("Objects I created")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("User"),
    )
    content_type = models.ForeignKey(
        ContentType,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("Model"),
    )
    event = models.CharField(max_length=100, verbose_name=_("Event"))
    # Content changes only: every object, or the ones the user created.
    scope = models.CharField(
        max_length=10,
        choices=Scope.choices,
        default=Scope.MINE,
        verbose_name=_("Scope"),
    )
    enabled = models.BooleanField(default=True, verbose_name=_("Enabled"))
    tenant = models.CharField(max_length=255, blank=True, default="")

    def __str__(self):
        return f"{self.user} · {self.event}"


class Follow(models.Model):
    """
    A user following one object: notified about every change to it.
    """

    class Meta:
        verbose_name = _("Follow")
        verbose_name_plural = _("Follows")
        constraints = [
            models.UniqueConstraint(
                fields=["user", "content_type", "object_id"],
                name="cs_follow_unique",
            )
        ]
        indexes = [
            models.Index(fields=["content_type", "object_id"], name="cs_follow_target")
        ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("User"),
    )
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("Model"),
    )
    object_id = models.CharField(max_length=255)
    tenant = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user} · {self.content_type.model} {self.object_id}"
