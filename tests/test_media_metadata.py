"""
Tests for media metadata: what is read from a media item's file (an
image's width and height by default) into MEDIA_METADATA_ATTR.
"""

import io

import pytest
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import models as auth_models
from django.core.management import CommandError, call_command
from django.test import override_settings
from PIL import Image
from rest_framework.test import APIClient

from content_studio.admin import admin_site
from content_studio.checks import check_content_studio
from content_studio.media_library.metadata import read_image_size
from content_studio.media_library.models import Media
from content_studio.token_backends.jwt import create_access_token

SETTINGS = {
    "ADMIN_SITE": "content_studio.admin.admin_site",
    "MEDIA_LIBRARY_MODEL": "content_studio.media_library.models.Media",
    "MEDIA_LIBRARY_FOLDER_MODEL": "content_studio.media_library.models.Folder",
    "MEDIA_METADATA_ATTR": "metadata",
}


def make_superuser():
    return auth_models.User.objects.create_superuser(username="admin", password="x")


def media_client(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


def image_bytes(width, height, orientation=None):
    buffer = io.BytesIO()
    image = Image.new("RGB", (width, height), "white")
    exif = Image.Exif()

    if orientation:
        exif[0x0112] = orientation

    image.save(buffer, "JPEG", exif=exif)
    return buffer.getvalue()


@pytest.fixture
def media_root(tmp_path):
    with override_settings(MEDIA_ROOT=str(tmp_path)):
        yield tmp_path


def upload(user, name, content, media_type="image", **settings_overrides):
    with override_settings(CONTENT_STUDIO={**SETTINGS, **settings_overrides}):
        return media_client(user).post(
            "/api/media-library/items",
            {
                "name": name,
                "type": media_type,
                "file": SimpleUploadedFile(name, content),
            },
            format="multipart",
        )


def test_reads_an_image_size():
    assert read_image_size(io.BytesIO(image_bytes(160, 90))) == {
        "width": 160,
        "height": 90,
    }


def test_reads_the_size_an_image_shows_at_after_its_orientation():
    # Orientation 6: stored landscape, shown portrait.
    assert read_image_size(io.BytesIO(image_bytes(160, 90, orientation=6))) == {
        "width": 90,
        "height": 160,
    }


def test_reads_nothing_from_a_file_that_is_not_an_image():
    assert read_image_size(io.BytesIO(b"%PDF-1.7 not an image")) == {}


def test_reading_keeps_the_file_position():
    file = io.BytesIO(image_bytes(16, 9))
    file.seek(5)

    read_image_size(file)

    assert file.tell() == 5


@pytest.mark.django_db
def test_upload_stores_the_image_size(media_root):
    response = upload(make_superuser(), "heath.jpg", image_bytes(1600, 900))

    assert response.status_code == 201, response.content
    assert response.json()["metadata"] == {"width": 1600, "height": 900}
    assert Media.objects.get().metadata == {"width": 1600, "height": 900}


@pytest.mark.django_db
def test_upload_stores_nothing_for_other_types_by_default(media_root):
    response = upload(make_superuser(), "notes.pdf", b"%PDF-1.7", media_type="file")

    assert response.status_code == 201, response.content
    assert Media.objects.get().metadata == {}


@pytest.mark.django_db
def test_upload_stores_nothing_with_the_setting_off(media_root):
    response = upload(
        make_superuser(), "heath.jpg", image_bytes(16, 9), MEDIA_METADATA_ATTR=None
    )

    assert response.status_code == 201, response.content
    assert Media.objects.get().metadata == {}


@pytest.mark.django_db
def test_replacing_the_file_reads_it_again(media_root):
    user = make_superuser()
    pk = upload(user, "heath.jpg", image_bytes(16, 9)).json()["id"]

    with override_settings(CONTENT_STUDIO=SETTINGS):
        response = media_client(user).patch(
            f"/api/media-library/items/{pk}",
            {"file": SimpleUploadedFile("dunes.jpg", image_bytes(30, 40))},
            format="multipart",
        )

    assert response.status_code == 200, response.content
    assert Media.objects.get(pk=pk).metadata == {"width": 30, "height": 40}


@pytest.mark.django_db
def test_metadata_cannot_be_edited(media_root):
    user = make_superuser()
    pk = upload(user, "heath.jpg", image_bytes(16, 9)).json()["id"]

    with override_settings(CONTENT_STUDIO=SETTINGS):
        response = media_client(user).patch(
            f"/api/media-library/items/{pk}",
            {"name": "heath", "metadata": {"width": 1}},
            format="json",
        )

    assert response.status_code == 200, response.content
    assert Media.objects.get(pk=pk).metadata == {"width": 16, "height": 9}


@pytest.mark.django_db
def test_the_site_hook_reads_other_metadata(media_root, monkeypatch):
    def get_media_metadata(file, type):
        return {"duration": 12.5, "frame_rate": 25} if type == "video" else {}

    monkeypatch.setattr(admin_site, "get_media_metadata", get_media_metadata)

    response = upload(make_superuser(), "clip.mp4", b"\x00" * 64, media_type="video")

    assert response.status_code == 201, response.content
    assert Media.objects.get().metadata == {"duration": 12.5, "frame_rate": 25}


@pytest.mark.django_db
def test_command_reads_items_without_metadata(media_root):
    old = Media(name="old", type="image")
    old.file.save("old.jpg", ContentFile(image_bytes(64, 48)), save=False)
    old.save()
    known = Media(name="known", type="image", metadata={"width": 1, "height": 1})
    known.file.save("known.jpg", ContentFile(image_bytes(64, 48)), save=False)
    known.save()

    with override_settings(CONTENT_STUDIO=SETTINGS):
        call_command("content_studio_media_metadata", stdout=io.StringIO())

    assert Media.objects.get(pk=old.pk).metadata == {"width": 64, "height": 48}
    assert Media.objects.get(pk=known.pk).metadata == {"width": 1, "height": 1}

    with override_settings(CONTENT_STUDIO=SETTINGS):
        call_command("content_studio_media_metadata", "--all", stdout=io.StringIO())

    assert Media.objects.get(pk=known.pk).metadata == {"width": 64, "height": 48}


@pytest.mark.django_db
def test_command_reports_files_it_cannot_read(media_root):
    missing = Media(name="missing", type="image")
    missing.file.name = "gone.jpg"
    Media.objects.bulk_create([missing])

    with override_settings(CONTENT_STUDIO=SETTINGS):
        with pytest.raises(CommandError, match="1 media item"):
            call_command(
                "content_studio_media_metadata",
                stdout=io.StringIO(),
                stderr=io.StringIO(),
            )


def test_command_needs_the_setting():
    with override_settings(CONTENT_STUDIO={**SETTINGS, "MEDIA_METADATA_ATTR": None}):
        with pytest.raises(CommandError, match="MEDIA_METADATA_ATTR"):
            call_command("content_studio_media_metadata")


@pytest.mark.parametrize(
    "overrides, message",
    [
        ({"MEDIA_LIBRARY_MODEL": None}, "MEDIA_LIBRARY_MODEL is not"),
        ({"MEDIA_METADATA_ATTR": "dimensions"}, "unknown field 'dimensions'"),
        ({"MEDIA_METADATA_ATTR": "name"}, "must name a JSONField"),
    ],
)
def test_check_reports_a_misconfigured_setting(overrides, message):
    with override_settings(CONTENT_STUDIO={**SETTINGS, **overrides}):
        messages = check_content_studio()

    error = next(m for m in messages if m.id == "content_studio.E025")

    assert message in str(error)


def test_check_accepts_a_json_field():
    with override_settings(CONTENT_STUDIO=SETTINGS):
        messages = check_content_studio()

    assert not [m for m in messages if m.id == "content_studio.E025"]
