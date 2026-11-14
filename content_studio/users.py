"""
Managing other users: the user model's studio, whichever class a project
registers for it, gets a password that admins set, and a guard on what
staff who are not superusers may change.

The guard: only a superuser toggles is_superuser, and only a superuser
changes the email or sets the password of a superuser. Either would let
a staff member take over a superuser account (the email through a
password reset), so neither is left to the change permission alone.
"""

from typing import Optional

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import FieldDoesNotExist
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from django.http import HttpRequest
from django.utils.translation import gettext as _

from .settings import cs_settings
from .utils import MAX_PASSWORD_LENGTH


def is_user_model(model) -> bool:
    return model is not None and model is get_user_model()


def _has_field(model, name: str) -> bool:
    try:
        model._meta.get_field(name)
    except FieldDoesNotExist:
        return False

    return True


def _is_superuser(user) -> bool:
    return bool(getattr(user, "is_superuser", False))


def guarded_field_names(
    model, request: Optional[HttpRequest], obj: Optional[models.Model] = None
) -> set[str]:
    """
    The user model fields the request may not change on obj (None: the
    create form), on top of the studio's own read-only fields. Empty for
    other models and for superusers.
    """
    if not is_user_model(model):
        return set()

    user = getattr(request, "user", None)

    if user is None or _is_superuser(user):
        return set()

    names = set()

    if _has_field(model, "is_superuser"):
        names.add("is_superuser")

    if obj is not None and _is_superuser(obj):
        email_field = model.get_email_field_name()

        if _has_field(model, email_field):
            names.add(email_field)

    return names


def uses_password_login(site=None) -> bool:
    """Whether the site signs in with a username and password."""
    from .login_backends.username_password import UsernamePasswordBackend

    site = site or cs_settings.ADMIN_SITE

    return any(
        isinstance(backend, type) and issubclass(backend, UsernamePasswordBackend)
        for backend in site.login_backend.active_backends
    )


def can_set_password(studio, request: HttpRequest, obj) -> bool:
    """
    Whether the request may set obj's password: the site signs in with
    passwords, the studio allows changing obj, and a superuser's
    password is only set by a superuser. The own password is changed on
    the profile page, which asks for the current one.
    """
    if not is_user_model(type(obj)) or not uses_password_login():
        return False

    user = request.user

    if obj.pk == user.pk:
        return False

    if _is_superuser(obj) and not _is_superuser(user):
        return False

    return bool(studio.has_change_permission(request, obj))


def can_send_password_link(studio, request: HttpRequest, obj) -> bool:
    """
    Whether the request may email obj a link to set their password: as
    for setting it, and obj has an email address and may log in (an
    active staff user), so the link works.
    """
    from .password_links import can_log_in, get_email

    return (
        can_set_password(studio, request, obj)
        and bool(get_email(obj))
        and can_log_in(obj)
    )


def user_info(studio, request: HttpRequest, obj) -> dict:
    """What the edit page of a user offers besides the fields."""
    from .password_links import is_invite

    return {
        "can_set_password": can_set_password(studio, request, obj),
        "can_send_password_link": can_send_password_link(studio, request, obj),
        # Whether the user never logged in: the link is then an invite.
        "invited": is_invite(obj),
    }


def sends_invites(model=None) -> bool:
    """
    Whether creating a user sends an invite: the site logs in with
    passwords and the user model has an email field.
    """
    model = model or get_user_model()

    return uses_password_login() and _has_field(model, model.get_email_field_name())


# The create form's defaults on the user model: only staff users log in,
# so a new user is staff unless unchecked.
CREATE_DEFAULTS = {"is_staff": True}


def check_invite_email(model, validated_data: dict) -> None:
    """
    A new user needs an email address when invites are sent: the invite
    goes to it. Raises the serializer's ValidationError otherwise.
    """
    from rest_framework.exceptions import ValidationError

    if not is_user_model(model) or not sends_invites(model):
        return

    email_field = model.get_email_field_name()

    if not validated_data.get(email_field):
        raise ValidationError(
            {email_field: [_("Enter an email address: the invite is sent to it.")]}
        )


def invite_new_user(obj, request: HttpRequest) -> Optional[str]:
    """
    Prepare a user just created in the admin: no password until they set
    one, and an invite to set it. Returns the message the editor sees.
    """
    from .password_links import can_log_in, get_email, send_link, INVITE

    obj.set_unusable_password()
    obj.save(update_fields=["password"])

    if not sends_invites(type(obj)) or not get_email(obj):
        return None

    if not can_log_in(obj):
        return _(
            "No invite was sent: only active staff users can log in. "
            "Send one from the user's page once they can."
        )

    send_link(obj, request, INVITE)

    return _("Invite sent to %(email)s.") % {"email": get_email(obj)}


def set_password(obj, password: str) -> list[str]:
    """
    Set obj's password after the project's AUTH_PASSWORD_VALIDATORS:
    their messages when it is refused, else an empty list. Setting it
    signs the user out everywhere (tokens carry a password fingerprint).
    """
    if not password:
        return [_("Enter a password.")]

    if len(password) > MAX_PASSWORD_LENGTH:
        return [_("This password is too long.")]

    try:
        validate_password(password, obj)
    except DjangoValidationError as error:
        return list(error.messages)

    obj.set_password(password)
    obj.save(update_fields=["password"])

    return []
