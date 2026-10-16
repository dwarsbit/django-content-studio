"""
System checks for Content Studio configuration: the registry's model
studios, the extensions and the dashboard are validated whenever
Django's check framework runs (`manage.py check`, runserver startup,
`makemigrations` and CI).
"""

from django.contrib.auth import get_user_model
from django.core import checks
from django.core.exceptions import FieldDoesNotExist
from django.db import models

from . import formats, widgets
from .actions import (
    BULK_ACTION_PERMISSIONS,
    DELETE_ACTION_ID,
    declared_bulk_actions,
)
from .admin import (
    AdminSerializer,
    declares,
    get_table_display_columns,
    is_computed_column,
    iter_components,
    resolve_table_display,
)
from .form import Field, TableColumn
from .settings import cs_settings
from .utils import flatten, get_tenant_field_name

LIST_VIEW_NAMES = {"table", "list"}


def config_name(owner) -> str:
    """
    The name to attribute configuration to: model studios arrive as
    instances, their inlines as classes.
    """
    if isinstance(owner, type):
        return owner.__name__

    return owner.__class__.__name__


# Widgets that render a field's choices; a field without any would
# leave them empty.
CHOICE_WIDGETS = (
    widgets.SelectWidget,
    widgets.MultiSelectWidget,
    widgets.ToggleGroupWidget,
    widgets.RadioButtonWidget,
)

# The media library's model contract, as documented: the fields the
# library's views rely on (tags stays optional).
MEDIA_MODEL_FIELDS = ("file", "name", "type")
MEDIA_FOLDER_MODEL_FIELDS = ("name", "parent")


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

        for entry in resolve_table_display(owner):
            if isinstance(entry, str):
                column = TableColumn(field=entry)
            elif isinstance(entry, TableColumn):
                column = entry
            else:
                errors.append(
                    (
                        "content_studio.E006",
                        f"{config_name(owner)}.table_display entries must be "
                        f"field names or TableColumn objects; got {entry!r}.",
                    )
                )
                continue

            if column.field in seen:
                errors.append(
                    (
                        "content_studio.E006",
                        f"{config_name(owner)}.table_display contains a "
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
                        f"{config_name(owner)}.table_display column "
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
                        f"{config_name(owner)}.table_display column "
                        f"{column.field!r} has format {column.format!r}; formats "
                        "must be content_studio.formats classes.",
                    )
                )

    model = getattr(studio, "model", None)
    validate(studio, model)

    for inline in getattr(studio, "inlines", None) or []:
        validate(inline, getattr(inline, "model", None))

    return errors


def ignored_edit_field_names(model) -> set[str]:
    """
    Model field names the edit form never has to carry: the
    created/edited stamps from the settings, the tenant relation (set
    from the tenant header) and the user model's password, which the
    API leaves out entirely.
    """
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

    return ignored


def is_required_model_field(field) -> bool:
    """
    Whether the API would reject a save without the field, mirroring
    the serializer: editable, not nullable, not blank and without a
    default.
    """
    return (
        field.editable
        and not field.auto_created
        and not field.blank
        and not field.null
        and not field.has_default()
    )


def edit_field_warnings(studio) -> list[tuple[str, str]]:
    """
    Required model fields missing from the edit form, as (check id,
    message) pairs.

    An unset edit_main falls back to every editable field, so only
    explicit configurations are at risk; required fields dropped
    through exclude are reported all the same.
    """
    model = getattr(studio, "model", None)

    if model is None:
        return []

    form_fields = edit_form_field_names(studio)
    ignored = ignored_edit_field_names(model)

    warnings = []

    for field in model._meta.get_fields():
        if (
            not is_required_model_field(field)
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
    Misconfigured list pages, as (check id, message) pairs. list_display
    is the Django admin's name for the table columns; a mapping there is
    the list view's role mapping, which lives in list_item_display, and
    must not be silently ignored.
    """
    errors = []

    if isinstance(studio.list_display, dict):
        errors.append(
            (
                "content_studio.E001",
                f"{studio.__class__.__name__}.list_display is a mapping. "
                "The list view's role mapping is configured with "
                "list_item_display; list_display, like table_display, "
                "configures the table columns.",
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


def soft_delete_errors(studio) -> list[tuple[str, str]]:
    """
    A misconfigured soft_delete, as (check id, message) pairs. The
    configured field must exist and be a nullable date or datetime
    field: the trash stamps it and the lists filter on it being empty.
    """
    errors = []

    if not studio.soft_delete:
        return errors

    try:
        field = studio.model._meta.get_field(studio.soft_delete)
    except FieldDoesNotExist:
        errors.append(
            (
                "content_studio.E008",
                f"{studio.__class__.__name__}.soft_delete refers to the "
                f"unknown field '{studio.soft_delete}'.",
            )
        )
        return errors

    if not isinstance(field, models.DateField) or not field.null:
        errors.append(
            (
                "content_studio.E008",
                f"{studio.__class__.__name__}.soft_delete must name a "
                "nullable date or datetime field; "
                f"'{studio.soft_delete}' is not.",
            )
        )

    return errors


def media_upload_errors() -> list[tuple[str, str]]:
    """
    Malformed media library upload settings, as (check id, message)
    pairs: the allowed extensions must be a list of strings without a
    leading dot, the maximum size a positive number of bytes.
    """
    errors = []
    extensions = cs_settings.MEDIA_LIBRARY_ALLOWED_EXTENSIONS
    max_size = cs_settings.MEDIA_LIBRARY_MAX_UPLOAD_SIZE

    if extensions is not None and (
        isinstance(extensions, str)
        or not isinstance(extensions, (list, tuple, set))
        or not all(
            isinstance(e, str) and e and not e.startswith(".") for e in extensions
        )
    ):
        errors.append(
            (
                "content_studio.E014",
                "MEDIA_LIBRARY_ALLOWED_EXTENSIONS must be None or a list of "
                "file extensions without the leading dot, like ['jpg', 'pdf'].",
            )
        )

    if max_size is not None and (
        isinstance(max_size, bool) or not isinstance(max_size, int) or max_size <= 0
    ):
        errors.append(
            (
                "content_studio.E014",
                "MEDIA_LIBRARY_MAX_UPLOAD_SIZE must be None or a positive "
                "number of bytes.",
            )
        )

    return errors


def focal_point_errors() -> list[tuple[str, str]]:
    """
    A misconfigured FOCAL_POINT_ATTR, as (check id, message) pairs.
    The attribute must exist on the media item model and be a JSONField:
    the frontend stores the focal point in it as {"x": 0-100, "y": 0-100}.
    """
    errors = []

    attr = cs_settings.FOCAL_POINT_ATTR

    if not attr:
        return errors

    media_model = cs_settings.MEDIA_LIBRARY_MODEL

    if not media_model:
        errors.append(
            (
                "content_studio.E009",
                "FOCAL_POINT_ATTR is set but MEDIA_LIBRARY_MODEL is not; "
                "the focal point attribute needs a media item model.",
            )
        )
        return errors

    try:
        field = media_model._meta.get_field(attr)
    except FieldDoesNotExist:
        errors.append(
            (
                "content_studio.E009",
                f"FOCAL_POINT_ATTR refers to the unknown field '{attr}' on "
                f"{media_model._meta.label_lower}.",
            )
        )
        return errors

    if not isinstance(field, models.JSONField):
        errors.append(
            (
                "content_studio.E009",
                f"FOCAL_POINT_ATTR must name a JSONField; '{attr}' on "
                f"{media_model._meta.label_lower} is not.",
            )
        )

    return errors


def model_field_names(model) -> set[str]:
    """
    The model's own field names, mirroring what the frontend receives:
    concrete fields and many-to-many relations.
    """
    return {field.name for field in model._meta.fields} | {
        field.name for field in model._meta.many_to_many
    }


def iter_edit_fields(studio):
    """
    Yield the Field objects declared in a model studio's edit_main and
    edit_sidebar, across form sets, groups and layouts.
    """
    all_fields = list(getattr(studio, "edit_main", None) or []) + list(
        getattr(studio, "edit_sidebar", None) or []
    )

    flat_fields = flatten(
        [
            field.get_fields() if hasattr(field, "get_fields") else [field]
            for field in all_fields
        ]
    )

    for field in flat_fields:
        if isinstance(field, Field):
            yield field


def resolvable_name(model, name: str) -> bool:
    """
    Whether a lookup name (possibly traversing relations, like
    'author__name') starts at a model field; 'pk' resolves as Django's
    alias for the primary key.
    """
    try:
        model._meta.get_field(name.split("__")[0])
        return True
    except FieldDoesNotExist:
        return name.split("__")[0] == "pk"


def edit_form_config_errors(studio) -> list[tuple[str, str]]:
    """
    Unresolvable edit form configuration, as (check id, message)
    pairs. A Field naming anything but a model field renders as an
    empty read-only box in the editor — a typo that never surfaces at
    runtime. Widget overrides must be content_studio.widgets classes;
    anything else falls back to the frontend's fallback widget
    silently.
    """
    model = getattr(studio, "model", None)

    if model is None:
        return []

    errors = []
    field_names = model_field_names(model)

    for field in iter_edit_fields(studio):
        if field.name not in field_names:
            errors.append(
                (
                    "content_studio.E010",
                    f"{studio.__class__.__name__}: edit field {field.name!r} "
                    f"does not exist on {model._meta.label_lower}.",
                )
            )

        if field.widget is not None and not (
            isinstance(field.widget, type)
            and issubclass(field.widget, widgets.BaseWidget)
        ):
            errors.append(
                (
                    "content_studio.E010",
                    f"{studio.__class__.__name__}: edit field {field.name!r} "
                    f"has widget {field.widget!r}; widgets must be "
                    "content_studio.widgets classes.",
                )
            )

    return errors


def list_query_errors(studio) -> list[tuple[str, str]]:
    """
    Unresolvable list page configuration, as (check id, message)
    pairs. search_fields and ordering entries that do not start at a
    model field fail the list endpoint with a database FieldError;
    list_filter entries fail every filter with a ParseError; and
    list_item_display values that resolve to neither a field nor a model
    method fail every list-view item with an AttributeError.
    """
    errors = []

    def validate(owner, model):
        if model is None:
            return

        for entry in getattr(owner, "search_fields", None) or []:
            if not resolvable_name(model, entry):
                errors.append(
                    (
                        "content_studio.E011",
                        f"{config_name(owner)}.search_fields contains "
                        f"{entry!r}, which does not resolve to a field on "
                        f"{model._meta.label_lower}.",
                    )
                )

        for entry in getattr(owner, "ordering", None) or []:
            name = entry[1:] if entry.startswith("-") else entry

            if name == "?" or resolvable_name(model, name):
                continue

            errors.append(
                (
                    "content_studio.E011",
                    f"{config_name(owner)}.ordering contains "
                    f"{entry!r}, which does not resolve to a field on "
                    f"{model._meta.label_lower}.",
                )
            )

        for entry in getattr(owner, "list_filter", None) or []:
            if isinstance(entry, str) and not resolvable_name(model, entry):
                errors.append(
                    (
                        "content_studio.E011",
                        f"{config_name(owner)}.list_filter contains "
                        f"{entry!r}, which does not resolve to a field on "
                        f"{model._meta.label_lower}.",
                    )
                )

        field_names = model_field_names(model)
        display = getattr(owner, "list_item_display", None) or {}

        # A non-mapping here is never a role mapping to validate.
        if isinstance(display, dict):
            for role, value in display.items():
                if value not in field_names and not hasattr(model, value):
                    errors.append(
                        (
                            "content_studio.E011",
                            f"{config_name(owner)}.list_item_display maps "
                            f"{role!r} to {value!r}, which is neither a field "
                            f"nor a method on {model._meta.label_lower}.",
                        )
                    )

    model = getattr(studio, "model", None)
    validate(studio, model)

    for inline in getattr(studio, "inlines", None) or []:
        validate(inline, getattr(inline, "model", None))

    return errors


def inline_fk_errors(studio) -> list[tuple[str, str]]:
    """
    A misconfigured inline fk_name, as (check id, message) pairs. The
    name must exist on the inline's model and be a foreign key to the
    parent; anything else fails every inline list with a database
    FieldError. An unset fk_name is auto-detected and already fails
    loudly at startup.
    """
    errors = []
    model = getattr(studio, "model", None)

    if model is None:
        return errors

    for inline in getattr(studio, "inlines", None) or []:
        fk_name = getattr(inline, "fk_name", None)

        if not fk_name:
            continue

        try:
            field = inline.model._meta.get_field(fk_name)
        except FieldDoesNotExist:
            errors.append(
                (
                    "content_studio.E012",
                    f"{inline.__name__}.fk_name refers to the "
                    f"unknown field {fk_name!r} on "
                    f"{inline.model._meta.label_lower}.",
                )
            )
            continue

        if not field.many_to_one or field.remote_field.model is not model:
            errors.append(
                (
                    "content_studio.E012",
                    f"{inline.__name__}.fk_name must name a "
                    f"foreign key to {model._meta.label_lower}; "
                    f"{fk_name!r} on {inline.model._meta.label_lower} "
                    "is not.",
                )
            )

    return errors


def mapping_errors(site) -> list[tuple[str, str]]:
    """
    Widget and format mapping values that are not widget or format
    classes, as (check id, message) pairs. Both mappings are
    serialized to the frontend by name; anything else fails the info
    endpoint or renders nothing at all.
    """
    errors = []

    for key, widget in (getattr(site, "default_widget_mapping", None) or {}).items():
        if not (isinstance(widget, type) and issubclass(widget, widgets.BaseWidget)):
            errors.append(
                (
                    "content_studio.E013",
                    f"default_widget_mapping[{key!r}] must map to a "
                    "content_studio.widgets class.",
                )
            )

    for key, frmt in (getattr(site, "default_format_mapping", None) or {}).items():
        if not (isinstance(frmt, type) and issubclass(frmt, formats.BaseFormat)):
            errors.append(
                (
                    "content_studio.E013",
                    f"default_format_mapping[{key!r}] must map to a "
                    "content_studio.formats class.",
                )
            )

    return errors


def readonly_required_warnings(studio) -> list[tuple[str, str]]:
    """
    Required model fields configured readonly in the edit form, as
    (check id, message) pairs. The value can never be provided, so
    every save fails validation — the same failure W001 reports for
    fields left out entirely.
    """
    model = getattr(studio, "model", None)

    if model is None:
        return []

    ignored = ignored_edit_field_names(model)
    required = {
        field.name
        for field in model._meta.get_fields()
        if is_required_model_field(field) and field.name not in ignored
    }

    warnings = []

    for field in iter_edit_fields(studio):
        if field.readonly and field.name in required:
            warnings.append(
                (
                    "content_studio.W002",
                    f"{studio.__class__.__name__}: the required field "
                    f"{field.name!r} is configured readonly in the edit "
                    "form, so saving objects will fail validation. Make the "
                    "field editable in the form, or give the model field a "
                    "default, make it nullable or blank.",
                )
            )

    return warnings


def choice_widget_warnings(studio) -> list[tuple[str, str]]:
    """
    Choice-driven widgets on fields without choices, as (check id,
    message) pairs. Selects and toggle groups render their options
    from the field's choices; without any, they render empty.
    """
    model = getattr(studio, "model", None)

    if model is None:
        return []

    fields = {field.name: field for field in model._meta.get_fields()}
    warnings = []

    def is_choice_widget(widget) -> bool:
        return isinstance(widget, type) and issubclass(widget, CHOICE_WIDGETS)

    for field in iter_edit_fields(studio):
        model_field = fields.get(field.name)

        if model_field is None:
            continue

        # The widget override, or a widget_class set on the model field.
        widget = field.widget or getattr(model_field, "widget_class", None)

        if is_choice_widget(widget) and not getattr(model_field, "choices", None):
            warnings.append(
                (
                    "content_studio.W003",
                    f"{studio.__class__.__name__}: the widget "
                    f"{widget.__name__} on {field.name!r} renders choices, "
                    f"but the field on {model._meta.label_lower} has none.",
                )
            )

    return warnings


def sortable_by_warnings(studio) -> list[tuple[str, str]]:
    """
    sortable_by entries that are not table columns, as (check id,
    message) pairs. The sort UI attaches to the table's headers, so a
    name without a column is silently dead configuration.
    """
    sortable_by = getattr(studio, "sortable_by", None)

    if not sortable_by:
        return []

    columns = {column.field for column in get_table_display_columns(studio)}
    warnings = []

    for name in sortable_by:
        if name not in columns:
            warnings.append(
                (
                    "content_studio.W004",
                    f"{studio.__class__.__name__}.sortable_by contains "
                    f"{name!r}, which is not a column in table_display; "
                    "the sort UI only attaches to table columns.",
                )
            )

    return warnings


def list_filter_entry_warnings(studio) -> list[tuple[str, str]]:
    """
    Non-string list_filter entries, as (check id, message) pairs.
    Only field-name strings count as filterable fields; filter classes
    and (field, class) tuples are silently ignored.
    """
    warnings = []

    for entry in getattr(studio, "list_filter", None) or []:
        if not isinstance(entry, str):
            warnings.append(
                (
                    "content_studio.W005",
                    f"{studio.__class__.__name__}.list_filter contains "
                    f"{entry!r}, which is not a field name string and is "
                    "ignored; only field-name strings are filterable.",
                )
            )

    return warnings


def list_display_warnings(studio) -> list[tuple[str, str]]:
    """
    Django admin naming on a studio, as (check id, message) pairs.
    list_display works as an alias of table_display but should be
    renamed; get_list_display is no longer called since the list view
    hook is get_list_item_display.
    """
    warnings = []

    for owner in [studio, *(getattr(studio, "inlines", None) or [])]:
        if isinstance(getattr(owner, "list_display", None), (list, tuple)):
            if declares(owner, "table_display"):
                message = (
                    f"{config_name(owner)}.list_display is ignored because "
                    "table_display is set; remove list_display."
                )
            else:
                message = (
                    f"{config_name(owner)}.list_display is the Django "
                    "admin's name for the table columns; rename it to "
                    "table_display."
                )

            warnings.append(("content_studio.W010", message))

    if declares(studio, "get_list_display"):
        warnings.append(
            (
                "content_studio.W011",
                f"{studio.__class__.__name__}.get_list_display is not "
                "called; the list view's hook is get_list_item_display.",
            )
        )

    return warnings


BUILT_IN_WIDGET_TYPES = {
    "ActivityLogWidget",
    "ContentListWidget",
    "ScheduledTasksWidget",
    "SpacingWidget",
    "StatisticWidget",
}


def dashboard_widget_warnings(site) -> list[tuple[str, str]]:
    """
    Dashboard widgets the admin cannot show, as (check id, message)
    pairs: only the built-in widget types have a display, so a widget
    that does not subclass one of them shows nothing.
    """
    dashboard = getattr(site, "dashboard", None)
    warnings = []

    for widget in getattr(dashboard, "widgets", None) or []:
        if getattr(widget, "widget_type", None) not in BUILT_IN_WIDGET_TYPES:
            warnings.append(
                (
                    "content_studio.W012",
                    f"The dashboard widget {widget.__class__.__name__} is not "
                    "a built-in widget type and is not shown; subclass one of "
                    "the built-in widgets, such as StatisticWidget.",
                )
            )

    return warnings


def model_group_warnings(site) -> list[tuple[str, str]]:
    """
    Model groups listing unregistered models, as (check id, message)
    pairs. The model groups drive the menu; an unregistered model
    renders a dead entry.
    """
    warnings = []

    for group in getattr(site, "model_groups", None) or []:
        for model in group.models:
            if not site.is_registered(model):
                warnings.append(
                    (
                        "content_studio.W006",
                        f"The model group {group.name!r} lists "
                        f"{model._meta.label_lower}, which is not "
                        "registered with the site; register it or remove it "
                        "from the group.",
                    )
                )

    return warnings


def media_library_warnings() -> list[tuple[str, str]]:
    """
    Media library models missing the documented contract fields, as
    (check id, message) pairs. Uploads, previews, search and folders
    rely on them; tags stays optional.
    """
    warnings = []

    def missing_fields(model, names):
        field_names = {field.name for field in model._meta.get_fields()}

        return [name for name in names if name not in field_names]

    media_model = cs_settings.MEDIA_LIBRARY_MODEL

    if media_model:
        missing = missing_fields(media_model, MEDIA_MODEL_FIELDS)

        if missing:
            warnings.append(
                (
                    "content_studio.W007",
                    f"The media library model {media_model._meta.label_lower} "
                    f"misses the field(s) {', '.join(missing)}; the library "
                    "expects file, name and type fields.",
                )
            )

    folder_model = cs_settings.MEDIA_LIBRARY_FOLDER_MODEL

    if folder_model:
        missing = missing_fields(folder_model, MEDIA_FOLDER_MODEL_FIELDS)

        if missing:
            warnings.append(
                (
                    "content_studio.W007",
                    f"The media folder model {folder_model._meta.label_lower} "
                    f"misses the field(s) {', '.join(missing)}; the library "
                    "expects name and parent fields.",
                )
            )

    return warnings


def crop_hook_warnings() -> list[tuple[str, str]]:
    """
    A crop_image hook without a media library, as (check id, message)
    pairs. The hook can only run against media items; without a media
    model it is dead code.
    """
    site = cs_settings.ADMIN_SITE

    if (
        callable(getattr(site, "crop_image", None))
        and not cs_settings.MEDIA_LIBRARY_MODEL
    ):
        return [
            (
                "content_studio.W008",
                "The admin site defines crop_image, but MEDIA_LIBRARY_MODEL "
                "is not configured; the hook is never called.",
            )
        ]

    return []


def login_backend_warnings() -> list[tuple[str, str]]:
    """
    An empty LOGIN_BACKENDS setting, as (check id, message) pairs.
    Without a login backend, nobody can sign in to the studio.
    """
    if not cs_settings.LOGIN_BACKENDS:
        return [
            (
                "content_studio.W009",
                "LOGIN_BACKENDS is empty; no login backend is configured, "
                "so nobody can sign in to Content Studio.",
            )
        ]

    return []


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

        for check_id, error in soft_delete_errors(studio):
            messages.append(checks.Error(error, obj=obj, id=check_id))

        for check_id, error in edit_form_config_errors(studio):
            messages.append(checks.Error(error, obj=obj, id=check_id))

        for check_id, error in list_query_errors(studio):
            messages.append(checks.Error(error, obj=obj, id=check_id))

        for check_id, error in inline_fk_errors(studio):
            messages.append(checks.Error(error, obj=obj, id=check_id))

        for check_id, warning in edit_field_warnings(studio):
            messages.append(checks.Warning(warning, obj=obj, id=check_id))

        for check_id, warning in readonly_required_warnings(studio):
            messages.append(checks.Warning(warning, obj=obj, id=check_id))

        for check_id, warning in choice_widget_warnings(studio):
            messages.append(checks.Warning(warning, obj=obj, id=check_id))

        for check_id, warning in sortable_by_warnings(studio):
            messages.append(checks.Warning(warning, obj=obj, id=check_id))

        for check_id, warning in list_filter_entry_warnings(studio):
            messages.append(checks.Warning(warning, obj=obj, id=check_id))

        for check_id, warning in list_display_warnings(studio):
            messages.append(checks.Warning(warning, obj=obj, id=check_id))

    for check_id, error in duplicate_id_errors(site):
        messages.append(checks.Error(error, obj=site.__class__.__name__, id=check_id))

    for check_id, error in mapping_errors(site):
        messages.append(checks.Error(error, obj=site.__class__.__name__, id=check_id))

    for check_id, error in focal_point_errors():
        messages.append(checks.Error(error, obj=site.__class__.__name__, id=check_id))

    for check_id, error in media_upload_errors():
        messages.append(checks.Error(error, obj=site.__class__.__name__, id=check_id))

    for check_id, warning in dashboard_widget_warnings(site):
        messages.append(
            checks.Warning(warning, obj=site.__class__.__name__, id=check_id)
        )

    for check_id, warning in model_group_warnings(site):
        messages.append(
            checks.Warning(warning, obj=site.__class__.__name__, id=check_id)
        )

    for check_id, warning in media_library_warnings():
        messages.append(
            checks.Warning(warning, obj=site.__class__.__name__, id=check_id)
        )

    for check_id, warning in crop_hook_warnings():
        messages.append(
            checks.Warning(warning, obj=site.__class__.__name__, id=check_id)
        )

    for check_id, warning in login_backend_warnings():
        messages.append(
            checks.Warning(warning, obj=site.__class__.__name__, id=check_id)
        )

    return messages
