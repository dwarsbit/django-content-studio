from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class ContentStudioWebhooksConfig(AppConfig):
    name = "content_studio.webhooks"
    label = "content_studio_webhooks"
    # Pinned so the shipped migrations never depend on the project's
    # DEFAULT_AUTO_FIELD.
    default_auto_field = "django.db.models.BigAutoField"
    verbose_name = _("Webhooks")

    def ready(self):
        from ..signals import content_changed
        from .delivery import create_deliveries

        content_changed.connect(
            create_deliveries, dispatch_uid="content_studio_webhooks"
        )
