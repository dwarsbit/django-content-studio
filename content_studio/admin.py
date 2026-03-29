import uuid
from typing import Type, TypeVar, Generic, Any, Optional, Union

from blueprint import fields as bp_fields
from blueprint.media_library.fields import MediaField, ManyMediaField
from django.contrib import admin
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
        # Blueprint fields
        bp_fields.HTMLField: widgets.RichTextWidget,
        bp_fields.TagField: widgets.TagWidget,
        bp_fields.FlexField: widgets.JSONSchemaWidget,
        bp_fields.MultipleChoiceField: widgets.MultiSelectWidget,
        bp_fields.URLPathField: widgets.URLPathWidget,
        MediaField: widgets.MediaWidget,
        ManyMediaField: widgets.ManyMediaWidget,
        # Common third-party fields
        "AutoSlugField": widgets.SlugWidget,
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
        # Blueprint fields
        bp_fields.HTMLField: formats.HtmlFormat,
        bp_fields.TagField: formats.TagFormat,
        bp_fields.FlexField: formats.JSONFormat,
        bp_fields.MultipleChoiceField: formats.TextFormat,
        bp_fields.URLPathField: formats.TextFormat,
        MediaField: formats.MediaFormat,
        ManyMediaField: formats.ManyMediaFormat,
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

    def get_thumbnail(self, obj) -> str:
        """
        Method for getting and manipulating the image path (or URL).
        By default, this returns the image path as is.
        """
        return obj.file.url

    def get_tenants(
        self, tenant_model: Type[models.Model], **kwargs
    ) -> models.QuerySet:
        """
        Method for getting the list of available tenants.
        """
        return tenant_model.objects.all()


admin_site = AdminSite()


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

    # Configure the main section in the edit-view.
    edit_main: Union[
        list[Union[FormSetGroup, FormSet, Field, Component, str]], list[str]
    ] = []

    # Configure the sidebar in the edit-view.
    edit_sidebar: Union[list[Union[FormSet, Field, Component, str]], list[str]] = []

    # The icon for this model will be shown in the menu and some other places.
    icon: Optional[str] = None

    def has_add_permission(self, request: HttpRequest) -> bool:
        is_singleton = getattr(self.model, "is_singleton", False)

        # Don't allow to add more than one singleton object.
        if is_singleton and self.model.objects.get():
            return False

        return super().has_add_permission(request)

    def has_delete_permission(
        self, request: HttpRequest, obj: Optional[T] = None
    ) -> bool:
        is_singleton = getattr(self.model, "is_singleton", False)

        if is_singleton:
            return False

        return super().has_delete_permission(request, obj)

    def get_component(self, component_id: uuid.UUID) -> Optional[Component]:
        """
        Retrieves a component from the edit_main or edit_sidebar attributes by ID.
        :param component_id:
        :return:
        """
        all_fields = getattr(self, "edit_main", []) + getattr(self, "edit_sidebar", [])

        flat_fields = flatten(
            [f.get_fields() if hasattr(f, "get_fields") else [f] for f in all_fields]
        )

        components = [c for c in flat_fields if issubclass(c.__class__, Component)]

        for component in components:
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
            "is_singleton": getattr(admin_class, "is_singleton", False),
            "edit": {
                "main": self.serialize_edit_main(request),
                "sidebar": self.serialize_edit_sidebar(request),
                "inlines": [
                    {
                        "model": inline.model._meta.label_lower,
                        "fk_name": get_related_field_name(inline, admin_class.model),
                        "list_display": getattr(inline, "list_display", None)
                        or ["__str__"],
                    }
                    for inline in admin_class.inlines
                ],
            },
            "list": {
                "per_page": admin_class.list_per_page,
                "description": getattr(admin_class, "list_description", ""),
                "display": self.get_list_display(),
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

        return [
            i.serialize()
            for i in self.get_edit_main(
                getattr(admin_class, "edit_main", admin_class.get_fields(request))
            )
        ]

    def serialize_edit_sidebar(self, request: HttpRequest) -> list[dict[str, Any]]:
        admin_class = self.admin_class

        return [
            i.serialize()
            for i in self.get_edit_sidebar(getattr(admin_class, "edit_sidebar", None))
        ]

    def get_list_display(self) -> list[dict[str, Any]]:
        admin_class = self.admin_class
        fields = []

        for field in admin_class.list_display:
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
