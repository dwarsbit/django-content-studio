"""
Editing permissions: the many-to-many fields to auth.Permission (a
user's user_permissions, a group's permissions) are edited in a matrix
of models and actions, and staff who are not superusers can only grant
what they have themselves.

The guard: a non-superuser may add or remove only the permissions they
hold, and add a user to (or remove one from) only the groups whose
permissions they all hold. Either would otherwise let a staff member who
may change users hand out, or take, more than they have.
"""

from typing import Optional

from django.apps import apps
from django.utils.text import capfirst
from django.utils.translation import gettext as _
from rest_framework.exceptions import ValidationError

# The actions every model gets a permission for, in the matrix's order.
DEFAULT_ACTIONS = ("add", "change", "view", "delete")


def _auth_installed() -> bool:
    return apps.is_installed("django.contrib.auth")


def _related_model(field):
    if not getattr(field, "many_to_many", False):
        return None

    return getattr(field, "related_model", None)


def is_permission_field(field) -> bool:
    """Whether field is a many-to-many field to auth.Permission."""
    if not _auth_installed():
        return False

    from django.contrib.auth.models import Permission

    return _related_model(field) is Permission


def is_group_field(field) -> bool:
    """Whether field is a many-to-many field to auth.Group."""
    if not _auth_installed():
        return False

    from django.contrib.auth.models import Group

    return _related_model(field) is Group


def _perm_key(permission) -> str:
    return f"{permission.content_type.app_label}.{permission.codename}"


def held_permission_keys(user) -> Optional[set[str]]:
    """
    The permissions user holds, as "app_label.codename" (their own and
    their groups'); None for a superuser, who holds them all.
    """
    if user is None or not getattr(user, "is_active", False):
        return set()

    if getattr(user, "is_superuser", False):
        return None

    return set(user.get_all_permissions())


def get_action(permission) -> Optional[str]:
    """The default action a permission is for ("add" ...), else None."""
    model = permission.content_type.model

    for action in DEFAULT_ACTIONS:
        if permission.codename == f"{action}_{model}":
            return action

    return None


def get_permission_options(user) -> list[dict]:
    """
    All permissions, grouped by app and model, for the matrix: per
    permission whether user may grant it.
    """
    from django.contrib.auth.models import Permission

    held = held_permission_keys(user)
    apps_by_label: dict[str, dict] = {}
    permissions = Permission.objects.select_related("content_type").order_by(
        "content_type__app_label", "content_type__model", "id"
    )

    for permission in permissions:
        content_type = permission.content_type
        app_label = content_type.app_label
        app = apps_by_label.get(app_label)

        if app is None:
            try:
                app_name = apps.get_app_config(app_label).verbose_name
            except LookupError:
                app_name = app_label

            app = apps_by_label[app_label] = {
                "app_label": app_label,
                "name": capfirst(str(app_name)),
                "models": {},
            }

        model_entry = app["models"].get(content_type.model)

        if model_entry is None:
            model_class = content_type.model_class()
            name = (
                model_class._meta.verbose_name_plural
                if model_class is not None
                else content_type.name
            )
            model_entry = app["models"][content_type.model] = {
                "model": f"{app_label}.{content_type.model}",
                "name": capfirst(str(name)),
                "permissions": [],
            }

        model_entry["permissions"].append(
            {
                "id": permission.pk,
                "__str__": str(permission),
                "codename": permission.codename,
                "name": permission.name,
                "action": get_action(permission),
                "grantable": held is None or _perm_key(permission) in held,
            }
        )

    result = []

    for app in sorted(apps_by_label.values(), key=lambda app: app["name"].lower()):
        app["models"] = sorted(
            app["models"].values(), key=lambda model: model["name"].lower()
        )
        result.append(app)

    return result


def _ids(values) -> set:
    return {value.pk for value in values}


def _current(instance, name) -> list:
    if instance is None or instance.pk is None:
        return []

    return list(getattr(instance, name).all())


def check_permission_changes(model, instance, attrs: dict, request) -> None:
    """
    Refuse a save in which a non-superuser grants or revokes permissions
    they do not hold, directly or through a group. Raises a DRF
    ValidationError on the field.
    """
    if not _auth_installed() or model is None:
        return

    held = held_permission_keys(getattr(request, "user", None))

    if held is None:
        return

    errors = {}

    for field in model._meta.many_to_many:
        if field.name not in attrs:
            continue

        new = list(attrs[field.name] or [])
        current = _current(instance, field.name)
        changed_ids = _ids(new) ^ _ids(current)

        if not changed_ids:
            continue

        changed = [obj for obj in new + current if obj.pk in changed_ids]

        if is_permission_field(field):
            refused = sorted(
                {str(perm) for perm in changed if _perm_key(perm) not in held}
            )

            if refused:
                errors[field.name] = [
                    _(
                        "You can only grant or revoke permissions you have "
                        "yourself. Not allowed: %(permissions)s."
                    )
                    % {"permissions": ", ".join(refused)}
                ]

        elif is_group_field(field):
            refused = sorted(
                {
                    str(group)
                    for group in changed
                    if not _group_is_grantable(group, held)
                }
            )

            if refused:
                errors[field.name] = [
                    _(
                        "You can only add or remove groups whose permissions "
                        "you all have yourself. Not allowed: %(groups)s."
                    )
                    % {"groups": ", ".join(refused)}
                ]

    if errors:
        raise ValidationError(errors)


def _group_is_grantable(group, held: set[str]) -> bool:
    permissions = group.permissions.select_related("content_type")

    return all(_perm_key(permission) in held for permission in permissions)
