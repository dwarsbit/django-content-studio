from django.contrib.admin.models import LogEntry
from django.contrib.contenttypes.models import ContentType
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Version(models.Model):
    """
    An object's values after a change made in the admin, kept with the
    change's activity log entry. data holds every tracked field as the
    edit page has it (see content_studio.snapshots); fields names the
    fields the change touched and previous their values before it.
    """

    log_entry = models.OneToOneField(
        LogEntry, on_delete=models.CASCADE, related_name="content_studio_version"
    )
    content_type = models.ForeignKey(
        ContentType, on_delete=models.CASCADE, related_name="+"
    )
    object_id = models.CharField(max_length=255)
    fields = models.JSONField(default=list)
    previous = models.JSONField(default=dict, encoder=DjangoJSONEncoder)
    data = models.JSONField(default=dict, encoder=DjangoJSONEncoder)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = _("version")
        verbose_name_plural = _("versions")
        ordering = ["-created_at", "-pk"]
        indexes = [
            models.Index(
                fields=["content_type", "object_id", "-created_at"],
                name="cs_history_object_idx",
            )
        ]

    def __str__(self):
        return (
            f"{self.content_type} {self.object_id} ({self.created_at:%Y-%m-%d %H:%M})"
        )
