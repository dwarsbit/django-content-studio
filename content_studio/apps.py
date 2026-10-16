from django.apps import AppConfig
from django.contrib.auth import get_user_model
from packaging.version import Version
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from . import VERSION
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
            get_is_singleton,
            get_table_display_columns,
            is_computed_column,
        )
        from .viewsets import BaseModelViewSet
        from .router import content_studio_router
        from .serializers import ContentSerializer
        from .utils import get_related_field_name

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
        allowed_ordering = ["id", "pk"] + [
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
                    if user_model.USERNAME_FIELD != "username":
                        excluded_fields.append("username")
                # In all other cases we include all fields.
                else:
                    available_fields = "__all__"

                class Serializer(ContentSerializer):

                    class Meta:
                        model = self._model
                        fields = available_fields
                        exclude = excluded_fields

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
                # parent must be visible to the user.
                if self.parent_fk and self.action == "list":
                    parent_id = self._get_parent_id()
                    if not parent_id:
                        raise ValidationError(
                            "Filtering by the parent is required on inline endpoints."
                        )
                    self._check_parent_access(parent_id)

                # Soft delete, when configured: the regular lists exclude
                # trashed objects, the trash lists only those, and the
                # restore/permanent-delete actions reach trashed
                # objects unfiltered.
                soft_delete_field = self._admin_model.soft_delete
                if soft_delete_field:
                    if self.action == "trash":
                        qs = qs.filter(**{f"{soft_delete_field}__isnull": False})
                    elif self.action not in ("restore", "destroy_permanently"):
                        qs = qs.filter(**{f"{soft_delete_field}__isnull": True})

                # Respect the model studio's ordering; fall back to pk so
                # paginated pages are stable (and silent). The trash
                # falls back to most-recently-deleted first.
                if self._admin_model.ordering:
                    ordering = self._admin_model.ordering
                elif self.action == "trash" and soft_delete_field:
                    ordering = [f"-{soft_delete_field}"]
                else:
                    ordering = ["pk"]
                return qs.order_by(*ordering)

            def _get_parent_id(self):
                params = self.request.query_params
                return params.get(f"{self.parent_fk}_id") or params.get(self.parent_fk)

            def _check_parent_access(self, parent_id):
                from rest_framework.exceptions import PermissionDenied

                parent = self.parent_model.objects.filter(pk=parent_id).first()
                parent_admin = cs_settings.ADMIN_SITE._registry.get(self.parent_model)

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
