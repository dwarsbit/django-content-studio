from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class ContentStudioHistoryConfig(AppConfig):
    name = "content_studio.history"
    label = "content_studio_history"
    # Pinned so the shipped migrations never depend on the project's
    # DEFAULT_AUTO_FIELD.
    default_auto_field = "django.db.models.BigAutoField"
    verbose_name = _("History")
