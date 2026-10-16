from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class ContentStudioMediaLibraryConfig(AppConfig):
    name = "content_studio.media_library"
    label = "content_studio_media_library"
    # Pinned so the shipped migrations never depend on the project's
    # DEFAULT_AUTO_FIELD (the models use UUID keys today).
    default_auto_field = "django.db.models.BigAutoField"
    verbose_name = _("Media Library")
