"""
The studios Content Studio registers for the user model and for Django's
groups when a project does not register its own. Subclass them to start
from their layout:

    from content_studio.user_studios import UserStudio

    @register(User)
    class MyUserStudio(UserStudio):
        list_filter = ["is_staff", "groups"]
"""

__all__ = ["GroupStudio", "UserStudio"]

from django.core.exceptions import FieldDoesNotExist
from django.utils.translation import gettext_lazy as _

from .admin import ModelStudio
from .form import FieldLayout, FormSet, FormSetGroup


def _editable_fields(model) -> list[str]:
    return [
        field.name
        for field in model._meta.get_fields()
        if getattr(field, "editable", False)
        and not field.auto_created
        and field.name != "password"
    ]


def _email_field(model) -> str:
    getter = getattr(model, "get_email_field_name", None)

    return getter() if getter else "email"


def _existing(model, names) -> list[str]:
    result = []

    for name in names:
        try:
            model._meta.get_field(name)
        except FieldDoesNotExist:
            continue

        result.append(name)

    return result


class UserStudio(ModelStudio):
    """
    The user model's studio: the account and personal details on one
    tab, access, groups and permissions on another, and the login dates
    in the sidebar. Fields a custom user model lacks are left out, and
    fields the layout does not know are added to the first tab.
    """

    icon = "ph-bold ph-users"

    def __init__(self, model, admin_site):
        super().__init__(model, admin_site)
        username = getattr(model, "USERNAME_FIELD", "username")
        email = _email_field(model)

        # The defaults adapt to the user model's fields; what a subclass
        # sets itself is kept.
        if not self._overrides("edit_main") and not self._overrides("edit_sidebar"):
            self.edit_main, self.edit_sidebar = self._default_layout(username, email)

        if not self._overrides("table_display") and not self._overrides("list_display"):
            self.table_display = _existing(
                model, [username, email, "first_name", "last_name", "is_staff"]
            ) or ["__str__"]

        if not self._overrides("search_fields"):
            self.search_fields = _existing(
                model, [username, "first_name", "last_name", email]
            )

        if not self._overrides("list_filter"):
            self.list_filter = _existing(
                model, ["is_staff", "is_superuser", "is_active", "groups"]
            )

        if not self._overrides("ordering"):
            self.ordering = _existing(model, [username])

        if not self._overrides("readonly_fields"):
            self.readonly_fields = _existing(model, ["last_login", "date_joined"])

    def _overrides(self, name: str) -> bool:
        """Whether a subclass sets the attribute itself."""
        return any(
            name in vars(klass)
            for klass in type(self).__mro__
            if issubclass(klass, UserStudio) and klass is not UserStudio
        )

    def _default_layout(self, username, email):
        model = self.model
        editable = _editable_fields(model)
        sidebar_fields = _existing(model, ["last_login", "date_joined"])
        names = _existing(model, ["first_name", "last_name"])
        personal = []

        if len(names) == 2:
            personal.append(FieldLayout(names, columns=2))
        else:
            personal.extend(names)

        personal.extend(
            name
            for name in _existing(model, [email])
            if name in editable and name != username
        )
        access = [
            name
            for name in _existing(model, ["is_active", "is_staff", "is_superuser"])
            if name in editable
        ]
        groups = [name for name in _existing(model, ["groups"]) if name in editable]
        permissions = [
            name for name in _existing(model, ["user_permissions"]) if name in editable
        ]
        placed = {
            username,
            *names,
            email,
            *access,
            *groups,
            *permissions,
            *sidebar_fields,
        }
        account = [username] if username in editable else []
        account.extend(name for name in editable if name not in placed)

        account_tab = [FormSet(fields=account)] if account else []

        if personal:
            account_tab.append(FormSet(_("Personal info"), fields=personal))

        permissions_tab = []

        if access:
            permissions_tab.append(FormSet(_("Access"), fields=access))

        # The fields' own labels and help texts name them.
        if groups or permissions:
            permissions_tab.append(FormSet(fields=groups + permissions))

        main = [FormSetGroup(_("Account"), account_tab)]

        if permissions_tab:
            main.append(FormSetGroup(_("Permissions"), permissions_tab))

        sidebar = (
            [FormSet(_("Important dates"), fields=sidebar_fields)]
            if sidebar_fields
            else []
        )

        return main, sidebar


class GroupStudio(ModelStudio):
    """Django's groups: a name and the permissions of the group's users."""

    icon = "ph-bold ph-users-three"
    table_display = ["name"]
    search_fields = ["name"]
    ordering = ["name"]
    edit_main = [FormSet(fields=["name", "permissions"])]
