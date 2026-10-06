import operator
import uuid
from functools import reduce

from django.contrib import admin
from django.contrib.admin.models import LogEntry, ADDITION, CHANGE, DELETION
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import FieldDoesNotExist
from django.db import models
from django.db.models import Q
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.parsers import JSONParser
from rest_framework.permissions import DjangoModelPermissions
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .filters import LookupFilter
from .serializers import RelatedItemSerializer
from .settings import cs_settings
from .utils import get_tenant_field_name


class BaseModelViewSet(ModelViewSet):
    lookup_field = "id"
    is_singleton = False
    parser_classes = [JSONParser]
    renderer_classes = [JSONRenderer]
    permission_classes = [DjangoModelPermissions]
    filter_backends = [SearchFilter, OrderingFilter, LookupFilter]

    def __init__(self, *args, **kwargs):
        super(BaseModelViewSet, self).__init__()
        admin_site = cs_settings.ADMIN_SITE

        self.authentication_classes = [
            admin_site.token_backend.active_backend.authentication_class
        ]

    def list(self, request, *args, **kwargs):
        """
        We overwrite the list method to support singletons. If a singleton
        doesn't exist this will raise a NotFound exception.
        """
        if self.is_singleton:
            return super().retrieve(request, *args, **kwargs)

        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        tenant_id = self.request.headers.get("x-dcs-tenant", None)
        tenant_model = cs_settings.TENANT_MODEL
        model = self.get_queryset().model
        tenant_field_name = get_tenant_field_name(model)
        attrs = {}

        if tenant_model and tenant_id and tenant_field_name:
            attrs[f"{tenant_field_name}_id"] = tenant_id

        if hasattr(model, cs_settings.CREATED_BY_ATTR):
            attrs[cs_settings.CREATED_BY_ATTR] = self.request.user

        instance = serializer.save(**attrs)

        content_type = ContentType.objects.get_for_model(instance)
        LogEntry.objects.create(
            user=self.request.user,
            action_flag=ADDITION,
            content_type=content_type,
            object_id=instance.id,
            object_repr=str(instance)[:200],
            change_message="",
        )

    def perform_update(self, serializer):
        instance = serializer.save()

        if hasattr(instance, cs_settings.EDITED_BY_ATTR):
            setattr(instance, cs_settings.EDITED_BY_ATTR, self.request.user)
            instance.save()

        content_type = ContentType.objects.get_for_model(instance)
        LogEntry.objects.create(
            user=self.request.user,
            action_flag=CHANGE,
            content_type=content_type,
            object_id=instance.id,
            object_repr=str(instance)[:200],
            change_message="",
        )

    def perform_destroy(self, instance):
        content_type = ContentType.objects.get_for_model(instance)
        LogEntry.objects.create(
            user=self.request.user,
            action_flag=DELETION,
            content_type=content_type,
            object_id=instance.id,
            object_repr=str(instance)[:200],
            change_message="",
        )

        instance.delete()

    def get_object(self):
        """
        We overwrite this method to add support for singletons.
        If a singleton doesn't exist it will raise a NotFound exception.
        """
        if self.is_singleton:
            singleton = self.get_queryset().first()

            if singleton:
                return singleton
            else:
                raise NotFound()

        return super().get_object()

    @action(
        methods=["get"], detail=True, url_path="components/(?P<component_id>[^/.]+)"
    )
    def get_component(self, request, id, component_id):
        try:
            component_uuid = uuid.UUID(component_id)
        except ValueError:
            raise NotFound()

        component = self._admin_model.get_component(component_uuid)

        if not component:
            raise NotFound()

        return component.handle_request(obj=self.get_object(), request=request)

    @action(methods=["post"], detail=False, url_path="relations/(?P<field_name>[^/]+)")
    def get_related_objects(self, request, field_name):
        """
        Endpoint for retrieving related objects.

        The user needs view permission on the related model, mirroring
        the Django admin's requirement for related object popups.
        """
        search = request.data.get("search", "")

        parent_model = self.queryset.model

        try:
            related_field = parent_model._meta.get_field(field_name)
        except FieldDoesNotExist:
            raise ValidationError("Related field not found.")

        related_model = related_field.related_model

        self._check_related_permission(request, related_model)

        custom_filter_method = getattr(
            self._admin_model, f"get_related_{field_name}", None
        )

        if custom_filter_method:
            qs = custom_filter_method(
                search=search,
                form_data=request.data.get("form", {}),
                related_model=related_model,
                request=request,
            )

        else:
            qs = self._get_related_search_queryset(related_model, search)

        serializer = RelatedItemSerializer(qs[:20], many=True)

        return Response(data=serializer.data)

    def _check_related_permission(self, request, related_model):
        """
        Require view permission on the related model. Uses the model's
        model admin when registered, so custom permission overrides
        apply; otherwise falls back to Django's view permission.
        """
        related_admin = admin.site._registry.get(related_model)

        if related_admin is not None:
            if not related_admin.has_view_permission(request):
                raise PermissionDenied("View permission required.")

        elif not request.user.has_perm(
            f"{related_model._meta.app_label}.view_{related_model._meta.model_name}"
        ):
            raise PermissionDenied("View permission required.")

    def _get_related_search_queryset(self, related_model, search):
        """
        Search the related model. Uses the related model admin's
        search_fields when available, mirroring the Django admin;
        otherwise all CharFields are searched.
        """
        if not search:
            return related_model.objects.all()

        related_admin = admin.site._registry.get(related_model)
        search_fields = (
            getattr(related_admin, "search_fields", None) if related_admin else None
        )

        if search_fields:
            queries = [Q(**{f"{field}__icontains": search}) for field in search_fields]
        else:
            char_fields = [
                f.name
                for f in related_model._meta.get_fields()
                if isinstance(f, models.CharField)
            ]
            queries = [Q(**{f"{field}__icontains": search}) for field in char_fields]

        # No searchable fields: nothing can match a search term.
        if not queries:
            return related_model.objects.none()

        combined_query = reduce(operator.or_, queries)

        return related_model.objects.filter(combined_query)
