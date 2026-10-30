from django.db import router, transaction
from django.db.models import Q
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models.deletion import Collector
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import SAFE_METHODS, DjangoModelPermissions
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from content_studio.paginators import ContentPagination
from content_studio.exceptions import NotConfigured
from content_studio.settings import cs_settings
from content_studio.signals import (
    CREATED,
    DELETED,
    UPDATED,
    collect_changes,
    record_change,
)
from .metadata import get_metadata_values
from .serializers import build_media_folder_serializer, build_media_item_serializer

# The bulk actions offered on the items endpoint.
BULK_ACTION_DELETE = "delete"
BULK_ACTION_MOVE = "move"
BULK_ACTION_NAMES = (BULK_ACTION_DELETE, BULK_ACTION_MOVE)


def to_folder_pk(model, field_name, value):
    """
    Cast a folder id from the request to the type of the folder
    relation's target. A malformed id names no folder: NotFound.
    """
    try:
        return model._meta.get_field(field_name).target_field.to_python(value)
    except (DjangoValidationError, ValueError, TypeError):
        raise NotFound("Unknown folder.")


def can_view(user, model) -> bool:
    """View or change permission on the model, like the content lists."""
    opts = model._meta

    return user.has_perm(f"{opts.app_label}.view_{opts.model_name}") or user.has_perm(
        f"{opts.app_label}.change_{opts.model_name}"
    )


class MediaLibraryPermissions(DjangoModelPermissions):
    """
    Django's model permissions, with the bulk endpoint gated on view
    only: the actions enforce their own permissions (delete for
    deleting, change for moving), mirroring the content bulk
    endpoint. Cropping is gated on change: DjangoModelPermissions
    would map the crop action's POST to the add permission. Reading
    requires view (or change) permission, which DjangoModelPermissions
    does not check.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            media_model = view.get_media_model()

            # Unconfigured: the base class reports it (NotConfigured).
            if media_model is None:
                return super().has_permission(request, view)

            return can_view(request.user, media_model)

        if getattr(view, "action", None) == "bulk":
            media_model = view.get_media_model()

            if media_model is None:
                return False

            return request.user.has_perm(
                f"{media_model._meta.app_label}.view_{media_model._meta.model_name}"
            )

        if getattr(view, "action", None) == "crop":
            media_model = view.get_media_model()

            if media_model is None:
                return False

            return request.user.has_perm(
                f"{media_model._meta.app_label}.change_{media_model._meta.model_name}"
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

    def dispatch(self, request, *args, **kwargs):
        # The request's changes are sent as one content_changed signal.
        with collect_changes(request):
            return super().dispatch(request, *args, **kwargs)

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
                qs = qs.filter(folder=to_folder_pk(model, "folder", folder))

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

    def get_metadata_values(self, serializer) -> dict:
        """The metadata of an uploaded file, read before it is saved."""
        data = serializer.validated_data
        media_type = data.get("type", getattr(serializer.instance, "type", None))

        return get_metadata_values(data.get("file"), media_type)

    def perform_create(self, serializer):
        obj = serializer.save(**self.get_metadata_values(serializer))
        record_change(self.request, obj, CREATED)

    def perform_update(self, serializer):
        # A replaced file is removed from storage once the change is
        # committed; the previous name is read before the save replaces
        # it. A file field by another name is not the item's upload.
        previous = getattr(serializer.instance, "file", None)
        previous_name = previous.name if previous else None

        obj = serializer.save(**self.get_metadata_values(serializer))
        record_change(self.request, obj, UPDATED)

        if previous_name and obj.file.name != previous_name:
            storage = previous.storage
            transaction.on_commit(
                lambda: storage.delete(previous_name),
                using=router.db_for_write(type(obj)),
            )

    def perform_destroy(self, instance):
        using = router.db_for_write(type(instance))

        # Logged first, as deleting clears the pk.
        with transaction.atomic(using=using):
            record_change(self.request, instance, DELETED)
            instance.delete()

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
        case-insensitively — the options for the tags filter. The
        database returns the distinct, non-null values of the field;
        splitting them into tags happens in Python, so it works over
        any tags field shape (a list field or a plain string) on every
        database backend. A model without a tags field yields an empty
        list.
        """
        model = self.get_media_model()

        if not model:
            raise NotFound("The media library model is not defined.")

        field_names = {field.name for field in model._meta.get_fields()}

        if "tags" not in field_names:
            return Response([])

        # order_by() clears the default ordering: ordered by pk, every
        # row would be distinct.
        values = (
            model.objects.exclude(tags__isnull=True)
            .order_by()
            .values_list("tags", flat=True)
            .distinct()
        )
        tags = set()

        for value in values.iterator():
            if isinstance(value, (list, tuple)):
                tags.update(str(tag) for tag in value if tag)
            elif value:
                tags.add(str(value))

        return Response(sorted(tags, key=lambda tag: (tag.lower(), tag)))

    @action(methods=["post"], detail=True, url_path="crop")
    def crop(self, request, id=None):
        """
        Apply a crop to a media item: {"crop": {...}}. The crop info is
        handed to the admin site's crop_image(obj, crop_info) hook,
        which decides what cropping means for the project — it is only
        offered when the site defines the method. Returns the updated
        item, so the frontend can refresh the thumbnail.
        """
        model = self.get_media_model()

        if not model:
            raise NotFound("The media library model is not defined.")

        crop_image = getattr(cs_settings.ADMIN_SITE, "crop_image", None)

        if not callable(crop_image):
            raise NotConfigured(
                "Cropping requires a crop_image(obj, crop_info) method on "
                "the admin site."
            )

        crop_info = request.data.get("crop", None)

        if not isinstance(crop_info, dict) or not crop_info:
            raise ValidationError(
                "A crop requires a non-empty crop info object, like "
                '{"x": 0, "y": 0, "width": 50, "height": 50, "unit": "%"}.'
            )

        obj = self.get_object()
        crop_image(obj, crop_info)
        record_change(request, obj, UPDATED, "Cropped.")

        return Response(self.get_serializer(obj).data)

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

        try:
            ids = [model._meta.pk.to_python(pk) for pk in ids]
        except DjangoValidationError:
            raise ValidationError("The ids must be primary keys of media items.")

        objects = list(model.objects.filter(pk__in=ids))

        if action_name == BULK_ACTION_MOVE:
            folder_id = request.data.get("folder", None)
            folder_model = cs_settings.MEDIA_LIBRARY_FOLDER_MODEL

            if folder_id:
                if folder_model is None:
                    raise ValidationError("The media library has no folders.")

                try:
                    folder_id = folder_model._meta.pk.to_python(folder_id)
                except DjangoValidationError:
                    raise NotFound("Unknown folder.")

                if not folder_model.objects.filter(pk=folder_id).exists():
                    raise NotFound("Unknown folder.")

            model.objects.filter(pk__in=ids).update(folder_id=folder_id)

            for obj in objects:
                record_change(request, obj, UPDATED, "Moved.")

            return Response({"count": len(objects)})

        # Deleting through the collector fires deletion signals, like
        # the content bulk delete; logged first, as deleting clears the
        # objects' pks.
        using = router.db_for_write(model)

        with transaction.atomic(using=using):
            for obj in objects:
                record_change(request, obj, DELETED)

            collector = Collector(using=using)
            collector.collect(objects)
            collector.delete()

        return Response({"count": len(objects)})


def _collected(collector, models):
    """The instances of the given models a collector will delete,
    including the ones it deletes in bulk, ordered per model by pk."""
    objects = []

    for model, instances in collector.data.items():
        if model in models:
            objects.extend(sorted(instances, key=lambda obj: obj.pk))

    for queryset in collector.fast_deletes:
        if queryset.model in models:
            objects.extend(queryset.order_by("pk"))

    return objects


class MediaFolderPermissions(DjangoModelPermissions):
    """
    Django's model permissions, with reading gated on view (or change)
    permission: folders are the media library's navigation, so view
    permission on either the folders or the media items opens them.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            folder_model = cs_settings.MEDIA_LIBRARY_FOLDER_MODEL
            media_model = cs_settings.MEDIA_LIBRARY_MODEL

            # Unconfigured: the base class reports it (NotConfigured).
            if folder_model is None:
                return super().has_permission(request, view)

            return can_view(request.user, folder_model) or bool(
                media_model and can_view(request.user, media_model)
            )

        return super().has_permission(request, view)


class MediaFolderViewSet(ModelViewSet):
    _folder_model = None
    lookup_field = "id"
    parser_classes = [JSONParser]
    renderer_classes = [JSONRenderer]
    permission_classes = [MediaFolderPermissions]
    filter_backends = [SearchFilter, OrderingFilter]
    pagination_class = ContentPagination

    def __init__(self, *args, **kwargs):
        # Forward kwargs: action-level overrides arrive through the viewset init.
        super(MediaFolderViewSet, self).__init__(*args, **kwargs)

        admin_site = cs_settings.ADMIN_SITE

        self.authentication_classes = [
            admin_site.token_backend.active_backend.authentication_class
        ]

    def dispatch(self, request, *args, **kwargs):
        # The request's changes are sent as one content_changed signal.
        with collect_changes(request):
            return super().dispatch(request, *args, **kwargs)

    def perform_create(self, serializer):
        record_change(self.request, serializer.save(), CREATED)

    def perform_update(self, serializer):
        record_change(self.request, serializer.save(), UPDATED)

    def perform_destroy(self, instance):
        """
        Delete a folder with what cascades from it. The subfolders and
        media items deleted with it are recorded too, so their deletion
        reaches the history and content_changed; all of it is logged
        first, as deleting clears the pks.
        """
        using = router.db_for_write(type(instance))
        recorded = {type(instance), cs_settings.MEDIA_LIBRARY_MODEL}

        with transaction.atomic(using=using):
            collector = Collector(using=using)
            collector.collect([instance])

            record_change(self.request, instance, DELETED)

            for obj in _collected(collector, recorded):
                if obj != instance:
                    record_change(
                        self.request, obj, DELETED, "Deleted with its folder."
                    )

            collector.delete()

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
        return qs.filter(parent=to_folder_pk(self._folder_model, "parent", parent))

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
            folder_id = self._folder_model._meta.pk.to_python(folder_id)
        except (DjangoValidationError, ValueError, TypeError):
            raise NotFound("Unknown folder.")

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
