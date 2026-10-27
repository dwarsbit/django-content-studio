import operator
import uuid
from functools import reduce

from django.contrib.admin.models import LogEntry
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import FieldDoesNotExist
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.parsers import JSONParser
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .actions import get_bulk_actions
from .admin import get_relation_display_for
from .dashboard.activity_log import LogEntrySerializer
from .filters import LookupFilter
from .form import Button
from .permissions import ModelStudioPermissions
from .reordering import get_reorder_scope
from .serializers import RelatedItemSerializer
from .settings import cs_settings
from .signals import (
    CREATED,
    DELETED,
    REORDERED,
    RESTORED,
    UPDATED,
    collect_changes,
    record_change,
)
from .utils import (
    get_tenant_field_name,
    get_tenant_scoped_queryset,
    validate_tenant_access,
)


class BaseModelViewSet(ModelViewSet):
    # The pk under its usual URL name: primary keys need not be called id.
    lookup_field = "pk"
    lookup_url_kwarg = "id"
    is_singleton = False
    parser_classes = [JSONParser]
    renderer_classes = [JSONRenderer]
    permission_classes = [ModelStudioPermissions]
    filter_backends = [SearchFilter, OrderingFilter, LookupFilter]

    def __init__(self, *args, **kwargs):
        # Forward kwargs: action-level overrides (permission_classes,
        # authentication_classes) arrive through the viewset init.
        super(BaseModelViewSet, self).__init__(*args, **kwargs)
        admin_site = cs_settings.ADMIN_SITE

        self.authentication_classes = [
            admin_site.token_backend.active_backend.authentication_class
        ]

    def dispatch(self, request, *args, **kwargs):
        # The request's changes are sent as one content_changed signal.
        with collect_changes(request):
            return super().dispatch(request, *args, **kwargs)

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

        if tenant_model and tenant_field_name:
            # Tenant-scoped models fail closed: the tenant comes from the
            # validated header (the field itself is read-only).
            if not tenant_id:
                raise ValidationError("A tenant is required to create this object.")

            validate_tenant_access(self.request, tenant_id)
            attrs[f"{tenant_field_name}_id"] = tenant_id

        if hasattr(model, cs_settings.CREATED_BY_ATTR):
            attrs[cs_settings.CREATED_BY_ATTR] = self.request.user

        instance = serializer.save(**attrs)

        record_change(self.request, instance, CREATED)

    def perform_update(self, serializer):
        instance = serializer.save()

        # Stamp the editor with a targeted update: a full instance save
        # would race with concurrent edits (lost updates).
        stamp_fields = []

        if hasattr(instance, cs_settings.EDITED_BY_ATTR):
            setattr(instance, cs_settings.EDITED_BY_ATTR, self.request.user)
            stamp_fields.append(cs_settings.EDITED_BY_ATTR)

        if hasattr(instance, cs_settings.EDITED_AT_ATTR):
            setattr(instance, cs_settings.EDITED_AT_ATTR, timezone.now())
            stamp_fields.append(cs_settings.EDITED_AT_ATTR)

        if stamp_fields:
            instance.save(update_fields=stamp_fields)

        record_change(self.request, instance, UPDATED)

    def perform_destroy(self, instance):
        record_change(self.request, instance, DELETED)

        # With soft_delete configured, deleting moves the object to the
        # trash: the field is stamped instead of the row being removed.
        soft_delete_field = self._admin_model.soft_delete
        if soft_delete_field:
            setattr(instance, soft_delete_field, timezone.now())
            instance.save(update_fields=[soft_delete_field])
            return

        instance.delete()

    @action(methods=["get"], detail=False, url_path="trash")
    def trash(self, request):
        """
        The model's trash: the soft-deleted objects, most recently
        deleted first. Only exists when the studio configures
        soft_delete; gated by view permission like the list.
        """
        if not self._admin_model.soft_delete:
            raise NotFound("This model has no trash.")

        return self.list(request)

    @action(methods=["post"], detail=True, url_path="restore")
    def restore(self, request, id):
        """
        Restore a soft-deleted object: clears the soft delete field and
        moves the object back into the lists. Restoring is a change, and
        is gated by change permission on the object.
        """
        soft_delete_field = self._admin_model.soft_delete

        if not soft_delete_field:
            raise NotFound("This model has no trash.")

        instance = self.get_object()
        setattr(instance, soft_delete_field, None)
        instance.save(update_fields=[soft_delete_field])

        record_change(self.request, instance, RESTORED, "Restored from trash.")

        return Response({"id": instance.pk, "__str__": str(instance)})

    @action(methods=["delete"], detail=True, url_path="destroy")
    def destroy_permanently(self, request, id):
        """
        Delete a soft-deleted object permanently, bypassing the trash.
        Gated by delete permission on the object.
        """
        if not self._admin_model.soft_delete:
            raise NotFound("This model has no trash.")

        instance = self.get_object()

        record_change(self.request, instance, DELETED)

        instance.delete()

        return Response(status=204)

    @action(methods=["post"], detail=True, url_path="move")
    def move(self, request, id):
        """
        Move an object to another position in its list: {"after": id},
        {"before": id} or {"position": "first" | "last" | "up" |
        "down"}. The target is resolved among the objects the list shows
        in obj's scope; up and down step past the neighbor in the list as
        filtered by the query parameters, also across pages. The
        studio's reorder hook does the move. Only exists when the
        studio configures reorder_field; gated by change permission on
        the object.
        """
        admin_model = self._admin_model

        if not admin_model.reorder_field:
            raise NotFound("This model cannot be reordered.")

        given = [key for key in ("after", "before", "position") if key in request.data]

        if len(given) != 1:
            raise ValidationError(
                "A move requires exactly one of after, before or position."
            )

        instance = self.get_object()

        # The objects the list shows next to obj: not trashed, in the
        # request's tenant and in obj's scope, in the list's order.
        siblings = self.get_queryset().filter(
            **{
                attname: getattr(instance, attname)
                for attname in get_reorder_scope(admin_model)
            }
        )

        after = before = None
        key = given[0]
        value = request.data[key]

        if key == "position" and value in ("up", "down"):
            # The neighbor in the list the editor sees: filters apply.
            pks = list(self.filter_queryset(siblings).values_list("pk", flat=True))
            index = pks.index(instance.pk) if instance.pk in pks else -1
            neighbor = index + (1 if value == "down" else -1)

            if index != -1 and 0 <= neighbor < len(pks):
                target = siblings.get(pk=pks[neighbor])
                if value == "down":
                    after = target
                else:
                    before = target
        elif key == "position":
            if value not in ("first", "last"):
                raise ValidationError("The position must be first, last, up or down.")

            # Already in place: nothing to move.
            edge = siblings.first() if value == "first" else siblings.last()
            others = siblings.exclude(pk=instance.pk)

            if edge is None or edge.pk == instance.pk:
                pass
            elif value == "first":
                before = others.first()
            else:
                after = others.last()
        else:
            try:
                target = siblings.filter(
                    pk=self._model._meta.pk.to_python(value)
                ).first()
            except DjangoValidationError:
                target = None

            if target is None:
                raise ValidationError("The target is not in this list.")

            if key == "after":
                after = target
            else:
                before = target

        target = after if after is not None else before

        if target is not None and target.pk != instance.pk:
            moved = admin_model.reorder(request, instance, after=after, before=before)
        else:
            moved = False

        if moved is not False:
            record_change(self.request, instance, REORDERED, "Moved.")

        return Response({"id": instance.pk, "__str__": str(instance)})

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
        component = self._find_component(component_id)

        # A button's state: whether this request may see and run it on
        # the object.
        if isinstance(component, Button):
            obj = self.get_object()
            visible = component.is_allowed(self._admin_model, obj, request)

            return Response({"visible": visible})

        # Components without a request handler (like ActivityLog) have no
        # endpoint of their own.
        if not component or not callable(getattr(component, "handle_request", None)):
            raise NotFound()

        return component.handle_request(obj=self.get_object(), request=request)

    @action(
        methods=["post"],
        detail=True,
        url_path="components/(?P<component_id>[^/.]+)/run",
    )
    def run_component(self, request, id, component_id):
        """
        Run a button on the object. Seeing the object is the gate here;
        the button checks its own allowed_permissions and visibility.
        """
        component = self._find_component(component_id)

        if not isinstance(component, Button):
            raise NotFound()

        obj = self.get_object()

        if not component.is_allowed(self._admin_model, obj, request):
            raise PermissionDenied()

        return Response(component.run(obj, request).serialize())

    def _find_component(self, component_id):
        try:
            component_uuid = uuid.UUID(component_id)
        except ValueError:
            raise NotFound()

        return self._admin_model.get_component(component_uuid)

    @action(methods=["get"], detail=True, url_path="activity")
    def activity(self, request, id):
        """
        The object's history: the activity log entries recorded for it,
        most recent first. The studio's equivalent of the Django admin's
        history view, gated by view permission on the object like
        retrieve.
        """
        obj = self.get_object()

        entries = (
            LogEntry.objects.filter(
                content_type=ContentType.objects.get_for_model(obj),
                object_id=obj.pk,
            )
            .select_related("user", "content_type")
            .order_by("-action_time")
        )

        return Response(LogEntrySerializer(entries, many=True).data)

    @action(methods=["post"], detail=False, url_path="bulk")
    def bulk(self, request):
        """
        Run a bulk action on the selected rows: {"action": id,
        "ids": [...]}. The action resolves per request — permissions
        included — and runs on a tenant-scoped queryset of the ids, like
        any list. The handler's return value becomes the response: an
        int is a count, a str a message.
        """
        action_id = request.data.get("action")
        ids = request.data.get("ids")

        if not action_id or not isinstance(ids, list) or not ids:
            raise ValidationError(
                "A bulk action requires an action and a non-empty ids list."
            )

        actions = {
            action.id: action for action in get_bulk_actions(self._admin_model, request)
        }
        action = actions.get(action_id)

        if action is None:
            raise NotFound("Unknown or unauthorized bulk action.")

        try:
            ids = [self._model._meta.pk.to_python(pk) for pk in ids]
        except DjangoValidationError:
            raise ValidationError("The ids must be primary keys of this model.")

        queryset = get_tenant_scoped_queryset(request, self._model).filter(pk__in=ids)

        result = action.handler(request, queryset)

        if isinstance(result, str):
            return Response({"message": result})

        if isinstance(result, int):
            return Response({"count": result})

        return Response({})

    @action(methods=["get"], detail=False, url_path="unique-check")
    def unique_check(self, request):
        """
        Whether another object already uses a value for a unique field:
        ?field=slug&value=hello-world&exclude=<id>. Only single fields
        with unique=True qualify. The lookup is tenant-scoped like the
        list, but includes trashed objects: they still occupy the value
        in the database. The conflicting object is only described when
        the user may view it.
        """
        field_name = request.query_params.get("field", "")
        value = request.query_params.get("value", "")
        exclude = request.query_params.get("exclude")

        try:
            field = self._model._meta.get_field(field_name)
        except FieldDoesNotExist:
            raise ValidationError("Unknown field.")

        if (
            not getattr(field, "concrete", False)
            or field.many_to_many
            or field.primary_key
            or not field.unique
        ):
            raise ValidationError("Only fields with unique=True can be checked.")

        # A value the field cannot hold, or an empty one, conflicts with
        # nothing.
        try:
            value = field.to_python(value)
        except DjangoValidationError:
            return Response({"exists": False})

        if value in field.empty_values:
            return Response({"exists": False})

        # get_queryset scopes to the tenant and leaves trashed objects
        # in for this action.
        qs = self.get_queryset().filter(**{field.attname: value})

        if exclude:
            try:
                qs = qs.exclude(pk=self._model._meta.pk.to_python(exclude))
            except DjangoValidationError:
                pass

        obj = qs.first()

        if obj is None:
            return Response({"exists": False})

        if not self._admin_model.has_view_permission(request, obj):
            return Response({"exists": True})

        display = get_relation_display_for(self._model, obj, request)
        data = {"exists": True, "id": obj.pk, "__str__": display.title}

        soft_delete_field = self._admin_model.soft_delete
        if soft_delete_field and getattr(obj, soft_delete_field) is not None:
            data["trashed"] = True

        return Response(data)

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

        if not related_field.is_relation or related_field.related_model is None:
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

        # Related objects of tenant-scoped models come from the request's
        # tenant only, like any list.
        if isinstance(qs, models.QuerySet):
            qs = get_tenant_scoped_queryset(request, related_model, qs)

        items = []
        for obj in qs[:20]:
            display = get_relation_display_for(related_model, obj, request)
            item = {"id": obj.pk, "__str__": display.title}

            if display.description:
                item["description"] = display.description

            if display.icon:
                item["icon"] = display.icon

            if display.initials:
                item["initials"] = display.initials

            if display.avatar:
                item["avatar"] = display.avatar

            items.append(item)

        serializer = RelatedItemSerializer(items, many=True)

        return Response(data=serializer.data)

    def _check_related_permission(self, request, related_model):
        """
        Require view permission on the related model. Uses the model's
        registered model studio when present, so custom permission
        overrides apply; otherwise falls back to Django's view
        permission.
        """
        related_admin = cs_settings.ADMIN_SITE._registry.get(related_model)

        if related_admin is not None:
            if not related_admin.has_view_permission(request):
                raise PermissionDenied("View permission required.")

        elif not request.user.has_perm(
            f"{related_model._meta.app_label}.view_{related_model._meta.model_name}"
        ):
            raise PermissionDenied("View permission required.")

    def _get_related_search_queryset(self, related_model, search):
        """
        Search the related model. Uses the related model studio's
        search_fields when available; otherwise all CharFields are
        searched.
        """
        if not search:
            return related_model.objects.all()

        related_admin = cs_settings.ADMIN_SITE._registry.get(related_model)
        search_fields = related_admin.search_fields if related_admin else None

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
