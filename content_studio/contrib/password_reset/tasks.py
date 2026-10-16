"""
The password reset emails, as Django tasks.

Sending mail inside the request makes its duration reveal whether an email
belongs to an account (only then is a mail sent). As tasks, the request
only enqueues the work. Which backend runs it is the project's choice
through Django's TASKS setting: without one, Django's ImmediateBackend runs
the task right away, in the request, as before.

Django 5.2 has no django.tasks; there the django-tasks backport is used
when installed, and otherwise the mail is sent synchronously.
"""

import logging

from django.core.mail import send_mail
from django.utils import translation
from django.utils.translation import gettext as _

try:
    from django.tasks import task
except ImportError:  # Django < 6.0
    try:
        from django_tasks import task
    except ImportError:
        task = None

logger = logging.getLogger("content_studio.password_reset")


class _SynchronousTask:
    """The enqueue interface of a task, running the function in place."""

    def __init__(self, func):
        self.func = func

    def enqueue(self, *args, **kwargs):
        return self.func(*args, **kwargs)

    def call(self, *args, **kwargs):
        return self.func(*args, **kwargs)


def _as_task(func):
    return task(func) if task is not None else _SynchronousTask(func)


def send_reset_code(reset_id, language=None):
    with translation.override(language):
        _send_reset_code_mail(reset_id)


def _send_reset_code_mail(reset_id):
    from .models import PasswordResetCode

    reset = PasswordResetCode.objects.filter(pk=reset_id).first()

    # Replaced, used or locked out since it was enqueued: nothing to send.
    if reset is None or not reset.code:
        return

    try:
        send_mail(
            from_email=None,
            subject=_("Your password reset code"),
            message=_("Your password reset code is: ") + reset.code,
            recipient_list=[reset.email],
        )
    except Exception:
        logger.exception("Could not send password reset email to %s", reset.email)
        # A code nobody received cannot be used; a new request issues one.
        reset.delete()


def send_reset_confirmation(email, language=None):
    with translation.override(language):
        _send_reset_confirmation_mail(email)


def _send_reset_confirmation_mail(email):
    try:
        send_mail(
            from_email=None,
            subject=_("Your password has been reset"),
            message=_(
                "Your password has been reset. If you did not do this, please contact your administrator."
            ),
            recipient_list=[email],
        )
    except Exception:
        logger.exception("Could not send password reset confirmation to %s", email)


# Workers import tasks by module and function name, so each task keeps the
# name of the function it wraps.
send_reset_code = _as_task(send_reset_code)
send_reset_confirmation = _as_task(send_reset_confirmation)
