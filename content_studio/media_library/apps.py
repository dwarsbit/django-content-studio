from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class ContentStudioMediaLibraryConfig(AppConfig):
    name = "content_studio.media_library"
    label = "content_studio_media_library"
    verbose_name = _("Media Library")
