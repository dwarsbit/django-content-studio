"""
System checks for Content Studio configuration: the registry's model
studios, the extensions and the dashboard are validated whenever
Django's check framework runs (`manage.py check`, runserver startup,
`makemigrations` and CI).
"""

from django.contrib.auth import get_user_model
from django.core import checks

from . import formats
from .actions import (
    BULK_ACTION_PERMISSIONS,
    DELETE_ACTION_ID,
    declared_bulk_actions,
)
from .admin import AdminSerializer, is_computed_column, iter_components
from .form import Field, TableColumn
from .settings import cs_settings
from .utils import get_tenant_field_name

LIST_VIEW_NAMES = {"table", "list"}


def table_column_errors(studio) -> list[tuple[str, str]]:
    """
    Unresolvable or ambiguous table_display columns, as (check id,
    message) pairs. A column resolves to a model field, __str__ or a
    method on the studio; anything else would fail when rows are
    serialized. Column names must be unique and explicit formats must
    be format classes.
    """
    errors = []

    def validate(owner, model):
        if model is None:
            return

        model_field_names = {field.name for field in model._meta.get_fields()}
        seen = set()

        for entry in getattr(owner, "table_display", []):
            if isinstance(entry, str):
                column = TableColumn(field=entry)
            elif isinstance(entry, TableColumn):
                column = entry
            else:
                errors.append(
                    (
                        "content_studio.E006",
                        f"{owner.__class__.__name__}.table_display entries must be "
                        f"field names or TableColumn objects; got {entry!r}.",
                    )
                )
                continue

            if column.field in seen:
                errors.append(
                    (
                        "content_studio.E006",
                        f"{owner.__class__.__name__}.table_display contains a "
                        f"duplicate column {column.field!r}; column names must "
                        "be unique.",
                    )
                )
            seen.add(column.field)

            is_method = is_computed_column(owner, column)
            is_resolvable = (
                is_method
                or column.field == "__str__"
                or column.field in model_field_names
            )

            if not is_resolvable:
                errors.append(
                    (
                        "content_studio.E006",
                        f"{owner.__class__.__name__}.table_display column "
                        f"{column.field!r} does not resolve to a model field, "
                        "__str__ or a method on the studio.",
                    )
                )

            if column.format is not None and not (
                isinstance(column.format, type)
                and issubclass(column.format, formats.BaseFormat)
            ):
                errors.append(
                    (
                        "content_studio.E006",
                        f"{owner.__class__.__name__}.table_display column "
                        f"{column.field!r} has format {column.format!r}; formats "
                        "must be content_studio.formats classes.",
                    )
                )

    model = getattr(studio, "model", None)
    validate(studio, model)

    for inline in getattr(studio, "inlines", None) or []:
        validate(inline, getattr(inline, "model", None))

    return errors


def edit_field_warnings(studio) -> list[tuple[str, str]]:
    """
    Required model fields missing from the edit form, as (check id,
    message) pairs. A field is required when the API would reject a
    save without it, mirroring the serializer: editable, not nullable,
    not blank and without a default.

    Fields Content Studio fills itself never count: the created/edited
    stamps from the settings, the tenant relation (set from the tenant
    header) and the user model's password, which the API leaves out
    entirely. An unset edit_main falls back to every editable field, so
    only explicit configurations are at risk; required fields dropped
    through exclude are reported all the same.
    """
    model = getattr(studio, "model", None)

    if model is None:
        return []

    form_fields = edit_form_field_names(studio)

    ignored = {
        name
        for name in (
            cs_settings.CREATED_BY_ATTR,
            cs_settings.EDITED_BY_ATTR,
            cs_settings.EDITED_AT_ATTR,
        )
        if hasattr(model, name)
    }

    try:
        tenant_field_name = get_tenant_field_name(model)
    except ValueError:
        tenant_field_name = None

    if tenant_field_name:
        ignored.add(tenant_field_name)

    if model is get_user_model():
        ignored.add("password")

        if get_user_model().USERNAME_FIELD != "username":
            ignored.add("username")

    warnings = []

    for field in model._meta.get_fields():
        if (
            not field.editable
            or field.auto_created
            or field.blank
            or field.null
            or field.has_default()
            or field.name in ignored
            or field.name in form_fields
        ):
            continue

        warnings.append(
            (
                "content_studio.W001",
                f"{studio.__class__.__name__}: the required field "
                f"{field.name!r} is not in edit_main or edit_sidebar, so "
                "saving objects will fail validation. Add the field to the "
                "edit form or give the model field a default, make it "
                "nullable or blank, or exclude it consciously by filling it "
                "in programmatically.",
            )
        )

    return warnings


def edit_form_field_names(studio) -> set[str]:
    """
    The model field names the edit form exposes, mirroring
    AdminSerializer's normalization of edit_main and edit_sidebar. An
    unset edit_main falls back to every editable field minus exclude.
    """
    serializer = AdminSerializer(studio)
    names = set()

    edit_main = getattr(studio, "edit_main", None) or []

    if not edit_main:
        names.update(studio.get_fields(None))
    else:
        for group in serializer.get_edit_main(edit_main):
            names.update(_field_names(group.get_fields()))

    for form_set in serializer.get_edit_sidebar(getattr(studio, "edit_sidebar", None)):
        names.update(_field_names(form_set.get_fields()))

    return names


def _field_names(fields) -> set[str]:
    """The names of Field entries; Components are custom UI and carry no
    model field name."""
    return {field.name for field in fields if isinstance(field, Field)}


def bulk_action_errors(studio) -> list[tuple[str, str]]:
    """
    Misconfigured bulk actions, as (check id, message) pairs. An
    explicit actions list must name the built-in delete or a declared
    @bulk_action method (and each name only once); declared actions may
    not shadow the built-in delete or list unknown permissions.
    """
    errors = []
    declared = declared_bulk_actions(studio)
    actions = getattr(studio, "actions", None)

    if name := next((name for name in declared if name == DELETE_ACTION_ID), None):
        errors.append(
            (
                "content_studio.E007",
                f"{studio.__class__.__name__}.bulk action {name!r} shadows "
                "the built-in delete action; give it another name.",
            )
        )

    if actions is not None:
        seen = set()

        for name in actions:
            if name != DELETE_ACTION_ID and name not in declared:
                errors.append(
                    (
                        "content_studio.E007",
                        f"{studio.__class__.__name__}.actions contains "
                        f"{name!r}, which is not a @bulk_action method "
                        "(or the built-in delete).",
                    )
                )

            if name in seen:
                errors.append(
                    (
                        "content_studio.E007",
                        f"{studio.__class__.__name__}.actions contains "
                        f"{name!r} more than once.",
                    )
                )
            seen.add(name)

    for name, handler in declared.items():
        unknown = [
            permission
            for permission in handler.bulk_action.allowed_permissions
            if permission not in BULK_ACTION_PERMISSIONS
        ]

        if unknown:
            errors.append(
                (
                    "content_studio.E007",
                    f"{studio.__class__.__name__}.bulk action {name!r} lists "
                    f"unknown permission(s) {', '.join(unknown)}. Available: "
                    f"{', '.join(BULK_ACTION_PERMISSIONS)}.",
                )
            )

    return errors


def list_config_errors(studio) -> list[tuple[str, str]]:
    """
    Misconfigured list pages, as (check id, message) pairs. Content
    Studio repurposes list_display for the list view, so an old-style
    list/tuple (the classic admin's table columns) must be pointed at
    table_display rather than silently ignored.
    """
    errors = []

    if isinstance(studio.list_display, (list, tuple)):
        errors.append(
            (
                "content_studio.E001",
                f"{studio.__class__.__name__}.list_display configures the "
                "list view and takes a mapping like "
                "{'title': 'name', 'description': 'subtitle'}. For table "
                "columns, use table_display.",
            )
        )

    unknown_views = [view for view in studio.list_views if view not in LIST_VIEW_NAMES]

    if unknown_views:
        errors.append(
            (
                "content_studio.E002",
                f"{studio.__class__.__name__}.list_views contains unknown "
                f"view(s) {', '.join(unknown_views)}. Available views: "
                f"{', '.join(sorted(LIST_VIEW_NAMES))}.",
            )
        )

    return errors


def duplicate_id_errors(site) -> list[tuple[str, str]]:
    """
    Extension, dashboard widget and component ID collisions, as (check
    id, message) pairs. IDs are derived from the class and its
    label/url/name by default, so duplicates mean an explicit ID is
    needed.
    """
    errors = []

    seen = {}
    for extension in getattr(site, "extensions", None) or []:
        key = str(extension.extension_id)
        if key in seen:
            errors.append(
                (
                    "content_studio.E003",
                    f"Duplicate extension ID {key}: "
                    f"{seen[key]} and {extension.__class__.__name__}. "
                    "Pass extension_id to disambiguate.",
                )
            )
        seen[key] = extension.__class__.__name__

    if site.dashboard:
        seen = {}
        for widget in site.dashboard.widgets or []:
            key = str(widget.widget_id)
            if key in seen:
                errors.append(
                    (
                        "content_studio.E004",
                        f"Duplicate dashboard widget ID {key}: "
                        f"{seen[key]} and {widget.__class__.__name__}. "
                        "Pass widget_id to disambiguate.",
                    )
                )
            seen[key] = widget.__class__.__name__

    seen = {}
    for model, studio in site._registry.items():
        for component in iter_components(studio):
            key = str(component.component_id)
            if key in seen:
                errors.append(
                    (
                        "content_studio.E005",
                        f"Duplicate component ID {key}: "
                        f"{seen[key]} and {component.__class__.__name__} "
                        f"in {studio.__class__.__name__}. "
                        "Pass component_id to disambiguate.",
                    )
                )
            seen[key] = component.__class__.__name__

    return errors


@checks.register()
def check_content_studio(app_configs=None, **kwargs) -> list[checks.CheckMessage]:
    site = cs_settings.ADMIN_SITE

    messages = []

    for model, studio in site._registry.items():
        obj = f"{studio.__class__.__name__} ({model._meta.label_lower})"

        for check_id, error in list_config_errors(studio):
            messages.append(checks.Error(error, obj=obj, id=check_id))

        for check_id, error in table_column_errors(studio):
            messages.append(checks.Error(error, obj=obj, id=check_id))

        for check_id, error in bulk_action_errors(studio):
            messages.append(checks.Error(error, obj=obj, id=check_id))

        for check_id, warning in edit_field_warnings(studio):
            messages.append(checks.Warning(warning, obj=obj, id=check_id))

    for check_id, error in duplicate_id_errors(site):
        messages.append(checks.Error(error, obj=site.__class__.__name__, id=check_id))

    return messages
