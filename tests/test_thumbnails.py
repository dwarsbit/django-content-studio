"""
Tests for the thumbnails of media library images: made with Pillow in
two sizes, saved under THUMBNAIL_FOLDER in the image's own storage,
and the file's own URL when they are off, cannot be made or the site
overrides get_thumbnail.
"""

import io
import sys

import pytest
from django.contrib.auth import models as auth_models
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APIClient

from content_studio.admin import admin_site
from content_studio.media_library.models import Media
from content_studio.thumbnails import SIZES, thumbnail_name
from content_studio.token_backends.jwt import create_access_token

SETTINGS = {
    "ADMIN_SITE": "content_studio.admin.admin_site",
    "MEDIA_LIBRARY_MODEL": "content_studio.media_library.models.Media",
    "MEDIA_LIBRARY_FOLDER_MODEL": "content_studio.media_library.models.Folder",
}


@pytest.fixture(autouse=True)
def media_root(tmp_path):
    cache.clear()

    with override_settings(MEDIA_ROOT=str(tmp_path), CONTENT_STUDIO=SETTINGS):
        yield tmp_path

    cache.clear()


def image_bytes(width, height, format="JPEG", mode="RGB", orientation=None):
    buffer = io.BytesIO()
    image = Image.new(mode, (width, height))
    kwargs = {}

    if orientation:
        exif = Image.Exif()
        exif[0x0112] = orientation
        kwargs["exif"] = exif

    image.save(buffer, format, **kwargs)
    return buffer.getvalue()


def make_item(content, name="photo.jpg", type="image"):
    return Media.objects.create(file=ContentFile(content, name=name), type=type)


def stored(media_root, item, size):
    return media_root / thumbnail_name(item.file.name, size)


def make_superuser():
    return auth_models.User.objects.create_superuser(username="admin", password="x")


def media_client(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


@pytest.mark.django_db
@pytest.mark.parametrize("size", ["small", "large"])
def test_makes_a_webp_that_fits_the_size(media_root, size):
    item = make_item(image_bytes(4000, 2000))

    url = admin_site.get_thumbnail(item, size)

    path = stored(media_root, item, size)
    assert url.endswith(path.name)
    assert "/content_studio/thumbnails/" in url

    with Image.open(path) as image:
        assert image.format == "WEBP"
        assert image.size == (SIZES[size], SIZES[size] // 2)


@pytest.mark.django_db
def test_the_default_size_is_small(media_root):
    item = make_item(image_bytes(1000, 1000))

    assert admin_site.get_thumbnail(item) == admin_site.get_thumbnail(item, "small")


@pytest.mark.django_db
def test_never_enlarges_and_applies_the_orientation(media_root):
    # Shown a quarter turned: 30 wide, 40 high.
    item = make_item(image_bytes(40, 30, orientation=6))

    admin_site.get_thumbnail(item, "large")

    with Image.open(stored(media_root, item, "large")) as image:
        assert image.size == (30, 40)


@pytest.mark.django_db
def test_keeps_transparency(media_root):
    item = make_item(image_bytes(600, 600, "PNG", "RGBA"), name="logo.png")

    admin_site.get_thumbnail(item)

    with Image.open(stored(media_root, item, "small")) as image:
        assert image.mode == "RGBA"


@pytest.mark.django_db
def test_an_animated_gif_becomes_its_first_frame(media_root):
    buffer = io.BytesIO()
    frames = [Image.new("P", (600, 300), color) for color in (1, 2)]
    frames[0].save(buffer, "GIF", save_all=True, append_images=frames[1:])
    item = make_item(buffer.getvalue(), name="loop.gif")

    admin_site.get_thumbnail(item)

    with Image.open(stored(media_root, item, "small")) as image:
        assert getattr(image, "n_frames", 1) == 1
        assert image.size == (480, 240)


@pytest.mark.django_db
def test_an_unknown_size_is_an_error():
    item = make_item(image_bytes(10, 10))

    with pytest.raises(ValueError, match="Unknown thumbnail size"):
        admin_site.get_thumbnail(item, "medium")


@pytest.mark.django_db
def test_is_made_once_and_remembered(media_root, monkeypatch):
    item = make_item(image_bytes(1000, 1000))
    url = admin_site.get_thumbnail(item)

    calls = []
    monkeypatch.setattr(
        "content_studio.thumbnails.render_thumbnail",
        lambda *args: calls.append(args),
    )
    exists = FileSystemStorage.exists
    monkeypatch.setattr(
        FileSystemStorage,
        "exists",
        lambda self, name: calls.append(name) or exists(self, name),
    )

    assert admin_site.get_thumbnail(item) == url
    assert calls == []


@pytest.mark.django_db
def test_an_existing_thumbnail_is_not_made_again(media_root, monkeypatch):
    item = make_item(image_bytes(1000, 1000))
    url = admin_site.get_thumbnail(item)
    cache.clear()

    monkeypatch.setattr(
        "content_studio.thumbnails.render_thumbnail",
        lambda *args: pytest.fail("made again"),
    )

    assert admin_site.get_thumbnail(item) == url


@pytest.mark.django_db
def test_the_file_itself_without_pillow(media_root, monkeypatch):
    item = make_item(image_bytes(1000, 1000))
    monkeypatch.setitem(sys.modules, "PIL", None)

    assert admin_site.get_thumbnail(item) == item.file.url
    assert not (media_root / "content_studio").exists()


@pytest.mark.django_db
def test_the_file_itself_with_the_setting_off(media_root):
    item = make_item(image_bytes(1000, 1000))

    with override_settings(CONTENT_STUDIO={**SETTINGS, "THUMBNAIL_FOLDER": None}):
        assert admin_site.get_thumbnail(item, "large") == item.file.url

    assert not (media_root / "content_studio").exists()


@pytest.mark.django_db
def test_the_setting_sets_the_folder(media_root):
    item = make_item(image_bytes(1000, 1000))

    with override_settings(CONTENT_STUDIO={**SETTINGS, "THUMBNAIL_FOLDER": "thumbs/"}):
        url = admin_site.get_thumbnail(item)

    assert "/thumbs/" in url
    assert len(list((media_root / "thumbs").iterdir())) == 1


@pytest.mark.django_db
def test_the_file_itself_when_it_is_not_an_image(media_root, monkeypatch):
    item = make_item(b"not an image", name="photo.jpg")

    assert admin_site.get_thumbnail(item) == item.file.url

    # The failure is remembered: the file is not read on every request.
    monkeypatch.setattr(
        "content_studio.thumbnails.render_thumbnail",
        lambda *args: pytest.fail("tried again"),
    )
    assert admin_site.get_thumbnail(item) == item.file.url


@pytest.mark.django_db
def test_the_file_itself_for_other_types(media_root):
    item = make_item(b"%PDF-1.4", name="manual.pdf", type="file")

    assert admin_site.get_thumbnail(item) == item.file.url


@pytest.mark.django_db
def test_an_override_replaces_the_default(media_root, monkeypatch):
    item = make_item(image_bytes(1000, 1000))
    monkeypatch.setattr(
        admin_site,
        "get_thumbnail",
        lambda obj, size="small": f"https://cdn.example.com/{size}.webp",
        raising=False,
    )
    user = make_superuser()

    data = media_client(user).get(f"/api/media-library/items/{item.pk}").json()

    assert data["thumbnail"] == "https://cdn.example.com/small.webp"
    assert data["thumbnail_large"] == "https://cdn.example.com/large.webp"
    assert not (media_root / "content_studio").exists()


@pytest.mark.django_db
def test_upload_makes_both_sizes(media_root):
    response = media_client(make_superuser()).post(
        "/api/media-library/items",
        {
            "type": "image",
            "file": SimpleUploadedFile("photo.jpg", image_bytes(2000, 1000)),
        },
        format="multipart",
    )

    assert response.status_code == 201, response.content
    item = Media.objects.get()
    data = response.json()
    assert data["thumbnail"].endswith(stored(media_root, item, "small").name)
    assert data["thumbnail_large"].endswith(stored(media_root, item, "large").name)
    assert stored(media_root, item, "small").exists()
    assert stored(media_root, item, "large").exists()


@pytest.mark.django_db
def test_other_types_have_no_thumbnails(media_root):
    item = make_item(b"%PDF-1.4", name="manual.pdf", type="file")

    data = media_client(make_superuser()).get(f"/api/media-library/items/{item.pk}")

    assert data.json()["thumbnail"] is None
    assert data.json()["thumbnail_large"] is None


@pytest.mark.django_db
def test_replacing_the_file_replaces_the_thumbnails(
    media_root, django_capture_on_commit_callbacks
):
    item = make_item(image_bytes(1000, 1000))
    old = [stored(media_root, item, size) for size in SIZES]

    for size in SIZES:
        admin_site.get_thumbnail(item, size)

    with django_capture_on_commit_callbacks(execute=True):
        response = media_client(make_superuser()).patch(
            f"/api/media-library/items/{item.pk}",
            {"file": SimpleUploadedFile("dunes.jpg", image_bytes(800, 400))},
            format="multipart",
        )

    assert response.status_code == 200, response.content
    item.refresh_from_db()
    assert not any(path.exists() for path in old)
    assert response.json()["thumbnail"].endswith(stored(media_root, item, "small").name)

    with Image.open(stored(media_root, item, "large")) as image:
        assert image.size == (800, 400)


@pytest.mark.django_db
def test_cropping_makes_new_thumbnails(media_root, monkeypatch):
    item = make_item(image_bytes(1000, 1000))
    admin_site.get_thumbnail(item, "large")

    def crop_image(obj, crop_info):
        # Crops in place: the file keeps its name.
        path = media_root / obj.file.name
        path.write_bytes(image_bytes(500, 250))

    monkeypatch.setattr(admin_site, "crop_image", crop_image, raising=False)

    response = media_client(make_superuser()).post(
        f"/api/media-library/items/{item.pk}/crop",
        {"crop": {"x": 0, "y": 0, "width": 50, "height": 25, "unit": "%"}},
        format="json",
    )

    assert response.status_code == 200, response.content

    with Image.open(stored(media_root, item, "large")) as image:
        assert image.size == (500, 250)


@pytest.mark.django_db
def test_deleting_an_item_deletes_its_thumbnails(
    media_root, django_capture_on_commit_callbacks
):
    item = make_item(image_bytes(1000, 1000))
    paths = [stored(media_root, item, size) for size in SIZES]

    for size in SIZES:
        admin_site.get_thumbnail(item, size)

    assert all(path.exists() for path in paths)

    with django_capture_on_commit_callbacks(execute=True):
        item.delete()

    assert not any(path.exists() for path in paths)
