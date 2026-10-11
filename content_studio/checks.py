"""
System checks for Content Studio configuration: the registry's model
studios, the extensions and the dashboard are validated whenever
Django's check framework runs (`manage.py check`, runserver startup,
`makemigrations` and CI).
"""

from django.core import checks

from . import formats
from .admin import is_computed_column, iter_components
from .form import TableColumn
from .settings import cs_settings

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

    for check_id, error in duplicate_id_errors(site):
        messages.append(checks.Error(error, obj=site.__class__.__name__, id=check_id))

    return messages
