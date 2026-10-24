"""
Tests for the media library viewsets.
"""

import pytest
from django.contrib.auth import models as auth_models
from django.core.files.base import ContentFile
from django.test import override_settings
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
from content_studio.token_backends.jwt import create_access_token


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

    from content_studio.token_backends.jwt import create_access_token

    user = auth_models.User.objects.create_user(
        username="staff", email="s@example.com", password="x", is_staff=True
    )
    token = create_access_token(user)

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


class ItemModel(models.Model):
    """The media model contract: name, list-typed tags, type, file,
    folder — plus the optional size."""

    name = models.CharField(max_length=100)
    tags = models.JSONField(default=list, blank=True)
    type = models.CharField(max_length=10)
    file = models.FileField(upload_to="media/", blank=True)
    folder = models.ForeignKey(
        FolderModel, null=True, blank=True, on_delete=models.SET_NULL
    )
    size = models.IntegerField(default=0)

    class Meta:
        app_label = "content_studio"

    def __str__(self):
        return self.name


MEDIA_SETTINGS = {
    "ADMIN_SITE": "content_studio.admin.admin_site",
    "MEDIA_LIBRARY_MODEL": "test_media_library.ItemModel",
    "MEDIA_LIBRARY_FOLDER_MODEL": "test_media_library.FolderModel",
}


@pytest.fixture
def media_settings():
    """Configure the media library models for the test. Django's
    override_settings sends setting_changed, which cs_settings listens
    for — pytest-django's settings fixture would not."""
    with override_settings(CONTENT_STUDIO=MEDIA_SETTINGS):
        yield


def media_client(user):
    client = APIClient()
    token = create_access_token(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.mark.django_db
def test_items_filter_by_type(media_settings):
    user = make_superuser()
    ItemModel.objects.create(name="clip one", type="video")
    ItemModel.objects.create(name="doc", type="file")
    ItemModel.objects.create(name="audio", type="audio")

    response = media_client(user).get(
        "/api/media-library/items", {"type": "video,audio"}
    )

    assert response.status_code == 200
    names = [item["name"] for item in response.json()["results"]]
    assert sorted(names) == ["audio", "clip one"]


@pytest.mark.django_db
def test_items_filter_by_tags_any_of(media_settings):
    user = make_superuser()
    ItemModel.objects.create(name="a", type="video", tags=["hero"])
    ItemModel.objects.create(name="b", type="video", tags=["summer"])
    ItemModel.objects.create(name="c", type="video", tags=["winter"])

    response = media_client(user).get(
        "/api/media-library/items", {"tags": "hero,summer"}
    )

    assert response.status_code == 200
    names = [item["name"] for item in response.json()["results"]]
    assert sorted(names) == ["a", "b"]


@pytest.mark.django_db
def test_items_order_by_name_and_size(media_settings):
    user = make_superuser()
    ItemModel.objects.create(name="beta", type="file", size=5)
    ItemModel.objects.create(name="alpha", type="file", size=10)

    by_name = media_client(user).get("/api/media-library/items", {"ordering": "name"})
    by_size = media_client(user).get("/api/media-library/items", {"ordering": "-size"})

    assert [i["name"] for i in by_name.json()["results"]] == ["alpha", "beta"]
    assert [i["size"] for i in by_size.json()["results"]] == [10, 5]


@pytest.mark.django_db
def test_items_default_to_newest_first(media_settings):
    """Stable pagination: without an ordering param, newest first."""
    user = make_superuser()
    for i in range(3):
        ItemModel.objects.create(name=f"item {i}", type="file")

    response = media_client(user).get("/api/media-library/items")

    names = [item["name"] for item in response.json()["results"]]
    assert names == ["item 2", "item 1", "item 0"]


@pytest.mark.django_db
def test_bulk_delete_removes_items_and_logs(media_settings):
    user = make_superuser()
    keep = ItemModel.objects.create(name="keep", type="file")
    gone = ItemModel.objects.create(name="gone", type="file")

    response = media_client(user).post(
        "/api/media-library/items/bulk",
        {"action": "delete", "ids": [gone.pk]},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert list(ItemModel.objects.values_list("pk", flat=True)) == [keep.pk]


@pytest.mark.django_db
def test_bulk_move_moves_items_to_the_folder(media_settings):
    user = make_superuser()
    folder = FolderModel.objects.create(name="target")
    one = ItemModel.objects.create(name="one", type="file")
    two = ItemModel.objects.create(name="two", type="file")

    response = media_client(user).post(
        "/api/media-library/items/bulk",
        {"action": "move", "ids": [one.pk, two.pk], "folder": folder.pk},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["count"] == 2
    assert sorted(ItemModel.objects.values_list("folder", flat=True)) == [
        folder.pk,
        folder.pk,
    ]

    # Moving without a folder moves to the root.
    response = media_client(user).post(
        "/api/media-library/items/bulk",
        {"action": "move", "ids": [one.pk]},
        format="json",
    )
    assert ItemModel.objects.get(pk=one.pk).folder is None


@pytest.mark.django_db
def test_bulk_move_to_unknown_folder_returns_404(media_settings):
    user = make_superuser()
    item = ItemModel.objects.create(name="one", type="file")

    response = media_client(user).post(
        "/api/media-library/items/bulk",
        {"action": "move", "ids": [item.pk], "folder": 12345},
        format="json",
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_bulk_requires_permissions(media_settings):
    """The bulk endpoint gates on view; the actions on their own
    permissions."""
    staff = auth_models.User.objects.create_user(
        username="staff", password="x", is_staff=True
    )
    item = ItemModel.objects.create(name="one", type="file")

    # Without view permission, the endpoint is closed off entirely.
    response = media_client(staff).post(
        "/api/media-library/items/bulk",
        {"action": "delete", "ids": [item.pk]},
        format="json",
    )
    assert response.status_code == 403

    # Invalid payloads are reported.
    response = media_client(make_superuser()).post(
        "/api/media-library/items/bulk", {"action": "nope", "ids": [1]}, format="json"
    )
    assert response.status_code == 400

    # A missing permission for the specific action is denied.
    viewer = auth_models.User.objects.create_user(
        username="viewer", password="x", is_staff=True
    )
    viewer.user_permissions.set(
        [
            auth_models.Permission.objects.get(
                content_type__app_label="content_studio", codename="view_itemmodel"
            )
        ]
    )
    response = media_client(viewer).post(
        "/api/media-library/items/bulk",
        {"action": "delete", "ids": [item.pk]},
        format="json",
    )
    assert response.status_code == 403
    assert ItemModel.objects.filter(pk=item.pk).exists()


@pytest.mark.django_db
def test_folders_carry_item_counts(media_settings):
    user = make_superuser()
    folder = FolderModel.objects.create(name="one")
    FolderModel.objects.create(name="two", parent=folder)
    ItemModel.objects.create(name="a", type="file", folder=folder)
    ItemModel.objects.create(name="b", type="file", folder=folder)

    response = media_client(user).get("/api/media-library/folders")

    assert response.status_code == 200
    results = response.json()["results"]
    assert [folder["count"] for folder in results] == [2]


def make_superuser():
    from django.contrib.auth import models as auth_models

    from content_studio.token_backends.jwt import create_access_token

    user = auth_models.User.objects.create_superuser(username="admin", password="x")
    return user


@pytest.mark.django_db
def test_tags_endpoint_lists_unique_tags_sorted(media_settings):
    make_superuser()
    ItemModel.objects.create(name="a", type="video", tags=["Hero", "summer"])
    ItemModel.objects.create(name="b", type="video", tags=["hero", "winter"])
    ItemModel.objects.create(name="c", type="video", tags=["summer"])

    response = media_client(auth_models.User.objects.get(username="admin")).get(
        "/api/media-library/items/tags"
    )

    assert response.status_code == 200
    # Unique case-sensitively, sorted case-insensitively.
    assert response.json() == ["Hero", "hero", "summer", "winter"]


@pytest.mark.django_db
def test_tags_endpoint_handles_plain_tag_values(media_settings):
    """A tags field holding plain strings yields those as options."""
    make_superuser()
    ItemModel.objects.create(name="a", type="video", tags="banner")

    response = media_client(auth_models.User.objects.get(username="admin")).get(
        "/api/media-library/items/tags"
    )

    assert response.status_code == 200
    assert response.json() == ["banner"]


@pytest.mark.django_db
def test_tags_endpoint_requires_authentication(media_settings):
    """Reads are open to authenticated users, like the media list
    itself; anonymous requests are rejected."""
    response = APIClient().get("/api/media-library/items/tags")

    assert response.status_code == 401


CROP_INFO = {"x": "10.00", "y": "20.00", "width": "50.00", "height": "40.00"}


@pytest.mark.django_db
def test_crop_without_site_hook_returns_501(media_settings):
    """Cropping is only offered when the admin site defines
    crop_image(obj, crop_info)."""
    item = ItemModel.objects.create(name="one", type="image")

    response = media_client(make_superuser()).post(
        f"/api/media-library/items/{item.pk}/crop",
        {"crop": CROP_INFO},
        format="json",
    )

    assert response.status_code == 501


@pytest.mark.django_db
def test_crop_validates_the_payload(media_settings):
    """A crop requires a non-empty crop info object."""
    from content_studio.admin import admin_site

    item = ItemModel.objects.create(name="one", type="image")
    admin_site.crop_image = lambda obj, crop_info: None

    try:
        client = media_client(make_superuser())
        assert (
            client.post(
                f"/api/media-library/items/{item.pk}/crop", {}, format="json"
            ).status_code
            == 400
        )
        assert (
            client.post(
                f"/api/media-library/items/{item.pk}/crop",
                {"crop": {}},
                format="json",
            ).status_code
            == 400
        )
    finally:
        del admin_site.crop_image


@pytest.mark.django_db
def test_crop_applies_through_the_site_hook(media_settings):
    """The crop info is handed to crop_image(obj, crop_info); how
    cropping is done is up to the site. The response carries the
    updated item."""
    from content_studio.admin import admin_site

    calls = []
    admin_site.crop_image = lambda obj, crop_info: calls.append((obj, crop_info))

    try:
        item = ItemModel.objects.create(
            name="one",
            type="image",
            file=ContentFile(b"image", name="one.png"),
        )

        response = media_client(make_superuser()).post(
            f"/api/media-library/items/{item.pk}/crop",
            {"crop": CROP_INFO},
            format="json",
        )

        assert response.status_code == 200
        assert calls == [(item, CROP_INFO)]
        assert response.json()["id"] == item.pk
    finally:
        del admin_site.crop_image


@pytest.mark.django_db
def test_crop_requires_change_permission(media_settings):
    """Cropping is gated on the change permission, not the add
    permission DjangoModelPermissions would map a POST to."""
    from content_studio.admin import admin_site

    calls = []
    admin_site.crop_image = lambda obj, crop_info: calls.append((obj, crop_info))

    try:
        item = ItemModel.objects.create(name="one", type="image")

        viewer = auth_models.User.objects.create_user(
            username="viewer", password="x", is_staff=True
        )
        viewer.user_permissions.set(
            [
                auth_models.Permission.objects.get(
                    content_type__app_label="content_studio",
                    codename="view_itemmodel",
                )
            ]
        )

        response = media_client(viewer).post(
            f"/api/media-library/items/{item.pk}/crop",
            {"crop": CROP_INFO},
            format="json",
        )

        assert response.status_code == 403
        assert calls == []
    finally:
        del admin_site.crop_image


# --- Upload policy -----------------------------------------------------------

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def upload(user, name, content, **settings_overrides):
    from django.core.files.uploadedfile import SimpleUploadedFile

    with override_settings(CONTENT_STUDIO={**MEDIA_SETTINGS, **settings_overrides}):
        return media_client(user).post(
            "/api/media-library/items",
            {
                "name": name,
                "type": "image",
                "file": SimpleUploadedFile(name, content),
            },
            format="multipart",
        )


@pytest.fixture
def media_root(tmp_path):
    with override_settings(MEDIA_ROOT=str(tmp_path)):
        yield tmp_path


@pytest.mark.django_db
def test_allowed_uploads_are_stored(media_root):
    response = upload(make_superuser(), "photo.PNG", PNG_BYTES)

    assert response.status_code == 201, response.content
    assert ItemModel.objects.count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize(
    "name, content",
    [
        ("drawing.svg", b"<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
        ("page.html", b"<html><script>alert(1)</script></html>"),
        ("no-extension", PNG_BYTES),
        # Markup in disguise: the extension is allowed, the content is not.
        ("photo.png", b"\xef\xbb\xbf  <script>alert(1)</script>"),
        ("notes.txt", b"\n<!doctype html><html></html>"),
    ],
)
def test_disallowed_uploads_are_rejected(media_root, name, content):
    response = upload(make_superuser(), name, content)

    assert response.status_code == 400
    assert "file" in response.json()
    assert not ItemModel.objects.exists()


@pytest.mark.django_db
def test_uploads_over_the_size_limit_are_rejected(media_root):
    response = upload(
        make_superuser(), "photo.png", PNG_BYTES, MEDIA_LIBRARY_MAX_UPLOAD_SIZE=10
    )

    assert response.status_code == 400
    assert "larger than" in response.json()["file"][0]


@pytest.mark.django_db
def test_upload_policy_can_be_opened_up(media_root):
    response = upload(
        make_superuser(),
        "archive.zip",
        b"PK\x03\x04",
        MEDIA_LIBRARY_ALLOWED_EXTENSIONS=None,
        MEDIA_LIBRARY_MAX_UPLOAD_SIZE=None,
    )

    assert response.status_code == 201


def staff_with_media_perms(*codenames):
    user = auth_models.User.objects.create_user(
        username="staff", password="x", is_staff=True
    )
    user.user_permissions.set(
        auth_models.Permission.objects.filter(
            content_type__app_label="content_studio", codename__in=codenames
        )
    )
    return auth_models.User.objects.get(pk=user.pk)


@pytest.mark.django_db
def test_reading_items_requires_view_permission(media_settings):
    item = ItemModel.objects.create(name="one", type="file")
    client = media_client(staff_with_media_perms())

    assert client.get("/api/media-library/items").status_code == 403
    assert client.get(f"/api/media-library/items/{item.pk}").status_code == 403
    assert client.get("/api/media-library/items/tags").status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize("codename", ["view_itemmodel", "change_itemmodel"])
def test_reading_items_with_view_or_change_permission(media_settings, codename):
    item = ItemModel.objects.create(name="one", type="file")
    client = media_client(staff_with_media_perms(codename))

    assert client.get("/api/media-library/items").status_code == 200
    assert client.get(f"/api/media-library/items/{item.pk}").status_code == 200


@pytest.mark.django_db
def test_reading_folders_requires_view_permission(media_settings):
    folder = FolderModel.objects.create(name="one")
    client = media_client(staff_with_media_perms())

    assert client.get("/api/media-library/folders").status_code == 403
    assert client.get(f"/api/media-library/folders/{folder.pk}").status_code == 403
    response = client.get("/api/media-library/folders/path", {"folder": folder.pk})
    assert response.status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize("codename", ["view_foldermodel", "view_itemmodel"])
def test_reading_folders_with_folder_or_item_view_permission(media_settings, codename):
    client = media_client(staff_with_media_perms(codename))

    assert client.get("/api/media-library/folders").status_code == 200


@pytest.mark.django_db
def test_bulk_with_malformed_ids_is_a_client_error(media_settings):
    response = media_client(make_superuser()).post(
        "/api/media-library/items/bulk",
        {"action": "delete", "ids": ["not-a-number"]},
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_bulk_move_to_malformed_folder_returns_404(media_settings):
    item = ItemModel.objects.create(name="one", type="file")

    response = media_client(make_superuser()).post(
        "/api/media-library/items/bulk",
        {"action": "move", "ids": [item.pk], "folder": "not-a-number"},
        format="json",
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_bulk_move_without_folder_model_is_a_client_error():
    item = ItemModel.objects.create(name="one", type="file")
    settings = {**MEDIA_SETTINGS, "MEDIA_LIBRARY_FOLDER_MODEL": None}

    with override_settings(CONTENT_STUDIO=settings):
        response = media_client(make_superuser()).post(
            "/api/media-library/items/bulk",
            {"action": "move", "ids": [item.pk], "folder": 123},
            format="json",
        )

    assert response.status_code == 400
    assert ItemModel.objects.get(pk=item.pk).folder_id is None
