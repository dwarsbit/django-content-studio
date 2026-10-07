from rest_framework import status
from rest_framework.decorators import action
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


class MediaLibraryViewSet(ModelViewSet):
    _media_model = None
    lookup_field = "id"
    parser_classes = [JSONParser, MultiPartParser]
    renderer_classes = [JSONRenderer]
    permission_classes = [DjangoModelPermissions]
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

    def get_queryset(self):
        if not self._media_model:
            self._media_model = cs_settings.MEDIA_LIBRARY_MODEL

        if not self._media_model:
            raise NotConfigured("The media library model is not defined.")

        folder = self.request.query_params.get("folder", None)
        search = self.request.query_params.get("search", None)
        qs = self._media_model.objects.all()

        if folder:
            if folder == "root":
                return qs.filter(folder__isnull=True)
            return qs.filter(folder=folder)

        return qs

    def get_serializer_class(self):
        if self._media_model:
            return build_media_item_serializer(self._media_model)

        raise NotConfigured("The media library model is not defined.")


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
