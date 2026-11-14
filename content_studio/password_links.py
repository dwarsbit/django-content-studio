"""
Set-password links: the invite a new user gets, and the link an admin
sends an existing user to set a new password.

A link carries the user's id and a token from Django's own
default_token_generator, the one behind the classic password reset. The
token needs no table: it is signed with SECRET_KEY over the user's
password, last login and email, so it stops working once the password
is set or the user logs in, and after PASSWORD_RESET_TIMEOUT.

The emails are sent as Django tasks, like the password reset emails:
which backend runs them is the project's choice through Django's TASKS
setting, and without a tasks framework (Django 5.2 without django-tasks)
they are sent in place.
"""

import logging
from typing import Optional
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.signals import user_logged_in
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.http import HttpRequest
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils import translation
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils.translation import get_language
from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy, ngettext
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .settings import cs_settings
from .throttling import ClientIPMixin

try:
    from django.tasks import task
except ImportError:  # Django < 6.0
    try:
        from django_tasks import task
    except ImportError:
        task = None

logger = logging.getLogger("content_studio.users")

# The admin's page that sets the password, relative to the admin's root.
SET_PASSWORD_PATH = "set-password"

INVITE = "invite"
RESET = "reset"


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


def get_email(user) -> str:
    """The user's email address, empty when the model has none."""
    return getattr(user, user.get_email_field_name(), "") or ""


def is_invite(user) -> bool:
    """Whether a link for the user is an invite: they never logged in."""
    if hasattr(user, "last_login"):
        return user.last_login is None

    return not user.has_usable_password()


def can_log_in(user) -> bool:
    """Only active staff users log in to the admin."""
    return bool(getattr(user, "is_active", True) and getattr(user, "is_staff", False))


def admin_root_url(request: Optional[HttpRequest] = None) -> str:
    """
    The admin's absolute URL, ending in a slash: ADMIN_URL when set
    (needed behind a proxy that changes the host), else the request's.
    """
    if cs_settings.ADMIN_URL:
        return cs_settings.ADMIN_URL.rstrip("/") + "/"

    return request.build_absolute_uri(reverse("content_studio_web"))


def make_link(user, request: Optional[HttpRequest] = None) -> str:
    """The absolute URL of the page that sets the user's password."""
    query = urlencode(
        {
            "uid": urlsafe_base64_encode(force_bytes(user.pk)),
            "token": default_token_generator.make_token(user),
        }
    )

    return f"{admin_root_url(request)}{SET_PASSWORD_PATH}?{query}"


def get_link_user(uid: str, token: str):
    """
    The user a link is for, when its token is valid and the user may log
    in; None otherwise.
    """
    if not isinstance(uid, str) or not isinstance(token, str):
        return None

    try:
        pk = force_str(urlsafe_base64_decode(uid))
        user = get_user_model()._default_manager.get(pk=pk)
    except Exception:
        return None

    if not can_log_in(user) or not default_token_generator.check_token(user, token):
        return None

    return user


def send_link(user, request: HttpRequest, kind: Optional[str] = None) -> str:
    """
    Send the user a link to set their password, once the transaction
    commits: an invite when they never logged in, else a reset. Returns
    the kind sent.
    """
    kind = kind or (INVITE if is_invite(user) else RESET)
    link = make_link(user, request)
    sender = _display_name(request.user)
    language = get_language()
    pk = user.pk

    transaction.on_commit(
        lambda: send_link_task.enqueue(pk, kind, link, sender, language)
    )

    return kind


def _display_name(user) -> str:
    full_name = user.get_full_name() if hasattr(user, "get_full_name") else ""

    return (full_name or "").strip() or user.get_username()


def send_link_mail(pk, kind, link, sender, language=None):
    with translation.override(language):
        _send_link_mail(pk, kind, link, sender)


def expiry_text(seconds: int) -> str:
    """How long a link works, in whole days, or else hours."""
    days, hours = round(seconds / 86400), max(1, round(seconds / 3600))

    if seconds >= 86400 and days:
        return ngettext("%(count)d day", "%(count)d days", days) % {"count": days}

    return ngettext("%(count)d hour", "%(count)d hours", hours) % {"count": hours}


def _send_link_mail(pk, kind, link, sender):
    user = get_user_model()._default_manager.filter(pk=pk).first()

    # Removed since it was enqueued: nothing to send.
    if user is None or not get_email(user):
        return

    site_title = str(getattr(cs_settings.ADMIN_SITE, "site_title", "") or "")
    context = {
        "name": _display_name(user),
        "username": user.get_username(),
        "sender": sender,
        "site_title": site_title,
        "link": link,
        "expires": expiry_text(settings.PASSWORD_RESET_TIMEOUT),
    }

    if kind == INVITE:
        subject = _("You are invited to %(site)s") % {"site": site_title}
        template = "content_studio/users/invite.txt"
    else:
        subject = _("Set a new password for %(site)s") % {"site": site_title}
        template = "content_studio/users/password_link.txt"

    try:
        send_mail(
            from_email=None,
            subject=subject,
            message=render_to_string(template, context),
            recipient_list=[get_email(user)],
        )
    except Exception:
        logger.exception("Could not send the %s email to user %s", kind, pk)


# Workers import tasks by module and function name, so the task keeps the
# name of the function it wraps.
send_link_task = _as_task(send_link_mail)


class SetPasswordRateThrottle(ClientIPMixin, AnonRateThrottle):
    """
    Rate limit for the set-password page, per IP, from the
    CONTENT_STUDIO["PASSWORD_RESET_THROTTLE_RATE"] setting.
    """

    scope = "content_studio_set_password"

    def get_rate(self):
        return cs_settings.PASSWORD_RESET_THROTTLE_RATE

    def allow_request(self, request, view):
        if not self.rate:
            return True

        return super().allow_request(request, view)


INVALID_LINK = gettext_lazy("This link is no longer valid.")


class SetPasswordCheckView(APIView):
    """Whether a link is valid, and whose it is."""

    authentication_classes = []
    permission_classes = [AllowAny]
    renderer_classes = [JSONRenderer]
    throttle_classes = [SetPasswordRateThrottle]

    def post(self, request):
        user = get_link_user(request.data.get("uid"), request.data.get("token"))

        if user is None:
            return Response([str(INVALID_LINK)], status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "username": user.get_username(),
                "name": _display_name(user),
                "invite": is_invite(user),
            }
        )


class SetPasswordView(APIView):
    """
    Set the password with a link, after AUTH_PASSWORD_VALIDATORS, and log
    the user in: the response carries their tokens.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    renderer_classes = [JSONRenderer]
    throttle_classes = [SetPasswordRateThrottle]

    def post(self, request):
        from .users import set_password

        user = get_link_user(request.data.get("uid"), request.data.get("token"))

        if user is None:
            return Response([str(INVALID_LINK)], status=status.HTTP_400_BAD_REQUEST)

        password = request.data.get("password")
        errors = set_password(user, password if isinstance(password, str) else "")

        if errors:
            return Response({"password": errors}, status=status.HTTP_400_BAD_REQUEST)

        # Setting the password logs the user in, as Django's login()
        # would: last_login is updated and audit tools hear of it.
        user_logged_in.send(sender=user.__class__, request=request._request, user=user)

        return (
            cs_settings.ADMIN_SITE.token_backend.active_backend.get_response_for_user(
                user, request
            )
        )
