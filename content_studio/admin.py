import uuid
from typing import Type, TypeVar, Generic, Any, Optional, Union

from django.contrib import admin
from django.core.exceptions import ImproperlyConfigured
from django.db import models
from django.db.models import Model
from rest_framework.request import HttpRequest

from . import widgets, formats
from .form import FormSet, FormSetGroup, Field, Component
from .login_backends import LoginBackendManager
from .token_backends import TokenBackendManager
from .utils import get_related_field_name, flatten

register = admin.register
display = admin.display

# Django Blueprint is an optional integration: when it is installed, its
# fields get their dedicated widgets and formats. Without it, Content
# Studio works with plain Django fields only.
try:
    from blueprint import fields as bp_fields
    from blueprint.media_library.fields import MediaField, ManyMediaField

    blueprint_available = True

    _blueprint_widget_mapping = {
        bp_fields.HTMLField: widgets.RichTextWidget,
        bp_fields.TagField: widgets.TagWidget,
        bp_fields.FlexField: widgets.JSONSchemaWidget,
        bp_fields.MultipleChoiceField: widgets.MultiSelectWidget,
        bp_fields.URLPathField: widgets.URLPathWidget,
        MediaField: widgets.MediaWidget,
        ManyMediaField: widgets.ManyMediaWidget,
    }

    _blueprint_format_mapping = {
        bp_fields.HTMLField: formats.HtmlFormat,
        bp_fields.TagField: formats.TagFormat,
        bp_fields.FlexField: formats.JSONFormat,
        bp_fields.MultipleChoiceField: formats.TextFormat,
        bp_fields.URLPathField: formats.TextFormat,
        MediaField: formats.MediaFormat,
        ManyMediaField: formats.ManyMediaFormat,
    }
except ImportError:
    blueprint_available = False

    _blueprint_widget_mapping = {}
    _blueprint_format_mapping = {}


class StackedInline(admin.StackedInline):
    pass


class TabularInline(admin.TabularInline):
    pass


class AdminSite(admin.AdminSite):
    """
    Enhanced admin site for Django Content Studio.
    """

    token_backend: TokenBackendManager = TokenBackendManager()

    login_backend: LoginBackendManager = LoginBackendManager()

    dashboard: Any = None

    model_groups: Optional[list["ModelGroup"]] = None

    extensions: Optional[list[Any]] = None

    default_widget_mapping: dict[
        Union[Type[models.Field], str], Type[widgets.BaseWidget]
    ] = {
        models.CharField: widgets.InputWidget,
        models.IntegerField: widgets.InputWidget,
        models.SmallIntegerField: widgets.InputWidget,
        models.BigIntegerField: widgets.InputWidget,
        models.PositiveIntegerField: widgets.InputWidget,
        models.PositiveSmallIntegerField: widgets.InputWidget,
        models.PositiveBigIntegerField: widgets.InputWidget,
        models.FloatField: widgets.InputWidget,
        models.DecimalField: widgets.InputWidget,
        models.SlugField: widgets.SlugWidget,
        models.TextField: widgets.TextAreaWidget,
        models.BooleanField: widgets.CheckboxWidget,
        models.NullBooleanField: widgets.CheckboxWidget,
        models.ForeignKey: widgets.ForeignKeyWidget,
        models.ManyToManyField: widgets.ManyToManyWidget,
        models.OneToOneField: widgets.ForeignKeyWidget,
        models.DateField: widgets.DateWidget,
        models.DateTimeField: widgets.DateTimeWidget,
        models.TimeField: widgets.TimeWidget,
        models.JSONField: widgets.JSONWidget,
        # Common third-party fields
        "AutoSlugField": widgets.SlugWidget,
        # Blueprint fields (only when django-blueprint is installed)
        **_blueprint_widget_mapping,
    }

    default_format_mapping: dict[Type[models.Field], Type[formats.BaseFormat]] = {
        models.CharField: formats.TextFormat,
        models.IntegerField: formats.NumberFormat,
        models.SmallIntegerField: formats.NumberFormat,
        models.BigIntegerField: formats.NumberFormat,
        models.PositiveIntegerField: formats.NumberFormat,
        models.PositiveSmallIntegerField: formats.NumberFormat,
        models.PositiveBigIntegerField: formats.NumberFormat,
        models.FloatField: formats.NumberFormat,
        models.DecimalField: formats.NumberFormat,
        models.SlugField: formats.TextFormat,
        models.TextField: formats.TextFormat,
        models.BooleanField: formats.BooleanFormat,
        models.NullBooleanField: formats.BooleanFormat,
        models.DateField: formats.DateFormat,
        models.DateTimeField: formats.DateTimeFormat,
        models.TimeField: formats.TimeFormat,
        models.ForeignKey: formats.ForeignKeyFormat,
        models.OneToOneField: formats.ForeignKeyFormat,
        models.JSONField: formats.JSONFormat,
        # Blueprint fields (only when django-blueprint is installed)
        **_blueprint_format_mapping,
    }

    def setup(self):
        # Add token backend's view set to the
        # Content Studio router.
        self.token_backend.set_up_router()
        # Add login backend's view set to the
        # Content Studio router.
        self.login_backend.set_up_router()
        # Add dashboard's view set to the
        # Content Studio router.
        if self.dashboard:
            self.dashboard.set_up_router()

        self._validate_config_ids()

    def _validate_config_ids(self):
        """
        Fail fast at setup when extension, dashboard widget or component
        IDs collide. IDs are derived from the class and its label/url/
        name by default, so duplicates mean an explicit ID is needed.
        """
        errors = []

        seen = {}
        for extension in getattr(self, "extensions", None) or []:
            key = str(extension.extension_id)
            if key in seen:
                errors.append(
                    f"Duplicate extension ID {key}: "
                    f"{seen[key]} and {extension.__class__.__name__}. "
                    "Pass extension_id to disambiguate."
                )
            seen[key] = extension.__class__.__name__

        if self.dashboard:
            seen = {}
            for widget in self.dashboard.widgets or []:
                key = str(widget.widget_id)
                if key in seen:
                    errors.append(
                        f"Duplicate dashboard widget ID {key}: "
                        f"{seen[key]} and {widget.__class__.__name__}. "
                        "Pass widget_id to disambiguate."
                    )
                seen[key] = widget.__class__.__name__

        seen = {}
        for model, admin_class in admin.site._registry.items():
            for component in iter_components(admin_class):
                key = str(component.component_id)
                if key in seen:
                    errors.append(
                        f"Duplicate component ID {key}: "
                        f"{seen[key]} and {component.__class__.__name__} "
                        f"in {admin_class.__class__.__name__}. "
                        "Pass component_id to disambiguate."
                    )
                seen[key] = component.__class__.__name__

            if isinstance(admin_class, ModelAdmin):
                errors.extend(_validate_list_config(admin_class))

        if errors:
            raise ImproperlyConfigured("\n".join(errors))

    def get_thumbnail(self, obj) -> str:
        """
        Method for getting and manipulating the image path (or URL).
        By default, this returns the image path as is.
        """
        return obj.file.url

    def get_media_serializer_fields(self, media_model):
        """
        Controls which fields the media library serializer exposes for
        the given media model. Defaults to "__all__"; override to
        restrict custom media models that carry sensitive fields.
        """
        return "__all__"

    def get_tenants(
        self, tenant_model: Type[models.Model], **kwargs
    ) -> models.QuerySet:
        """
        Method for getting the list of available tenants.
        """
        return tenant_model.objects.all()


admin_site = AdminSite()


LIST_VIEW_NAMES = {"table", "list"}


def _validate_list_config(admin_class: "ModelAdmin") -> list[str]:
    """
    Fail fast at setup on misconfigured list pages. Content Studio
    repurposes list_display for the list view, so an old-style list/tuple
    (the classic admin's table columns) must be pointed at table_display
    rather than silently ignored.
    """
    if isinstance(admin_class.list_display, (list, tuple)):
        return [
            f"{admin_class.__class__.__name__}.list_display configures the "
            "list view and takes a mapping like "
            "{'title': 'name', 'description': 'subtitle'}. For table "
            "columns, use table_display."
        ]

    unknown_views = [
        view for view in admin_class.list_views if view not in LIST_VIEW_NAMES
    ]

    if unknown_views:
        return [
            f"{admin_class.__class__.__name__}.list_views contains unknown "
            f"view(s) {', '.join(unknown_views)}. Available views: "
            f"{', '.join(sorted(LIST_VIEW_NAMES))}."
        ]

    return []


def iter_components(admin_class):
    """
    Yield the components configured in a model admin's edit_main and
    edit_sidebar.
    """
    all_fields = getattr(admin_class, "edit_main", []) + getattr(
        admin_class, "edit_sidebar", []
    )

    flat_fields = flatten(
        [f.get_fields() if hasattr(f, "get_fields") else [f] for f in all_fields]
    )

    for field in flat_fields:
        if issubclass(field.__class__, Component):
            yield field


def get_is_singleton(admin_class) -> bool:
    """
    Return the effective singleton state of a model admin.

    The admin's is_singleton attribute is the canonical declaration.
    A model-level marker (e.g. a class property like Blueprint's
    SingletonModel.is_singleton) is honored as a fallback for backward
    compatibility; concrete fields named is_singleton are ignored, since
    a field descriptor is truthy off the model class.
    """
    if getattr(admin_class, "is_singleton", False):
        return True

    model = admin_class.model

    if any(field.name == "is_singleton" for field in model._meta.get_fields()):
        return False

    return bool(getattr(model, "is_singleton", False))


def get_relation_display_for(
    model: Type[models.Model], obj: models.Model, request: HttpRequest
) -> "RelationDisplay":
    """
    Resolve the relation display for an object through its model's
    Content Studio admin. Models registered with a plain Django admin (e.g.
    django.contrib.auth's User) fall back to the string representation.
    """
    related_admin = admin.site._registry.get(model)

    if isinstance(related_admin, ModelAdmin):
        return related_admin.get_relation_display(obj, request)

    return RelationDisplay(title=str(obj))


T = TypeVar("T", bound=Model)


class ModelAdmin(admin.ModelAdmin, Generic[T]):
    """
    Enhanced model admin for Django Content Studio and integration with
    Django Content Framework. Although it's relatively backwards compatible,
    some default behavior has been changed.
    """

    model: Type[T]

    # Whether the model is a singleton and should not show
    # the list view.
    is_singleton: bool = False

    # Override the widget used for certain fields by adding
    # a map of field to widget. Fields that are not included
    # will fall back to their default widget.
    #
    # @example
    # widget_mapping = {'is_published': widgets.SwitchWidget}
    widget_mapping: Optional[dict[str, Type[widgets.BaseWidget]]] = None

    # Override the format used for certain fields by adding
    # a map of field to format. Fields that are not included
    # will fall back to their default format.
    #
    # @example
    # format_mapping = {'file_size': widgets.FileSizeWidget}
    format_mapping: Optional[dict[str, Type[formats.BaseFormat]]] = None

    # We set a lower limit than Django's default of 100
    list_per_page: int = 20

    # Description shown below model name on list pages
    list_description: str = ""

    # The columns of the table view. This replaces Django admin's
    # list_display, which Content Studio repurposes for the list view.
    table_display: list[str] = ["__str__"]

    # The anatomy of a list view row: roles mapped to field or model
    # method names, e.g. {"title": "name", "description": "subtitle"}.
    # Unlike the classic admin, list_display configures the list view —
    # an old-style list/tuple raises ImproperlyConfigured at setup.
    list_display: Optional[dict[str, str]] = None

    # The views offered by the list page: "table" and/or "list". More than
    # one enables a toggle in the interface.
    list_views: list[str] = ["table"]

    # Configure the main section in the edit-view.
    edit_main: Union[
        list[Union[FormSetGroup, FormSet, Field, Component, str]], list[str]
    ] = []

    # Configure the sidebar in the edit-view.
    edit_sidebar: Union[list[Union[FormSet, Field, Component, str]], list[str]] = []

    # The icon for this model will be shown in the menu and some other places.
    icon: Optional[str] = None

    def get_relation_display(
        self, obj: models.Model, request: HttpRequest
    ) -> "RelationDisplay":
        """
        How a related object appears wherever the studio renders it: relation
        pickers, list views and selected-value badges. Override to customize;
        the base implementation displays the object's string representation.
        """
        return RelationDisplay(title=str(obj))

    def get_list_display(
        self, obj: models.Model, request: HttpRequest
    ) -> "ListDisplay":
        """
        The anatomy of a row in the list view. The base implementation
        resolves the declarative list_display mapping (roles to field or
        model method names); override for fully computed rows.
        """
        display = self.list_display or {}

        def resolve(role: str) -> str:
            field = display.get(role)

            if not field:
                return ""

            value = getattr(obj, field)

            return str(value() if callable(value) else value)

        return ListDisplay(
            title=resolve("title") or str(obj),
            description=resolve("description"),
            meta=resolve("meta"),
        )

    def check(self, **kwargs):
        """
        Content Studio renders its own interface; Django's changelist
        checks inspect list_display, which the studio repurposes for the
        list view. Run the checks with the changelist's expectation in
        place, everything else applies as usual.
        """
        original = self.list_display
        self.list_display = ("__str__",)
        try:
            return super().check(**kwargs)
        finally:
            self.list_display = original

    def has_add_permission(self, request: HttpRequest) -> bool:
        # Don't allow adding more than one singleton object.
        if get_is_singleton(self) and self.model.objects.exists():
            return False

        return super().has_add_permission(request)

    def has_delete_permission(
        self, request: HttpRequest, obj: Optional[T] = None
    ) -> bool:
        if get_is_singleton(self):
            return False

        return super().has_delete_permission(request, obj)

    def get_component(self, component_id: uuid.UUID) -> Optional[Component]:
        """
        Retrieves a component from the edit_main or edit_sidebar attributes by ID.
        :param component_id:
        :return:
        """
        for component in iter_components(self):
            if component.component_id == component_id:
                return component

        return None


class AdminSerializer:
    """
    Class for serializing Django admin classes.
    """

    def __init__(self, admin_class: ModelAdmin):
        self.admin_class = admin_class

    def serialize(self, request: HttpRequest) -> dict[str, Any]:
        admin_class = self.admin_class
        format_mapping = getattr(admin_class, "format_mapping", None) or {}
        widget_mapping = getattr(admin_class, "widget_mapping", None) or {}

        return {
            "icon": getattr(admin_class, "icon", None),
            "is_singleton": get_is_singleton(admin_class),
            "edit": {
                "main": self.serialize_edit_main(request),
                "sidebar": self.serialize_edit_sidebar(request),
                "inlines": [
                    {
                        "model": inline.model._meta.label_lower,
                        "fk_name": get_related_field_name(inline, admin_class.model),
                        "list_display": getattr(inline, "table_display", None)
                        or ["__str__"],
                    }
                    for inline in admin_class.inlines
                ],
            },
            "list": {
                "per_page": admin_class.list_per_page,
                "description": getattr(admin_class, "list_description", ""),
                "display": self.get_table_display(),
                "views": getattr(admin_class, "list_views", ["table"]),
                "search": len(admin_class.search_fields) > 0,
                "filter": admin_class.list_filter,
                "sortable_by": admin_class.sortable_by,
            },
            "widget_mapping": {
                field: widget.serialize() for field, widget in widget_mapping.items()
            },
            "format_mapping": {
                field: format.serialize() for field, format in format_mapping.items()
            },
            "permissions": {
                "add_permission": admin_class.has_add_permission(request),
                "delete_permission": admin_class.has_delete_permission(request),
                "change_permission": admin_class.has_change_permission(request),
                "view_permission": admin_class.has_view_permission(request),
            },
        }

    def serialize_edit_main(self, request: HttpRequest) -> list[dict[str, Any]]:
        admin_class = self.admin_class

        # An unset (or empty) edit_main falls back to every editable field,
        # mirroring the Django admin's get_fields default. This also gives
        # inline models without an admin of their own a complete form.
        edit_main = getattr(admin_class, "edit_main", None) or admin_class.get_fields(
            request
        )

        return [i.serialize() for i in self.get_edit_main(edit_main)]

    def serialize_edit_sidebar(self, request: HttpRequest) -> list[dict[str, Any]]:
        admin_class = self.admin_class

        return [
            i.serialize()
            for i in self.get_edit_sidebar(getattr(admin_class, "edit_sidebar", None))
        ]

    def get_table_display(self) -> list[dict[str, Any]]:
        admin_class = self.admin_class
        fields = []

        # Plain Django admins (e.g. django.contrib.auth's) lack the
        # Content Studio attributes; fall back to their list_display.
        for field in (
            getattr(admin_class, "table_display", None)
            or getattr(admin_class, "list_display", ())
            or ["__str__"]
        ):
            if hasattr(admin_class, field):
                method = getattr(admin_class, field)
                description = getattr(method, "short_description", None)
                empty_value = getattr(method, "empty_value", None)
                fields.append(
                    {
                        "name": field,
                        "description": description,
                        "empty_value": empty_value,
                    }
                )
            else:
                fields.append({"name": field})

        return fields

    def get_edit_main(
        self,
        edit_main: Union[
            list[Union[FormSetGroup, FormSet, Field, Component, str]], list[str]
        ],
    ) -> list[FormSetGroup]:
        """
        Returns a normalized list of form set groups.

        Form sets will be wrapped in a form set group. If the edit_main attribute is a list of fields,
        they are wrapped in a form set and a form set group.
        """
        if not edit_main:
            return []
        if isinstance(edit_main[0], FormSetGroup):
            return edit_main
        if isinstance(edit_main[0], FormSet):
            return [FormSetGroup(formsets=edit_main)]

        return [FormSetGroup(formsets=[FormSet(fields=edit_main)])]

    def get_edit_sidebar(
        self,
        edit_sidebar: Optional[
            Union[list[Union[FormSet, Field, Component, str]], list[str]]
        ],
    ) -> list[FormSet]:
        """
        Returns a normalized list of form sets for the edit_sidebar.

        If the edit_sidebar attribute is a list of fields,
        they are wrapped in a form set.
        """
        if not edit_sidebar:
            return []
        if isinstance(edit_sidebar[0], FormSet):
            return edit_sidebar

        return [FormSet(fields=edit_sidebar)]


class RelationDisplay:
    """
    The display of a related object wherever it appears in the studio:
    relation pickers, list views and selected-value badges.

    Besides title, description and icon, the display can carry initials
    (shown as one character on a colored circle) and an avatar (an image
    URL). When several are set, the interface shows one glyph with the
    priority: avatar, then initials, then icon.
    """

    def __init__(
        self,
        title: str,
        description: str = "",
        icon: str = None,
        initials: str = "",
        avatar: str = None,
    ):
        self.title = title
        self.description = description
        # A CSS class, like the ModelAdmin icon.
        self.icon = icon
        self.initials = initials
        # A URL to an image.
        self.avatar = avatar


class ListDisplay:
    """
    The anatomy of a row in the list view: a prominent title, a muted
    description and a meta value rendered as a badge on the right.
    """

    def __init__(self, title: str, description: str = "", meta: str = ""):
        self.title = title
        self.description = description
        self.meta = meta


class ModelGroup:
    name: str
    label: str
    icon: Optional[str]
    color: Optional[str]
    models: list[Type[Model]]

    def __init__(
        self,
        name: str,
        label: Optional[str] = None,
        icon: Optional[str] = None,
        color: Optional[str] = None,
        models: Optional[list[Type[Model]]] = None,
    ):
        self.name = name
        self.label = label or name.capitalize()
        self.icon = icon
        self.color = color
        self.models = models or []
