from django.apps import AppConfig
from django.contrib import admin
from django.contrib.auth import get_user_model

from . import VERSION
from .paginators import ContentPagination
from .settings import cs_settings
from .utils import (
    is_runserver,
    get_latest_version,
    get_tenant_scoped_queryset,
    normalize_version,
)


class DjangoContentStudioConfig(AppConfig):
    name = "content_studio"
    label = "content_studio"
    initialized = False

    def ready(self):
        from .utils import log

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

        # Check for a newer version
        latest_version = get_latest_version()
        if latest_version:
            latest_version = normalize_version(latest_version)
            current_version = normalize_version(VERSION)
            if latest_version != current_version:
                log("[yellow]⚠️  New version available[/yellow]")
                log(
                    f"Current: [bold]{current_version}[/bold] → Latest: {latest_version}"
                )
            else:
                log(f"[bold]Version {current_version}[/bold]")
        else:
            log(f"[bold]Version {VERSION}[/bold]")
        log("[bold magenta]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/bold magenta]")

        log(":mag:", "Discovering admin models...")
        registered_models = len(admin.site._registry)
        log(
            ":white_check_mark:",
            f"[green]Found {registered_models} admin models[/green]",
        )
        log(":white_check_mark:", "[green]Created CRUD API[/green]")

        log("\n")

    def _create_crud_api(self):
        from .utils import log

        for model, admin_model in admin.site._registry.items():
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
        from .admin import get_is_singleton
        from .viewsets import BaseModelViewSet
        from .router import content_studio_router
        from .serializers import ContentSerializer

        if parent:
            # Inlines arrive as classes (ModelAdmin.inlines); the viewset
            # needs an instance so permission methods are bound.
            admin_model = admin_model(parent, admin.site)

        class Pagination(ContentPagination):
            page_size = getattr(admin_model, "list_per_page", 10)

        class ViewSet(BaseModelViewSet):
            _model = model
            _admin_model = admin_model
            is_singleton = get_is_singleton(admin_model)
            pagination_class = Pagination
            queryset = _model.objects.none()
            search_fields = list(getattr(_admin_model, "search_fields", []))

            def get_serializer_class(self):
                user_model = get_user_model()
                excluded_fields = None
                # For list views we include the specified list_display fields.
                if self.action == "list" and not self.is_singleton:
                    available_fields = [
                        "id",
                        "__str__",
                    ] + list(getattr(self._admin_model, "list_display", []))
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

                return Serializer

            def get_queryset(self):
                qs = get_tenant_scoped_queryset(self.request, self._model)

                # Respect the model admin's ordering; fall back to pk so
                # paginated pages are stable (and silent).
                ordering = getattr(self._admin_model, "ordering", None) or ["pk"]
                return qs.order_by(*ordering)

        if parent:
            prefix = f"api/inlines/{parent._meta.label_lower}/{model._meta.label_lower}"
            basename = f"content_studio_api-{parent._meta.label_lower}-{model._meta.label_lower}"
        else:
            prefix = f"api/content/{model._meta.label_lower}"
            basename = f"content_studio_api-{model._meta.label_lower}"

        content_studio_router.register(prefix, ViewSet, basename)
