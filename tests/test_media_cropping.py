"""
Tests for the built-in crop: the crop is cut from the original at full
size and becomes the item's file, the original is named in the item's
metadata, and resetting puts it back.
"""

import io

import pytest
from django.contrib.auth import models as auth_models
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from PIL import Image
from rest_framework.test import APIClient

from content_studio.admin import admin_site
from content_studio.media_library.cropping import (
    get_crop_hook,
    move_focal_point,
    validate_crop_box,
)
from content_studio.media_library.models import Media
from content_studio.token_backends.jwt import create_access_token

SETTINGS = {
    "ADMIN_SITE": "content_studio.admin.admin_site",
    "MEDIA_LIBRARY_MODEL": "content_studio.media_library.models.Media",
    "MEDIA_LIBRARY_FOLDER_MODEL": "content_studio.media_library.models.Folder",
}

RED = (255, 0, 0)
BLUE = (0, 0, 255)


@pytest.fixture
def media(tmp_path):
    with override_settings(MEDIA_ROOT=str(tmp_path), CONTENT_STUDIO=SETTINGS):
        yield tmp_path


@pytest.fixture
def client(db):
    user = auth_models.User.objects.create_superuser(username="admin", password="x")
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


def image_bytes(width=200, height=100, image_format="PNG", **options):
    """An image red on its left half and blue on its right half."""
    image = Image.new("RGB", (width, height), RED)
    image.paste(BLUE, (width // 2, 0, width, height))
    buffer = io.BytesIO()
    image.save(buffer, image_format, **options)
    return buffer.getvalue()


def make_item(content=None, name="photo.png", **fields):
    return Media.objects.create(
        type="image",
        file=ContentFile(content or image_bytes(), name=name),
        metadata={"width": 200, "height": 100},
        **fields,
    )


def open_image(storage, name):
    with storage.open(name, "rb") as file:
        image = Image.open(file)
        image.load()
        return image


def crop(client, item, box, capture):
    with capture(execute=True):
        return client.post(
            f"/api/media-library/items/{item.pk}/crop",
            {"crop": box},
            format="json",
        )


def reset(client, item, capture):
    with capture(execute=True):
        return client.delete(f"/api/media-library/items/{item.pk}/crop")


RIGHT_HALF = {"x": "50.00", "y": "0.00", "width": "50.00", "height": "100.00"}


def test_crop_keeps_the_original_and_cuts_at_full_size(
    media, client, django_capture_on_commit_callbacks
):
    item = make_item()
    original_name = item.file.name

    response = crop(client, item, RIGHT_HALF, django_capture_on_commit_callbacks)

    assert response.status_code == 200, response.content
    item.refresh_from_db()
    storage = item.file.storage

    # The file is the crop, never resized; the original is untouched.
    assert item.file.name != original_name
    cropped = open_image(storage, item.file.name)
    assert cropped.size == (100, 100)
    assert cropped.getpixel((0, 0)) == BLUE
    assert cropped.getpixel((99, 99)) == BLUE
    assert open_image(storage, original_name).size == (200, 100)

    assert item.metadata == {
        "width": 100,
        "height": 100,
        "crop": {
            "original": original_name,
            "width": 200,
            "height": 100,
            "box": {"x": 50.0, "y": 0.0, "width": 50.0, "height": 100.0},
        },
    }
    assert item.size == len(storage.open(item.file.name).read())

    data = response.json()
    assert data["original"]["url"].endswith(original_name)
    assert data["original"]["crop"] == item.metadata["crop"]["box"]
    assert data["metadata"]["width"] == 100


def test_a_recrop_starts_from_the_original(
    media, client, django_capture_on_commit_callbacks
):
    item = make_item()
    original_name = item.file.name
    crop(client, item, RIGHT_HALF, django_capture_on_commit_callbacks)
    item.refresh_from_db()
    first_crop = item.file.name
    storage = item.file.storage

    # The left half: outside the first crop, so it must come from the
    # original.
    response = crop(
        client,
        item,
        {"x": 0, "y": 0, "width": 25, "height": 50},
        django_capture_on_commit_callbacks,
    )

    assert response.status_code == 200, response.content
    item.refresh_from_db()
    cropped = open_image(storage, item.file.name)
    assert cropped.size == (50, 50)
    assert cropped.getpixel((0, 0)) == RED
    assert item.metadata["crop"]["original"] == original_name

    # The previous crop is removed; the original stays.
    assert not storage.exists(first_crop)
    assert storage.exists(original_name)


def test_reset_puts_the_original_back(
    media, client, django_capture_on_commit_callbacks
):
    item = make_item()
    original_name = item.file.name
    crop(client, item, RIGHT_HALF, django_capture_on_commit_callbacks)
    item.refresh_from_db()
    cropped_name = item.file.name

    response = reset(client, item, django_capture_on_commit_callbacks)

    assert response.status_code == 200, response.content
    item.refresh_from_db()
    assert item.file.name == original_name
    assert item.metadata == {"width": 200, "height": 100}
    assert not item.file.storage.exists(cropped_name)
    assert response.json()["original"] is None


def test_reset_of_an_uncropped_image_is_rejected(
    media, client, django_capture_on_commit_callbacks
):
    item = make_item()

    response = reset(client, item, django_capture_on_commit_callbacks)

    assert response.status_code == 400


def test_the_focal_point_follows_the_crop(
    media, client, django_capture_on_commit_callbacks
):
    # At 75% across the original: the middle of its right half.
    item = make_item(properties={"focal_point": {"x": 75, "y": 40}, "other": 1})

    crop(client, item, RIGHT_HALF, django_capture_on_commit_callbacks)
    item.refresh_from_db()
    assert item.properties == {"focal_point": {"x": 50.0, "y": 40.0}, "other": 1}

    reset(client, item, django_capture_on_commit_callbacks)
    item.refresh_from_db()
    assert item.properties["focal_point"] == {"x": 75.0, "y": 40.0}


def test_a_focal_point_outside_the_crop_is_clamped():
    full = {"x": 0, "y": 0, "width": 100, "height": 100}
    box = {"x": 50, "y": 25, "width": 50, "height": 50}

    assert move_focal_point({"x": 10, "y": 90}, full, box) == {"x": 0, "y": 100}


def test_crop_follows_the_exif_orientation(
    media, client, django_capture_on_commit_callbacks
):
    """The editor selects on the image as shown: a 200x100 JPEG turned
    a quarter shows as 100x200."""
    exif = Image.Exif()
    exif[0x0112] = 6
    item = make_item(image_bytes(image_format="JPEG", exif=exif), name="p.jpg")

    response = crop(
        client,
        item,
        {"x": 0, "y": 0, "width": 100, "height": 50},
        django_capture_on_commit_callbacks,
    )

    assert response.status_code == 200, response.content
    item.refresh_from_db()
    cropped = open_image(item.file.storage, item.file.name)
    assert cropped.size == (100, 100)
    assert cropped.format == "JPEG"
    assert cropped.getexif().get(0x0112) in (None, 1)
    assert item.metadata["crop"]["width"] == 100
    assert item.metadata["crop"]["height"] == 200


@pytest.mark.parametrize(
    "box",
    [
        {"x": 60, "y": 0, "width": 50, "height": 100},
        {"x": "a", "y": 0, "width": 50, "height": 100},
        {"x": 0, "y": 0, "width": 0, "height": 100},
        {"x": 0, "y": 0, "width": 50, "height": 50, "unit": "px"},
        {"x": True, "y": 0, "width": 50, "height": 50},
    ],
)
def test_invalid_crops_are_rejected(
    media, client, django_capture_on_commit_callbacks, box
):
    item = make_item()
    name = item.file.name

    response = crop(client, item, box, django_capture_on_commit_callbacks)

    assert response.status_code == 400
    item.refresh_from_db()
    assert item.file.name == name


def test_the_crop_box_tolerates_rounding():
    box = validate_crop_box({"x": "33.34", "y": 0, "width": "66.67", "height": 100})

    assert box["x"] == 33.34


def test_animated_images_are_not_cropped(
    media, client, django_capture_on_commit_callbacks
):
    frames = [Image.new("RGB", (20, 20), color) for color in (RED, BLUE)]
    buffer = io.BytesIO()
    frames[0].save(buffer, "GIF", save_all=True, append_images=frames[1:])
    item = make_item(buffer.getvalue(), name="a.gif")

    response = crop(client, item, RIGHT_HALF, django_capture_on_commit_callbacks)

    assert response.status_code == 400


def test_only_images_are_cropped(media, client, django_capture_on_commit_callbacks):
    item = make_item()
    Media.objects.filter(pk=item.pk).update(type="file")

    response = crop(client, item, RIGHT_HALF, django_capture_on_commit_callbacks)

    assert response.status_code == 400


def test_replacing_the_file_drops_the_crop_and_the_original(
    media, client, django_capture_on_commit_callbacks
):
    item = make_item()
    original_name = item.file.name
    crop(client, item, RIGHT_HALF, django_capture_on_commit_callbacks)

    with django_capture_on_commit_callbacks(execute=True):
        response = client.patch(
            f"/api/media-library/items/{item.pk}",
            {"file": SimpleUploadedFile("new.png", image_bytes(40, 30))},
            format="multipart",
        )

    assert response.status_code == 200, response.content
    item.refresh_from_db()
    assert item.metadata == {"width": 40, "height": 30}
    assert not item.file.storage.exists(original_name)


def test_deleting_the_item_removes_the_original(
    media, client, django_capture_on_commit_callbacks
):
    item = make_item()
    original_name = item.file.name
    crop(client, item, RIGHT_HALF, django_capture_on_commit_callbacks)
    item.refresh_from_db()
    storage = item.file.storage

    with django_capture_on_commit_callbacks(execute=True):
        response = client.delete(f"/api/media-library/items/{item.pk}")

    assert response.status_code == 204
    assert not storage.exists(original_name)


def test_rereading_metadata_keeps_the_crop(
    media, client, django_capture_on_commit_callbacks
):
    item = make_item()
    crop(client, item, RIGHT_HALF, django_capture_on_commit_callbacks)
    item.refresh_from_db()
    expected = item.metadata

    call_command("content_studio_media_metadata", "--all", stdout=io.StringIO())

    item.refresh_from_db()
    assert item.metadata == expected


def test_crop_and_reset_are_logged(media, client, django_capture_on_commit_callbacks):
    from django.contrib.admin.models import LogEntry

    item = make_item()
    crop(client, item, RIGHT_HALF, django_capture_on_commit_callbacks)
    reset(client, item, django_capture_on_commit_callbacks)

    messages = list(
        LogEntry.objects.filter(object_id=str(item.pk))
        .order_by("pk")
        .values_list("change_message", flat=True)
    )
    assert messages == ["Cropped.", "Crop reset."]


def test_reset_requires_change_permission(
    media, db, django_capture_on_commit_callbacks
):
    item = make_item()
    deleter = auth_models.User.objects.create_user(
        username="deleter", password="x", is_staff=True
    )
    deleter.user_permissions.set(
        auth_models.Permission.objects.filter(
            content_type__app_label="content_studio_media_library",
            codename__in=["view_media", "delete_media"],
        )
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(deleter)}")

    assert reset(client, item, django_capture_on_commit_callbacks).status_code == 403


def test_builtin_crop_is_on_with_pillow_and_metadata(media):
    assert get_crop_hook(admin_site, "crop_image") is not None
    assert get_crop_hook(admin_site, "reset_crop") is not None

    # A media model without a metadata field has no built-in crop.
    with override_settings(
        CONTENT_STUDIO={
            **SETTINGS,
            "MEDIA_LIBRARY_MODEL": "content_studio.media_library.models.Folder",
        }
    ):
        assert get_crop_hook(admin_site, "crop_image") is None
        assert get_crop_hook(admin_site, "reset_crop") is None


def test_builtin_crop_is_off_without_pillow(media, monkeypatch):
    from content_studio.media_library import cropping

    monkeypatch.setattr(cropping, "pillow_installed", lambda: False)

    assert get_crop_hook(admin_site, "crop_image") is None


def test_a_site_hook_replaces_the_builtin_crop(
    media, client, django_capture_on_commit_callbacks
):
    calls = []
    admin_site.crop_image = lambda obj, crop_info: calls.append(crop_info)

    try:
        item = make_item()
        name = item.file.name
        response = crop(client, item, RIGHT_HALF, django_capture_on_commit_callbacks)
    finally:
        del admin_site.crop_image

    assert response.status_code == 200
    assert calls == [RIGHT_HALF]
    item.refresh_from_db()
    assert item.file.name == name


def test_discover_announces_the_builtin_crop(media, client):
    data = client.get("/api/discover").json()["media_library"]

    assert data["crop"] is True
    assert data["crop_reset"] is True


def test_the_builtin_crop_raises_no_hook_warning():
    """W008 is for a site's own crop_image without a media library."""
    from content_studio.checks import crop_hook_warnings

    with override_settings(CONTENT_STUDIO={"ADMIN_SITE": SETTINGS["ADMIN_SITE"]}):
        assert crop_hook_warnings() == []
