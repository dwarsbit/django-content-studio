"""
Tests for the media library viewsets.
"""

import pytest
from django.db import models
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, APIClient

from content_studio.exceptions import NotConfigured
from content_studio.media_library.viewsets import (
    MediaFolderViewSet,
    MediaLibraryViewSet,
)
from content_studio.serializers import RelatedItemSerializer


class FolderModel(models.Model):
    name = models.CharField(max_length=10)
    parent = models.ForeignKey(
        "self", null=True, on_delete=models.CASCADE, related_name="children"
    )

    class Meta:
        app_label = "content_studio"


class IntPkItem:
    def __init__(self, id, name):
        self.id = id
        self.name = name

    def __str__(self):
        return self.name


def test_unconfigured_media_model_raises_not_configured():
    viewset = MediaLibraryViewSet()

    with pytest.raises(NotConfigured) as exc_info:
        viewset.get_serializer_class()

    assert exc_info.value.status_code == 501
    assert "media library model" in str(exc_info.value.detail)


@pytest.mark.django_db
def test_unconfigured_media_model_returns_501():
    """Through the API the status is 501 Not Implemented, not 405."""
    from django.contrib.auth import models as auth_models
    from rest_framework_simplejwt.tokens import RefreshToken

    user = auth_models.User.objects.create_user(
        username="staff", email="s@example.com", password="x"
    )
    token = str(RefreshToken.for_user(user).access_token)

    client = APIClient()
    response = client.get(
        "/api/media-library/items", HTTP_AUTHORIZATION=f"Bearer {token}"
    )

    assert response.status_code == 501


def test_media_serializer_fields_hook_restricts_fields():
    """AdminSite.get_media_serializer_fields controls the exposure."""
    from content_studio.admin import admin_site
    from content_studio.media_library.serializers import (
        build_media_item_serializer,
    )

    original = admin_site.get_media_serializer_fields

    try:
        admin_site.get_media_serializer_fields = lambda media_model: ["id", "name"]
        serializer_class = build_media_item_serializer(FolderModel)

        assert serializer_class.Meta.fields == ["id", "name"]
    finally:
        admin_site.get_media_serializer_fields = original


def test_media_serializer_fields_default_is_all():
    from content_studio.admin import admin_site
    from content_studio.media_library.serializers import (
        build_media_item_serializer,
    )

    assert admin_site.get_media_serializer_fields(FolderModel) == "__all__"
    assert build_media_item_serializer(FolderModel).Meta.fields == "__all__"


def test_related_item_serializer_is_pk_agnostic():
    """Models are free to use integer or string primary keys."""
    int_pk = RelatedItemSerializer(IntPkItem(3, "int")).data
    str_pk = RelatedItemSerializer(IntPkItem("abc", "str")).data

    assert int_pk == {"id": "3", "__str__": "int"}
    assert str_pk == {"id": "abc", "__str__": "str"}


@pytest.mark.django_db
def test_folder_path_survives_cyclic_data():
    """A cyclic folder chain no longer loops forever."""
    from django.test import override_settings

    from content_studio.settings import cs_settings

    f1 = FolderModel.objects.create(name="one")
    f2 = FolderModel.objects.create(name="two")
    f1.parent = f2
    f1.save()
    f2.parent = f1  # cycle!
    f2.save()

    with override_settings(
        CONTENT_STUDIO={
            "ADMIN_SITE": "content_studio.admin.admin_site",
            "MEDIA_LIBRARY_FOLDER_MODEL": "test_media_library.FolderModel",
        }
    ):
        assert cs_settings.MEDIA_LIBRARY_FOLDER_MODEL is FolderModel

        viewset = MediaFolderViewSet()
        request = Request(APIRequestFactory().get("/?folder=1"), parsers=[JSONParser()])

        response = viewset.get(request)

        data = response.data
        assert [folder["name"] for folder in data] == ["two", "one"]
