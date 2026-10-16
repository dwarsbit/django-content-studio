from django.apps import AppConfig


class Config(AppConfig):
    name = "content_studio.contrib.password_reset"
    # Pinned so the shipped migrations match whatever DEFAULT_AUTO_FIELD a
    # project uses; otherwise makemigrations would write a migration into
    # the installed package.
    default_auto_field = "django.db.models.BigAutoField"
    verbose_name = "DCS Password Reset"
