from django.contrib.admin.models import LogEntry, DELETION
from django.contrib.contenttypes.models import ContentType
from django.db import router
from django.db.models import Q
from django.db.models.deletion import Collector
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import DjangoModelPermissions
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from content_studio.paginators import ContentPagination
from content_studio.exceptions import NotConfigured
from content_studio.settings import cs_settings
from .serializers import build_media_folder_serializer, build_media_item_serializer

# The bulk actions offered on the items endpoint.
BULK_ACTION_DELETE = "delete"
BULK_ACTION_MOVE = "move"
BULK_ACTION_NAMES = (BULK_ACTION_DELETE, BULK_ACTION_MOVE)


class MediaLibraryPermissions(DjangoModelPermissions):
    """
    Django's model permissions, with the bulk endpoint gated on view
    only: the actions enforce their own permissions (delete for
    deleting, change for moving), mirroring the content bulk
    endpoint.
    """

    def has_permission(self, request, view):
        if getattr(view, "action", None) == "bulk":
            media_model = view.get_media_model()

            if media_model is None:
                return False

            return request.user.has_perm(
                f"{media_model._meta.app_label}.view_{media_model._meta.model_name}"
            )

        return super().has_permission(request, view)


class MediaLibraryViewSet(ModelViewSet):
    _media_model = None
    lookup_field = "id"
    parser_classes = [JSONParser, MultiPartParser]
    renderer_classes = [JSONRenderer]
    permission_classes = [MediaLibraryPermissions]
    filter_backends = [SearchFilter, OrderingFilter]
    pagination_class = ContentPagination
    search_fields = ["name", "tags"]

    def __init__(self, *args, **kwargs):
        # Forward kwargs: action-level overrides arrive through the viewset init.
        super(MediaLibraryViewSet, self).__init__(*args, **kwargs)

        admin_site = cs_settings.ADMIN_SITE

        self.authentication_classes = [
            admin_site.token_backend.active_backend.authentication_class
        ]

    def get_media_model(self):
        if not self._media_model:
            self._media_model = cs_settings.MEDIA_LIBRARY_MODEL

        return self._media_model

    def get_queryset(self):
        model = self.get_media_model()

        if not model:
            raise NotConfigured("The media library model is not defined.")

        # Ordering is restricted to the fields the configured model
        # actually carries, and set before the filter backends run so
        # the OrderingFilter sees them.
        model_field_names = {field.name for field in model._meta.get_fields()}
        self.ordering_fields = [
            field
            for field in ("name", "type", "size", "tags")
            if field in model_field_names
        ] + ["pk"]

        qs = model.objects.all().order_by("-pk")

        folder = self.request.query_params.get("folder", None)
        types = self.get_list_param("type")
        tags = self.get_list_param("tags")

        if folder:
            if folder == "root":
                qs = qs.filter(folder__isnull=True)
            else:
                qs = qs.filter(folder=folder)

        if types:
            qs = qs.filter(type__in=types)

        # Tags match case-insensitively, any-of — the same match the
        # search runs, over the field's text representation, so it
        # works for every tags field shape.
        if tags:
            tags_query = Q()

            for tag in tags:
                tags_query |= Q(**{f"tags__icontains": tag})

            qs = qs.filter(tags_query)

        return qs

    def get_serializer_class(self):
        if self._media_model:
            return build_media_item_serializer(self._media_model)

        raise NotConfigured("The media library model is not defined.")

    def get_list_param(self, name):
        """A comma-separated query parameter as a list of values."""
        raw = self.request.query_params.get(name, None)

        if not raw:
            return []

        return [value.strip() for value in raw.split(",") if value.strip()]

    @action(methods=["get"], detail=False, url_path="tags")
    def tags(self, request):
        """
        The unique tags currently on the media items, sorted
        case-insensitively — the options for the tags filter.
        Aggregated in Python, so it works over any tags field shape
        and on every database backend. A model without a tags field
        yields an empty list.
        """
        model = self.get_media_model()

        if not model:
            raise NotFound("The media library model is not defined.")

        field_names = {field.name for field in model._meta.get_fields()}

        if "tags" not in field_names:
            return Response([])

        tags = set()

        for value in model.objects.values_list("tags", flat=True).iterator():
            if isinstance(value, (list, tuple)):
                tags.update(str(tag) for tag in value if tag)
            elif value:
                tags.add(str(value))

        return Response(sorted(tags, key=lambda tag: (tag.lower(), tag)))

    @action(methods=["post"], detail=False, url_path="bulk")
    def bulk(self, request):
        """
        Run a bulk action on the selected media items:
        {"action": "delete" | "move", "ids": [...], "folder": id?}.

        Deleting is gated on delete permission, moving on change
        permission; both act on all ids at once and return the number
        of affected items. A move without a folder moves the items to
        the root.
        """
        model = self.get_media_model()

        if not model:
            raise NotFound("The media library model is not defined.")

        action_name = request.data.get("action")
        ids = request.data.get("ids")

        if action_name not in BULK_ACTION_NAMES or not isinstance(ids, list) or not ids:
            raise ValidationError(
                "A bulk action requires delete or move and a non-empty ids list."
            )

        perm = f"{model._meta.app_label}.{action_name}_{model._meta.model_name}"

        if not request.user.has_perm(perm):
            raise PermissionDenied(
                f"The {action_name} permission is required for this action."
            )

        objects = list(model.objects.filter(pk__in=ids))

        if action_name == BULK_ACTION_MOVE:
            folder_id = request.data.get("folder", None)
            folder_model = cs_settings.MEDIA_LIBRARY_FOLDER_MODEL

            if folder_id and folder_model:
                if not folder_model.objects.filter(pk=folder_id).exists():
                    raise NotFound("Unknown folder.")

            model.objects.filter(pk__in=ids).update(folder_id=folder_id)

            return Response({"count": len(objects)})

        # Deleting through the collector fires deletion signals, like
        # the content bulk delete.
        collector = Collector(using=router.db_for_write(model))
        collector.collect(objects)
        collector.delete()

        content_type = ContentType.objects.get_for_model(model)

        for obj in objects:
            LogEntry.objects.create(
                user=request.user,
                action_flag=DELETION,
                content_type=content_type,
                object_id=obj.pk,
                object_repr=str(obj)[:200],
                change_message="",
            )

        return Response({"count": len(objects)})


class MediaFolderViewSet(ModelViewSet):
    _folder_model = None
    lookup_field = "id"
    parser_classes = [JSONParser]
    renderer_classes = [JSONRenderer]
    permission_classes = [DjangoModelPermissions]
    filter_backends = [SearchFilter, OrderingFilter]
    pagination_class = ContentPagination

    def __init__(self, *args, **kwargs):
        # Forward kwargs: action-level overrides arrive through the viewset init.
        super(MediaFolderViewSet, self).__init__(*args, **kwargs)

        admin_site = cs_settings.ADMIN_SITE

        self.authentication_classes = [
            admin_site.token_backend.active_backend.authentication_class
        ]

    def get_queryset(self):
        if not self._folder_model:
            self._folder_model = cs_settings.MEDIA_LIBRARY_FOLDER_MODEL

        if not self._folder_model:
            raise NotConfigured("The media folder model is not defined.")

        parent = self.request.query_params.get("parent", None)
        qs = self._folder_model.objects.all()

        if self.action != "list":
            return qs

        # The list endpoint is always within the scope of a folder
        if not parent:
            return qs.filter(parent__isnull=True)
        return qs.filter(parent=parent)

    def get_serializer_class(self):
        if self._folder_model:
            return build_media_folder_serializer(self._folder_model)

        raise NotConfigured("The media folder model is not defined.")

    @action(methods=["get"], detail=False, url_path="path")
    def get(self, request, *args, **kwargs):

        if not self._folder_model:
            self._folder_model = cs_settings.MEDIA_LIBRARY_FOLDER_MODEL

        if not self._folder_model:
            raise NotConfigured("The media folder model is not defined.")

        folder_id = request.query_params.get("folder", None)

        if not folder_id:
            return Response(data=[])

        try:
            folder = self._folder_model.objects.get(pk=folder_id)
            path = []
            seen = set()
            while folder and folder.pk not in seen:
                # seen guards against cyclic folder data: a loop would
                # otherwise never terminate.
                seen.add(folder.pk)
                path.insert(0, folder)
                folder = folder.parent

            return Response(
                data=build_media_folder_serializer(self._folder_model)(
                    path, many=True
                ).data
            )
        except self._folder_model.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
