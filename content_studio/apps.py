from django.apps import AppConfig
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from packaging.version import Version
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from . import VERSION
from .filters import LookupFilter
from .paginators import ContentPagination
from .settings import cs_settings
from .utils import (
    is_runserver,
    get_latest_version,
    is_newer_version,
    get_tenant_scoped_queryset,
    normalize_version,
)


class DjangoContentStudioConfig(AppConfig):
    name = "content_studio"
    label = "content_studio"
    initialized = False

    def ready(self):
        from django.utils.module_loading import autodiscover_modules

        from . import checks  # noqa: F401 -- registers the system checks
        from .utils import log

        # Import every app's admin module (where Content Studio
        # registrations live) before building the studio's API, so the
        # position of apps in INSTALLED_APPS does not affect what is
        # registered.
        autodiscover_modules("admin")

        # Set up the admin site routes and content CRUD APIs in every
        # context (runserver, WSGI/ASGI, management commands, tests) so
        # the routes always exist.
        admin_site = cs_settings.ADMIN_SITE
        admin_site.setup()
        self._create_crud_api()

        # The boot log and PyPI version check are decorative: show them
        # in interactive server mode only.
        if not is_runserver() or self.initialized:
            return

        self.initialized = True

        log("")
        log("[bold magenta]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/bold magenta]")
        log("[bold cyan]Django Content Studio[/bold cyan]")

        # Check for a newer release; an installed pre-release also hears
        # about newer pre-releases.
        current_version = normalize_version(VERSION)
        latest_version = get_latest_version(
            include_prereleases=Version(VERSION).is_prerelease
        )
        if latest_version and is_newer_version(latest_version, VERSION):
            log("[yellow]⚠️  New version available[/yellow]")
            log(
                f"Current: [bold]{current_version}[/bold] → Latest: "
                f"{normalize_version(latest_version)}"
            )
        else:
            log(f"[bold]Version {current_version}[/bold]")
        log("[bold magenta]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/bold magenta]")

        log(":mag:", "Discovering admin models...")
        registered_models = len(cs_settings.ADMIN_SITE._registry)
        log(
            ":white_check_mark:",
            f"[green]Found {registered_models} admin models[/green]",
        )
        log(":white_check_mark:", "[green]Created CRUD API[/green]")

        log("\n")

    def _create_crud_api(self):
        from .utils import log

        for model, admin_model in cs_settings.ADMIN_SITE._registry.items():
            self._create_view_set(model, admin_model)

            for inline in admin_model.inlines:
                self._create_view_set(
                    parent=model, model=inline.model, admin_model=inline
                )

        log(
            ":white_check_mark:",
            f"[green]Created CRUD API[/green]",
        )

    def _create_view_set(self, model, admin_model, parent=None):
        from .admin import (
            get_form_field_names,
            get_is_singleton,
            get_readonly_field_names,
            get_table_display_columns,
            is_computed_column,
        )
        from .viewsets import BaseModelViewSet
        from .router import content_studio_router
        from .serializers import ContentSerializer
        from .utils import get_related_field_name, get_tenant_field_name

        inline_parent_fk = None

        if parent:
            # Inlines arrive as classes (ModelStudio.inlines); the viewset
            # needs an instance so permission methods are bound.
            admin_site = cs_settings.ADMIN_SITE
            admin_model = admin_model(parent, admin_site)
            inline_parent_fk = get_related_field_name(admin_model, parent)

        # Ordering is restricted to real model fields: __str__ and
        # computed columns have no queryset equivalent, so ordering by
        # them is dropped instead of raising FieldError.
        model_field_names = {field.name for field in model._meta.get_fields()}
        columns = get_table_display_columns(admin_model)
        # "id" is the pk's usual name, not a guaranteed one.
        allowed_ordering = (["id"] if "id" in model_field_names else []) + ["pk"]
        allowed_ordering += [
            column.field for column in columns if column.field in model_field_names
        ]
        # A sortable_by declaration narrows ordering to exactly those
        # columns; entries without a queryset equivalent are dropped.
        sortable_by = getattr(admin_model, "sortable_by", None)
        if sortable_by is not None:
            allowed_ordering = [
                field for field in sortable_by if field in allowed_ordering
            ]

        class Pagination(ContentPagination):
            page_size = admin_model.list_per_page

        class ViewSet(BaseModelViewSet):
            _model = model
            _admin_model = admin_model
            is_singleton = get_is_singleton(admin_model)
            pagination_class = Pagination
            queryset = _model.objects.none()
            search_fields = list(admin_model.search_fields)
            ordering_fields = allowed_ordering
            # Inline viewsets: the FK to the parent model.
            parent_fk = inline_parent_fk
            parent_model = parent

            def get_serializer_class(self):
                user_model = get_user_model()
                excluded_fields = None
                # For list views we include the specified table_display fields.
                if self.action in ("list", "trash") and not self.is_singleton:
                    available_fields = ["id", "__str__"] + [
                        column.field for column in columns
                    ]
                    # Trash rows also carry the removal timestamp.
                    if self.action == "trash" and self._admin_model.soft_delete:
                        available_fields.append(self._admin_model.soft_delete)
                    # Rows carry their resolved list item display when
                    # the list view is enabled.
                    if "list" in self._admin_model.list_views:
                        available_fields.append("list_item_display")
                # For the user model we exclude the password and the username field.
                elif model is user_model:
                    available_fields = None
                    excluded_fields = ["password"]
                    # Custom user models need not have a username field;
                    # excluding a missing field is an error in DRF.
                    if user_model.USERNAME_FIELD != "username" and any(
                        field.name == "username"
                        for field in user_model._meta.get_fields()
                    ):
                        excluded_fields.append("username")
                # In all other cases we include all fields.
                else:
                    available_fields = "__all__"

                class Serializer(ContentSerializer):

                    class Meta:
                        model = self._model
                        fields = available_fields
                        exclude = excluded_fields

                # Rows always carry an "id": models whose primary key has
                # another name get it as an alias of the pk.
                if self._model._meta.pk.name != "id":
                    Serializer = type(
                        str("Serializer"),
                        (Serializer,),
                        {"id": serializers.ReadOnlyField(source="pk")},
                    )

                # Detail views: read-only fields are never written, and
                # each object reports its own so the editor can show
                # them (get_readonly_fields may depend on the object).
                if self.action not in ("list", "trash") or self.is_singleton:
                    admin_model = self._admin_model
                    parent_fk = self.parent_fk

                    class DetailSerializer(Serializer):
                        __readonly_fields__ = serializers.SerializerMethodField(
                            method_name="get_readonly_field_list"
                        )

                        def _get_obj(self):
                            return (
                                self.instance
                                if isinstance(self.instance, models.Model)
                                else None
                            )

                        def get_fields(self):
                            fields = super().get_fields()
                            request = self.context.get("request")
                            obj = self._get_obj()

                            # Excluded fields are not on the edit page,
                            # and not sent to the admin either: exclude
                            # keeps a value such as a key out of it.
                            for name in admin_model.exclude or []:
                                fields.pop(name, None)
                            readonly = get_readonly_field_names(
                                admin_model, request, obj
                            )

                            # Only the fields the edit page renders are
                            # written, like the classic admin's form: an
                            # excluded field is not writable through the
                            # API either. Inlines always set their parent.
                            writable = get_form_field_names(admin_model, request, obj)
                            if parent_fk:
                                writable.add(parent_fk)

                            # The tenant comes from the validated tenant
                            # header (see perform_create), never from the
                            # payload: objects cannot be moved or created
                            # into another tenant.
                            tenant_field = get_tenant_field_name(model)

                            for name, field in fields.items():
                                if (
                                    name in readonly
                                    or name not in writable
                                    or name == tenant_field
                                ):
                                    field.read_only = True

                            return fields

                        def get_readonly_field_list(self, obj):
                            return list(
                                admin_model.get_readonly_fields(
                                    self.context.get("request"), obj
                                )
                            )

                    return DetailSerializer

                # Columns backed by a model studio method ship their
                # computed value on every row, through the column's
                # format (TextFormat when unset).
                if self.action in ("list", "trash") and not self.is_singleton:
                    method_columns = [
                        column
                        for column in columns
                        if is_computed_column(self._admin_model, column)
                    ]

                    if method_columns:
                        admin_model = self._admin_model
                        attrs = {}

                        for column in method_columns:

                            def get_column_value(
                                self, obj, admin_model=admin_model, column=column
                            ):
                                return getattr(admin_model, column.field)(
                                    obj, self.context.get("request")
                                )

                            attrs[column.field] = serializers.SerializerMethodField(
                                method_name=f"resolve_{column.field}"
                            )
                            attrs[f"resolve_{column.field}"] = get_column_value

                        Serializer = type(str("Serializer"), (Serializer,), attrs)

                # When the list view is enabled, every row carries its
                # resolved list item display so the frontend renders fully
                # computed rows (declarative mapping or override).
                if (
                    self.action in ("list", "trash")
                    and not self.is_singleton
                    and "list" in self._admin_model.list_views
                ):
                    admin_model = self._admin_model

                    class ListSerializer(Serializer):
                        list_item_display = serializers.SerializerMethodField()

                        def get_list_item_display(self, obj):
                            display = admin_model.get_list_item_display(
                                obj, self.context.get("request")
                            )

                            return {
                                "title": display.title,
                                "description": display.description,
                                "meta": display.meta,
                            }

                    return ListSerializer

                return Serializer

            def get_queryset(self):
                qs = get_tenant_scoped_queryset(self.request, self._model)

                # Inline lists only exist in the context of a parent:
                # the parent filter is required and the referenced
                # parent must be visible to the user. The list is
                # filtered here, on the one parent that was checked
                # (LookupFilter skips the parent keys).
                if self.parent_fk and self.action == "list":
                    parent_id = self._get_parent_id()
                    if not parent_id:
                        raise ValidationError(
                            "Filtering by the parent is required on inline endpoints."
                        )
                    self._check_parent_access(parent_id)
                    qs = qs.filter(**{f"{self.parent_fk}__pk": parent_id})

                # Soft delete, when configured: the regular lists exclude
                # trashed objects, the trash (and its export) lists only
                # those, and the restore/permanent-delete actions reach
                # trashed objects unfiltered, as does the unique check (a
                # trashed object still occupies its unique values).
                soft_delete_field = self._admin_model.soft_delete
                in_trash = self.action == "trash" or (
                    self.action == "export"
                    and self.request.query_params.get("export_scope") == "trash"
                )
                if soft_delete_field:
                    if in_trash:
                        qs = qs.filter(**{f"{soft_delete_field}__isnull": False})
                    elif self.action not in (
                        "restore",
                        "destroy_permanently",
                        "unique_check",
                    ):
                        qs = qs.filter(**{f"{soft_delete_field}__isnull": True})

                # Respect the model studio's ordering; fall back to pk so
                # paginated pages are stable (and silent). The trash
                # falls back to most-recently-deleted first, a
                # reorderable list to its manual order.
                reorder_field = self._admin_model.reorder_field
                if self._admin_model.ordering:
                    ordering = self._admin_model.ordering
                elif in_trash and soft_delete_field:
                    ordering = [f"-{soft_delete_field}"]
                elif reorder_field:
                    ordering = [
                        *self._admin_model.reorder_scope,
                        reorder_field,
                        "pk",
                    ]
                else:
                    ordering = ["pk"]
                return qs.order_by(*ordering)

            def get_parent_filter_keys(self):
                """The parent keys the viewset filters on itself (lists)."""
                if self.parent_fk and self.action == "list":
                    return [self.parent_fk, f"{self.parent_fk}_id"]
                return []

            def _get_parent_id(self):
                # Exactly one plain value for the parent: no repeated
                # keys, comma lists or lookups, so the parent that is
                # checked is the only one the list is filtered on.
                params = self.request.query_params
                keys = self.get_parent_filter_keys()
                values = []

                for key in params:
                    name = key.removeprefix(LookupFilter.EXCLUDE_SYMBOL)
                    if name.split("__")[0] not in keys:
                        continue
                    if key not in keys:
                        raise ValidationError(
                            f"Filtering on '{key}' is not allowed on inline endpoints."
                        )
                    values += params.getlist(key)

                if not values:
                    return None
                if len(values) > 1 or "," in values[0]:
                    raise ValidationError("Filter on exactly one parent.")

                try:
                    return self.parent_model._meta.pk.to_python(values[0])
                except DjangoValidationError:
                    raise ValidationError("Invalid parent.")

            def _check_parent_access(self, parent_id):
                from django.core.exceptions import (
                    ValidationError as DjangoValidationError,
                )
                from rest_framework.exceptions import PermissionDenied

                try:
                    parent_id = self.parent_model._meta.pk.to_python(parent_id)
                except DjangoValidationError:
                    raise ValidationError("Invalid parent.")

                parent_admin = cs_settings.ADMIN_SITE._registry.get(self.parent_model)

                # The parent is looked up like the parent studio's own
                # detail endpoint: within the tenant and, with soft delete,
                # outside the trash.
                parents = get_tenant_scoped_queryset(self.request, self.parent_model)
                soft_delete_field = getattr(parent_admin, "soft_delete", "")
                if soft_delete_field:
                    parents = parents.filter(**{f"{soft_delete_field}__isnull": True})
                parent = parents.filter(pk=parent_id).first()

                if (
                    not parent
                    or parent_admin is None
                    or not parent_admin.has_view_permission(self.request, parent)
                ):
                    raise PermissionDenied("Unknown or unauthorized parent.")

            def _check_parent_instance(self, parent_obj):
                from rest_framework.exceptions import PermissionDenied

                parent_admin = cs_settings.ADMIN_SITE._registry.get(self.parent_model)

                if (
                    not parent_obj
                    or parent_admin is None
                    or not parent_admin.has_view_permission(self.request, parent_obj)
                ):
                    raise PermissionDenied("Unknown or unauthorized parent.")

            def get_object(self):
                obj = super().get_object()

                # Inline objects are only reachable through a parent the
                # user can see, on every detail action.
                if self.parent_fk:
                    self._check_parent_instance(getattr(obj, self.parent_fk))

                return obj

            def perform_create(self, serializer):
                # Inline objects cannot be attached to parents the user
                # cannot see.
                if self.parent_fk:
                    self._check_parent_instance(
                        serializer.validated_data.get(self.parent_fk)
                    )

                super().perform_create(serializer)

            def perform_update(self, serializer):
                # ... and cannot be re-attached on update either.
                if self.parent_fk and self.parent_fk in serializer.validated_data:
                    self._check_parent_instance(
                        serializer.validated_data[self.parent_fk]
                    )

                super().perform_update(serializer)

        if parent:
            prefix = f"api/inlines/{parent._meta.label_lower}/{model._meta.label_lower}"
            basename = f"content_studio_api-{parent._meta.label_lower}-{model._meta.label_lower}"
        else:
            prefix = f"api/content/{model._meta.label_lower}"
            basename = f"content_studio_api-{model._meta.label_lower}"

        content_studio_router.register(prefix, ViewSet, basename)
