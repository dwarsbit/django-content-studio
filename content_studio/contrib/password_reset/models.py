import datetime
import secrets

from django.db import models
from django.utils import timezone

from content_studio.settings import cs_settings

# Number of failed validation attempts before a code is invalidated.
MAX_ATTEMPTS = 5


def generate_code():
    return "".join(str(secrets.randbelow(10)) for _ in range(6))


class PasswordResetCode(models.Model):
    class Meta:
        db_table = "dcs_password_reset_code"
        verbose_name = "Password reset code"
        verbose_name_plural = "Password reset codes"

    email = models.EmailField(
        max_length=255, verbose_name="Email address", editable=False
    )

    code = models.CharField(
        max_length=6, verbose_name="Code", default=generate_code, editable=False
    )

    attempts = models.PositiveIntegerField(
        default=0, verbose_name="Failed attempts", editable=False
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Created at")

    @property
    def expired(self):
        return (
            self.created_at
            + datetime.timedelta(minutes=cs_settings.PASSWORD_RESET_EXPIRATION_TIME)
            < timezone.now()
        )

    def register_failed_attempt(self):
        """
        Count a failed validation attempt; the code is deleted once the
        attempt limit is reached, so short numeric codes cannot be
        brute-forced within their expiry window.
        """
        self.attempts += 1

        if self.attempts >= MAX_ATTEMPTS:
            self.delete()
            return

        self.save(update_fields=["attempts"])

    def __str__(self):
        return self.email
