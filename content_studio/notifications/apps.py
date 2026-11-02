from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class ContentStudioNotificationsConfig(AppConfig):
    name = "content_studio.notifications"
    label = "content_studio_notifications"
    # Pinned so the shipped migrations never depend on the project's
    # DEFAULT_AUTO_FIELD.
    default_auto_field = "django.db.models.BigAutoField"
    verbose_name = _("Notifications")

    def ready(self):
        from ..signals import content_changed
        from .fan_out import notify_changes

        content_changed.connect(
            notify_changes, dispatch_uid="content_studio_notifications"
        )
