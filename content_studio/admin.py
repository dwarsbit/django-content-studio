from typing import Type, TypeVar, Generic, Any, Optional, Sequence, Union

from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.db import models
from django.db.models import Model
from django.db.models.fields.files import FieldFile
from django.utils.translation import gettext_lazy as _
from rest_framework.request import HttpRequest

from . import widgets, formats, fields, blocks
from .actions import get_bulk_actions
from .exceptions import AlreadyRegistered, NotRegistered
from .export import get_export_formats, is_exportable
from .form import FormSet, FormSetGroup, Field, Component, TableColumn
from .login_backends import LoginBackendManager
from .media_library import fields as ml_fields
from .presence import is_presence_enabled
from .settings import cs_settings
from .token_backends import TokenBackendManager
from .utils import get_related_field_name, flatten

__all__ = [
    "ContentStudioSite",
    "InlineModelStudio",
    "ListItemDisplay",
    "ModelGroup",
    "ModelStudio",
    "RelationDisplay",
    "admin_site",
    "register",
]


class ModelGroup:
    """
    A group of models in the main menu: a heading with the models listed
    under it. A group starts collapsed when `collapsed` is set; the group
    holding the current model is always expanded.
    """

    name: str
    label: str
    icon: Optional[str]
    color: Optional[str]
    models: list[Type[Model]]
    collapsed: bool

    def __init__(
        self,
        name: str,
        label: Optional[str] = None,
        icon: Optional[str] = None,
        color: Optional[str] = None,
        models: Optional[list[Type[Model]]] = None,
        collapsed: bool = False,
    ):
        self.name = name
        self.label = label or name.capitalize()
        self.icon = icon
        self.color = color
        self.models = models or []
        self.collapsed = collapsed


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
        # A CSS class, like the ModelStudio icon.
        self.icon = icon
        self.initials = initials
        # A URL to an image.
        self.avatar = avatar


class ListItemDisplay:
    """
    The anatomy of an item in the list view: a prominent title, a muted
    description, a meta value rendered as a badge on the right and a
    thumbnail (an image URL) on the left.
    """

    def __init__(
        self,
        title: str,
        description: str = "",
        meta: str = "",
        thumbnail: str = "",
    ):
        self.title = title
        self.description = description
        self.meta = meta
        # A URL to an image.
        self.thumbnail = thumbnail


T = TypeVar("T", bound=Model)


class BaseStudio(Generic[T]):
    """
    Shared base of ModelStudio and InlineModelStudio: the model, the
    default edit fields and the permission hooks.

    The permission defaults check Django's model-level permissions,
    mirroring the classic admin: view or change to read, add/change/
    delete for their respective actions. All hooks take the optional
    object argument, so overriding per object is a matter of using it.
    """

    model: Type[T]

    # Fields to leave out of the default edit form.
    exclude: Optional[list[str]] = None

    # The Django admin's name for the table columns, accepted as an
    # alias of table_display (system check W010 asks for table_display).
    list_display: Optional[list[Union[str, "TableColumn"]]] = None

    # Model fields shown on the edit page but never written through it,
    # like the classic admin's readonly_fields.
    readonly_fields: list[str] = []

    # Fields filled in from other fields on the create form, like the
    # classic admin's prepopulated_fields: {"slug": ("title",)}.
    prepopulated_fields: dict[str, Sequence[str]] = {}

    # The width of the edit page and its dialogs: "default" keeps the
    # main column at a readable width, "wide" lets it fill the page for
    # wide content such as inlines with many columns.
    edit_width: str = "default"

    # Reordering, as an opt-in: the name of the field the list is
    # ordered by. Empty, the default, offers no reordering. The built-in
    # implementation rewrites a numeric field; override reorder() for
    # any other ordering implementation.
    reorder_field: str = ""

    # Fields whose values partition the order, e.g. ["book"]: objects
    # are only ordered among those sharing them. Inlines are always
    # ordered per parent.
    reorder_scope: list[str] = []

    # Components shown in the edit page's header, next to the save
    # button, such as buttons. On an inline, they show in the header of
    # the inline row's editor.
    edit_header: list[Component] = []

    def __init__(self, model: Type[T], admin_site: "ContentStudioSite"):
        self.model = model
        self.admin_site = admin_site

    def get_created_result(self, request: HttpRequest, obj: T):
        """
        What the editor sees after creating obj in the admin: None (the
        default), a message, or a ButtonResult whose value is shown once
        in a dialog with a copy button, such as a generated secret.
        """
        return None

    def get_component(self, component_id) -> Optional[Component]:
        """
        Retrieves a component from the edit_header, edit_main or
        edit_sidebar attributes by ID.
        """
        for component in iter_components(self):
            if component.component_id == component_id:
                return component

        return None

    def get_fields(self, request: HttpRequest, obj: Optional[T] = None) -> list[str]:
        """
        The fields of the default edit form: every editable field
        (including many-to-many), minus `exclude`. The additive way to
        pick fields is edit_main.
        """
        exclude = set(self.exclude or [])

        return [
            field.name
            for field in self.model._meta.get_fields()
            if field.editable and not field.auto_created and field.name not in exclude
        ]

    def get_readonly_fields(
        self, request: HttpRequest, obj: Optional[T] = None
    ) -> list[str]:
        """
        The fields that are read-only on the edit page; obj is None on
        the create form. Override to decide per request or per object,
        e.g. a slug that is fixed once the object exists.
        """
        return list(self.readonly_fields)

    def get_prepopulated_fields(
        self, request: HttpRequest, obj: Optional[T] = None
    ) -> dict[str, Sequence[str]]:
        """
        The fields the create form fills in from other fields, mapped to
        the fields they are made from. Like the classic admin, existing
        objects are never prepopulated.
        """
        return dict(self.prepopulated_fields)

    def reorder(
        self,
        request: HttpRequest,
        obj: T,
        *,
        after: Optional[T] = None,
        before: Optional[T] = None,
    ) -> Optional[bool]:
        """
        Move obj directly after `after` or directly before `before`;
        exactly one is given, and it is an object in obj's list. The
        built-in implementation rewrites the numeric reorder_field of
        the objects in between. Override to use another ordering
        implementation, e.g. django-ordered-model's obj.above(before).
        Returning False reports that nothing moved, so no change is
        logged.
        """
        from .reordering import get_scope_queryset, move

        return move(
            get_scope_queryset(self, obj),
            obj,
            self.reorder_field,
            after=after,
            before=before,
        )

    def _has_model_perm(self, request: HttpRequest, action: str) -> bool:
        opts = self.model._meta
        return request.user.has_perm(f"{opts.app_label}.{action}_{opts.model_name}")

    def has_add_permission(self, request: HttpRequest, obj: Optional[T] = None) -> bool:
        return self._has_model_perm(request, "add")

    def has_change_permission(
        self, request: HttpRequest, obj: Optional[T] = None
    ) -> bool:
        return self._has_model_perm(request, "change")

    def has_delete_permission(
        self, request: HttpRequest, obj: Optional[T] = None
    ) -> bool:
        return self._has_model_perm(request, "delete")

    def has_view_permission(
        self, request: HttpRequest, obj: Optional[T] = None
    ) -> bool:
        return self._has_model_perm(request, "view") or self._has_model_perm(
            request, "change"
        )


class ModelStudio(BaseStudio[T]):
    """
    Configuration for a model in Content Studio: how its list and edit
    pages are laid out, which fields it shows and who may do what.
    """

    model: Type[T]

    # Whether the model is a singleton and should not show
    # the list view.
    is_singleton: bool = False

    # We set a lower limit than Django's default of 100
    list_per_page: int = 20

    # Description shown below model name on list pages
    list_description: str = ""

    # The columns of the table view: field names, TableColumn objects
    # or both mixed.
    table_display: list[Union[str, "TableColumn"]] = ["__str__"]

    # The anatomy of a list view item: roles mapped to field or model
    # method names, e.g. {"title": "name", "description": "subtitle"}.
    list_item_display: Optional[dict[str, str]] = None

    # The views offered by the list page: "table" and/or "list". More than
    # one enables a toggle in the interface.
    list_views: list[str] = ["table"]

    # Fields the list search searches through.
    search_fields: list[str] = []

    # Fields the list filters can filter on. Only string entries count.
    list_filter: list[str] = []

    # The bulk actions offered on the table view: None (the default)
    # offers the built-in delete plus every @bulk_action method, an
    # empty list disables bulk actions entirely, and an explicit list
    # offers exactly those names (with "delete" naming the built-in).
    actions: Optional[list[str]] = None

    # The columns that may be sorted on; None allows all.
    sortable_by: Optional[list[str]] = None

    # The default ordering of list results; falls back to pk.
    ordering: list[str] = []

    # Soft delete, as an opt-in: the name of the model's nullable
    # timestamp field that marks an object as trashed (the built-in
    # SoftDeletableModel uses "removed_at"). Empty — the default —
    # keeps the classic hard delete. When set, the delete action moves
    # the object to the model's trash instead, where it can be restored
    # or permanently deleted.
    soft_delete: str = ""

    # Inline models edited on the parent's edit page.
    inlines: list[Type["InlineModelStudio"]] = []

    # Configure the main section in the edit-view.
    edit_main: Union[
        list[Union[FormSetGroup, FormSet, Field, Component, str]], list[str]
    ] = []

    # Configure the sidebar in the edit-view.
    edit_sidebar: Union[list[Union[FormSet, Field, Component, str]], list[str]] = []

    # The icon for this model will be shown in the menu and some other places.
    icon: Optional[str] = None

    # Duplicate (save as new), as an opt-in: the edit page offers to
    # open a create form prefilled with a copy of the object. Never
    # offered for singletons.
    allow_duplication: bool = False

    # The inlines (entries of `inlines`) whose rows are copied along
    # when the duplicate is saved. Inlines left out start empty.
    duplicate_inlines: list[Type["InlineModelStudio"]] = []

    # Export, as an opt-in: the list page offers to download the list as
    # CSV (and Excel when openpyxl is installed). export_fields names the
    # columns, like table_display; allow_export exports the
    # table_display columns. Never offered for singletons.
    export_fields: Optional[list[Union[str, "TableColumn"]]] = None
    allow_export: bool = False

    # Whether the edit and list pages show which other users have an
    # object open (when the PRESENCE setting is on).
    presence: bool = True

    def get_duplicate_initial(self, request: HttpRequest, obj: T) -> dict[str, Any]:
        """
        The values a duplicate of obj starts with, as model values:
        related objects as instances, many-to-many fields as lists of
        instances. The editor can change them before saving, and only
        fields the create form writes are used. The default copies the
        editable fields, gives unique slugs and URL paths a free suffix
        and leaves other unique fields, files, one-to-one fields and
        read-only, excluded and automatic fields out. Override to
        adjust, e.g. starting from super().
        """
        from .duplication import get_default_duplicate_initial

        return get_default_duplicate_initial(self, request, obj)

    def get_relation_display(
        self, obj: models.Model, request: HttpRequest
    ) -> "RelationDisplay":
        """
        How a related object appears wherever the studio renders it: relation
        pickers, list views and selected-value badges. Override to customize;
        the base implementation displays the object's string representation.
        """
        return RelationDisplay(title=str(obj))

    def get_list_item_display(
        self, obj: models.Model, request: HttpRequest
    ) -> "ListItemDisplay":
        """
        The anatomy of an item in the list view. The base implementation
        resolves the declarative list_item_display mapping (roles to field
        or model method names); override for fully computed items.
        """
        display = self.list_item_display or {}

        def resolve(role: str) -> str:
            field = display.get(role)

            if not field:
                return ""

            value = getattr(obj, field)

            return str(value() if callable(value) else value)

        return ListItemDisplay(
            title=resolve("title") or str(obj),
            description=resolve("description"),
            meta=resolve("meta"),
            thumbnail=self._resolve_thumbnail(obj, display.get("thumbnail")),
        )

    def _resolve_thumbnail(self, obj: models.Model, field: Optional[str]) -> str:
        """
        The thumbnail URL of the list_item_display mapping: an image or
        file field, a media library item (images only) or a URL string.
        """
        if not field:
            return ""

        value = getattr(obj, field)

        if callable(value):
            value = value()

        if not value:
            return ""

        if isinstance(value, FieldFile):
            return value.url

        if isinstance(value, models.Model):
            if value.__class__ is cs_settings.MEDIA_LIBRARY_MODEL:
                if getattr(value, "type", None) != "image":
                    return ""
                return self.admin_site.get_thumbnail(value) or ""
            return ""

        return str(value)

    def has_add_permission(self, request: HttpRequest, obj: Optional[T] = None) -> bool:
        # Don't allow adding more than one singleton object.
        if get_is_singleton(self) and self.model.objects.exists():
            return False

        return super().has_add_permission(request, obj)

    def has_delete_permission(
        self, request: HttpRequest, obj: Optional[T] = None
    ) -> bool:
        if get_is_singleton(self):
            return False

        return super().has_delete_permission(request, obj)


class InlineModelStudio(BaseStudio[T]):
    """
    An inline model: rows of a related model edited on the parent's
    edit page. The relation is derived from the foreign key to the
    parent; set fk_name when the inline has more than one.
    """

    model: Type[T]

    # The name of the foreign key field pointing at the parent; left
    # empty when the inline has exactly one.
    fk_name: Optional[str] = None

    # The columns of the inline list: field names, TableColumn objects
    # or both mixed.
    table_display: list[Union[str, "TableColumn"]] = ["__str__"]

    list_per_page: int = 10
    list_filter: list[str] = []
    list_views: list[str] = ["table"]
    search_fields: list[str] = []
    ordering: list[str] = []

    # Inlines share the soft_delete surface for the shared viewset code;
    # inline lists themselves are not trashed.
    soft_delete: str = ""

    def __init__(self, parent_model: Type[Model], admin_site: "ContentStudioSite"):
        self.parent_model = parent_model
        self.admin_site = admin_site


class ContentStudioSite:
    """
    The Content Studio site: the registry of model studios plus the
    studio-wide configuration (authentication, dashboard, menus).
    """

    site_header = _("Content Studio")
    site_title = _("Content Studio")
    index_title = None
    site_url = "/"

    token_backend: TokenBackendManager = TokenBackendManager()

    login_backend: LoginBackendManager = LoginBackendManager()

    dashboard: Any = None

    model_groups: Optional[list["ModelGroup"]] = None

    extensions: Optional[list[Any]] = None

    default_widget_mapping: dict[
        Union[Type[models.Field], str], Type[widgets.BaseWidget]
    ] = {
        # Django fields
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
        # Content Studio fields
        fields.HTMLField: widgets.RichTextWidget,
        fields.TagField: widgets.TagWidget,
        fields.FlexField: widgets.JSONSchemaWidget,
        blocks.BlockField: widgets.BlockWidget,
        fields.MultipleChoiceField: widgets.MultiSelectWidget,
        fields.URLPathField: widgets.URLPathWidget,
        ml_fields.MediaField: widgets.MediaWidget,
        ml_fields.ManyMediaField: widgets.ManyMediaWidget,
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
        # Content Studio fields
        fields.HTMLField: formats.HtmlFormat,
        fields.TagField: formats.TagFormat,
        fields.FlexField: formats.JSONFormat,
        blocks.BlockField: formats.BlockFormat,
        fields.MultipleChoiceField: formats.TextFormat,
        fields.URLPathField: formats.TextFormat,
        ml_fields.MediaField: formats.MediaFormat,
        ml_fields.ManyMediaField: formats.ManyMediaFormat,
        # Common third-party fields
        "AutoSlugField": formats.TextFormat,
    }

    def __init__(self, name: str = "content_studio"):
        self.name = name
        self._registry: dict[Type[Model], ModelStudio] = {}

    def register(
        self, model_or_iterable, studio_class: Type[ModelStudio] = None, **options
    ) -> None:
        """
        Register the given model(s) with the site. The studio class is
        instantiated and stored; models must be registered only once.

        Options given as keyword arguments are applied by dynamically
        subclassing the studio class, like the classic admin's register.
        """
        if not isinstance(model_or_iterable, (list, tuple)):
            model_or_iterable = [model_or_iterable]

        for model in model_or_iterable:
            if model._meta.abstract:
                raise ImproperlyConfigured(
                    f"The model {model.__name__} is abstract, so it cannot be "
                    "registered with Content Studio."
                )

            if model in self._registry:
                raise AlreadyRegistered(
                    f"The model {model.__name__} is already registered with "
                    "Content Studio."
                )

            if studio_class is None:
                studio_class = ModelStudio

            if options:
                studio_class = type(
                    str(studio_class.__name__), (studio_class,), options
                )

            if not issubclass(studio_class, ModelStudio):
                raise ImproperlyConfigured(
                    f"{studio_class.__name__} must subclass "
                    "content_studio.admin.ModelStudio."
                )

            self._registry[model] = studio_class(model, self)

    def unregister(self, model_or_iterable) -> None:
        """
        Unregister the given model(s) from the site.
        """
        if not isinstance(model_or_iterable, (list, tuple)):
            model_or_iterable = [model_or_iterable]

        for model in model_or_iterable:
            if model not in self._registry:
                raise NotRegistered(
                    f"The model {model.__name__} is not registered with "
                    "Content Studio."
                )

            del self._registry[model]

    def is_registered(self, model) -> bool:
        """
        Check the registry for the given model.
        """
        return model in self._registry

    def setup(self):
        # The user model is manageable out of the box; projects that
        # register their own user studio take precedence.
        self._register_default_user_studio()

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

        # Global search for the command palette.
        from .router import content_studio_router
        from .search import SearchViewSet

        content_studio_router.register(
            "api/search", SearchViewSet, basename="content_studio_search"
        )

    def _register_default_user_studio(self):
        user_model = get_user_model()

        if not self.is_registered(user_model):
            self.register(user_model)

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


admin_site = ContentStudioSite()


def register(*models, site: ContentStudioSite = None):
    """
    Register the given model classes and wrapped ModelStudio class with
    the Content Studio site:

        from content_studio import register
        from content_studio.admin import ModelStudio

        @register(Article)
        class ArticleStudio(ModelStudio):
            pass

    The `site` kwarg is a Content Studio site to use instead of the
    configured one.
    """

    def _model_studio_wrapper(studio_class):
        if not models:
            raise ValueError("At least one model must be passed to register.")

        admin_site = site or cs_settings.ADMIN_SITE

        if not isinstance(admin_site, ContentStudioSite):
            raise ValueError("site must be a ContentStudioSite instance.")

        if not issubclass(studio_class, ModelStudio):
            raise ValueError("Wrapped class must subclass ModelStudio.")

        admin_site.register(models, studio_class=studio_class)

        return studio_class

    return _model_studio_wrapper


def _header_entries(studio) -> list:
    """A studio's edit_header as a list; anything but a list or tuple
    counts as empty (system check E020 reports it)."""
    header = getattr(studio, "edit_header", None)

    return list(header) if isinstance(header, (list, tuple)) else []


def serialize_edit_header(studio) -> list[dict[str, Any]]:
    """The serialized components of a studio's edit_header."""
    return [
        component.serialize()
        for component in _header_entries(studio)
        if isinstance(component, Component)
    ]


def serialize_permissions(studio, request) -> dict[str, bool]:
    return {
        "add_permission": studio.has_add_permission(request),
        "delete_permission": studio.has_delete_permission(request),
        "change_permission": studio.has_change_permission(request),
        "view_permission": studio.has_view_permission(request),
    }


def iter_components(admin_class):
    """
    Yield the components configured in a studio's edit_header,
    edit_main and edit_sidebar.
    """
    all_fields = (
        _header_entries(admin_class)
        + list(getattr(admin_class, "edit_main", None) or [])
        + list(getattr(admin_class, "edit_sidebar", None) or [])
    )

    flat_fields = flatten(
        [f.get_fields() if hasattr(f, "get_fields") else [f] for f in all_fields]
    )

    for field in flat_fields:
        if issubclass(field.__class__, Component):
            yield field


def declares(owner, name: str) -> bool:
    """
    Whether a studio (class or instance) sets an attribute itself rather
    than inheriting Content Studio's default.
    """
    cls = owner if isinstance(owner, type) else type(owner)

    return any(
        name in vars(klass)
        for klass in cls.__mro__
        if klass not in (ModelStudio, InlineModelStudio, BaseStudio, Generic, object)
    )


def resolve_table_display(owner) -> list:
    """
    A studio's table_display entries. list_display, the Django admin's
    name for the table columns, stands in for table_display unless the
    studio sets table_display itself.
    """
    list_display = getattr(owner, "list_display", None)

    if isinstance(list_display, (list, tuple)) and not declares(owner, "table_display"):
        return list(list_display)

    return list(getattr(owner, "table_display", []))


def get_table_display_columns(admin_class) -> list[TableColumn]:
    """
    Normalize a model studio's table_display entries into TableColumn
    objects: plain strings are shorthand for TableColumn(field=name).
    """
    return [
        entry if isinstance(entry, TableColumn) else TableColumn(field=entry)
        for entry in resolve_table_display(admin_class)
    ]


def is_computed_column(admin_class, column: TableColumn) -> bool:
    """
    Whether a column is computed: backed by a method on the studio
    rather than a model field. Dunder names (__str__ and friends) are
    model behavior, never studio methods.
    """
    if column.field.startswith("__"):
        return False

    return callable(getattr(admin_class, column.field, None))


def get_readonly_field_names(
    studio, request: HttpRequest, obj: Optional[models.Model] = None
) -> set[str]:
    """
    Every field the API must not write for this studio: the studio's
    get_readonly_fields plus the edit page's Field(readonly=True)
    entries, so neither is enforced by the interface alone.
    """
    names = set(studio.get_readonly_fields(request, obj))

    all_fields = list(getattr(studio, "edit_main", None) or []) + list(
        getattr(studio, "edit_sidebar", None) or []
    )
    flat_fields = flatten(
        [f.get_fields() if hasattr(f, "get_fields") else [f] for f in all_fields]
    )

    for field in flat_fields:
        if isinstance(field, Field) and field.readonly:
            names.add(field.name)

    return names


def get_form_field_names(
    studio, request: HttpRequest, obj: Optional[models.Model] = None
) -> set[str]:
    """
    Every field the edit page renders for this studio: the fields of
    edit_main (or get_fields when it is unset, which honors exclude)
    and edit_sidebar. Like the classic admin's form, these are the only
    fields the API writes.
    """
    # get_fields is called as the edit page's payload calls it.
    edit_main = list(getattr(studio, "edit_main", None) or []) or list(
        studio.get_fields(request)
    )
    entries = edit_main + list(getattr(studio, "edit_sidebar", None) or [])
    flat_fields = flatten(
        [f.get_fields() if hasattr(f, "get_fields") else [f] for f in entries]
    )

    names = set()

    for field in flat_fields:
        if isinstance(field, str):
            names.add(field)
        elif isinstance(field, Field):
            names.add(field.name)

    return names


def serialize_prepopulated_fields(studio, request: HttpRequest) -> dict[str, list]:
    """
    The create form's prepopulated fields, with the sources as lists.
    """
    return {
        target: list(sources)
        for target, sources in studio.get_prepopulated_fields(request).items()
    }


def get_is_singleton(admin_class) -> bool:
    """
    Return the effective singleton state of a model studio.

    The studio's is_singleton attribute is the canonical declaration.
    A model-level marker (e.g. a class property like the built-in
    SingletonModel's is_singleton) is honored as a fallback for backward
    compatibility; concrete fields named is_singleton are ignored, since
    a field descriptor is truthy off the model class.
    """
    if getattr(admin_class, "is_singleton", False):
        return True

    model = admin_class.model

    if any(field.name == "is_singleton" for field in model._meta.get_fields()):
        return False

    return bool(getattr(model, "is_singleton", False))


def is_duplicable(studio) -> bool:
    """
    Whether a studio offers duplication: an opted-in model studio that
    is not a singleton. Inlines are never duplicated on their own.
    """
    return (
        isinstance(studio, ModelStudio)
        and bool(studio.allow_duplication)
        and not get_is_singleton(studio)
    )


def is_reorderable(studio, request: HttpRequest) -> bool:
    """
    Whether the request may reorder a studio's list: reordering is
    configured and moving an object is a change.
    """
    return bool(studio.reorder_field) and studio.has_change_permission(request)


def get_relation_display_for(
    model: Type[models.Model], obj: models.Model, request: HttpRequest
) -> "RelationDisplay":
    """
    Resolve the relation display for an object through its model's
    registered ModelStudio. Models without one fall back to the string
    representation.
    """
    related_studio = cs_settings.ADMIN_SITE._registry.get(model)

    if related_studio is not None:
        return related_studio.get_relation_display(obj, request)

    return RelationDisplay(title=str(obj))


class AdminSerializer:
    """
    Class for serializing model studios for the frontend.
    """

    def __init__(self, admin_class: ModelStudio):
        self.admin_class = admin_class

    def serialize(self, request: HttpRequest) -> dict[str, Any]:
        admin_class = self.admin_class

        return {
            "icon": admin_class.icon,
            "is_singleton": get_is_singleton(admin_class),
            # Whether the edit and list pages show who else has an
            # object open.
            "presence": is_presence_enabled(admin_class),
            "edit": {
                "header": serialize_edit_header(admin_class),
                "main": self.serialize_edit_main(request),
                "sidebar": self.serialize_edit_sidebar(request),
                # The create form's read-only fields; saved objects
                # carry their own.
                "readonly_fields": list(admin_class.get_readonly_fields(request)),
                "prepopulated_fields": serialize_prepopulated_fields(
                    admin_class, request
                ),
                # Whether the edit page offers Duplicate; it also needs
                # add permission.
                "duplicate": is_duplicable(admin_class),
                "width": admin_class.edit_width,
                "inlines": [
                    {
                        "model": inline.model._meta.label_lower,
                        "fk_name": get_related_field_name(inline, admin_class.model),
                        "readonly_fields": list(
                            inline(
                                admin_class.model, admin_class.admin_site
                            ).get_readonly_fields(request)
                        ),
                        "prepopulated_fields": serialize_prepopulated_fields(
                            inline(admin_class.model, admin_class.admin_site),
                            request,
                        ),
                        "table_display": [
                            column.serialize()
                            for column in get_table_display_columns(inline)
                        ],
                        "reorderable": is_reorderable(
                            inline(admin_class.model, admin_class.admin_site),
                            request,
                        ),
                        "header": serialize_edit_header(inline),
                        # The inline studio sizes its dialogs, not the
                        # inline model's own studio.
                        "width": inline.edit_width,
                        "permissions": serialize_permissions(
                            inline(admin_class.model, admin_class.admin_site),
                            request,
                        ),
                    }
                    for inline in admin_class.inlines
                ],
            },
            "list": {
                "per_page": admin_class.list_per_page,
                "description": admin_class.list_description,
                "display": self.get_table_display(),
                "views": admin_class.list_views,
                "search": len(admin_class.search_fields) > 0,
                "filter": admin_class.list_filter,
                "trash": bool(admin_class.soft_delete),
                "sortable_by": admin_class.sortable_by,
                "reorderable": is_reorderable(admin_class, request),
                # The formats the list can be exported in, or None when
                # the studio offers no export.
                "export": (
                    {"formats": get_export_formats()}
                    if is_exportable(admin_class)
                    else None
                ),
                "actions": [
                    action.serialize()
                    for action in get_bulk_actions(admin_class, request)
                ],
            },
            "permissions": serialize_permissions(admin_class, request),
        }

    def serialize_edit_main(self, request: HttpRequest) -> list[dict[str, Any]]:
        admin_class = self.admin_class

        # An unset (or empty) edit_main falls back to every editable
        # field. This also gives inline models without a studio of
        # their own a complete form.
        edit_main = admin_class.edit_main or admin_class.get_fields(request)

        return [i.serialize() for i in self.get_edit_main(edit_main)]

    def serialize_edit_sidebar(self, request: HttpRequest) -> list[dict[str, Any]]:
        admin_class = self.admin_class

        return [i.serialize() for i in self.get_edit_sidebar(admin_class.edit_sidebar)]

    def get_table_display(self) -> list[dict[str, Any]]:
        return [column.serialize() for column in self.get_columns()]

    def get_columns(self) -> list[TableColumn]:
        return get_table_display_columns(self.admin_class)

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
