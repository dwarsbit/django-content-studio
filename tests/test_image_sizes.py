"""
Tests for image sizes (IMAGE_SIZES): made in a task after an image
changes, recorded in its metadata, read with get_image_sizes and the
template tags, kept up to date by the content_studio_image_sizes command
and deleted with what they were made from.
"""

import io

import pytest
from django.contrib.auth import models as auth_models
from django.core.files.base import ContentFile
from django.core.management import CommandError, call_command
from django.template import Context, Template
from django.test import override_settings
from PIL import Image
from rest_framework.test import APIClient

from content_studio.checks import image_size_errors, image_size_warnings
from content_studio.media_library.models import Media
from content_studio.media_library.sizes import (
    get_image_sizes,
    get_record,
    is_up_to_date,
    make_image_sizes,
)
from content_studio.thumbnails import render_image
from content_studio.token_backends.jwt import create_access_token

SIZES = {
    "card": {"width": 100, "height": 100, "fit": "cover"},
    "wide": {"width": 120},
}

RED = (255, 0, 0)
BLUE = (0, 0, 255)


def settings_with(sizes=SIZES, **extra):
    return {
        "ADMIN_SITE": "content_studio.admin.admin_site",
        "MEDIA_LIBRARY_MODEL": "content_studio.media_library.models.Media",
        "MEDIA_LIBRARY_FOLDER_MODEL": "content_studio.media_library.models.Folder",
        "IMAGE_SIZES": sizes,
        **extra,
    }


@pytest.fixture
def media(tmp_path):
    with override_settings(MEDIA_ROOT=str(tmp_path), CONTENT_STUDIO=settings_with()):
        yield tmp_path


def image_bytes(width=400, height=200, image_format="PNG"):
    """An image red on its left half and blue on its right half."""
    image = Image.new("RGB", (width, height), RED)
    image.paste(BLUE, (width // 2, 0, width, height))
    buffer = io.BytesIO()
    image.save(buffer, image_format)
    return buffer.getvalue()


def make_item(capture, content=None, **fields):
    with capture(execute=True):
        return Media.objects.create(
            type="image",
            file=ContentFile(content or image_bytes(), name="photo.png"),
            metadata={"width": 400, "height": 200},
            **fields,
        )


def open_image(item, name):
    with item.file.storage.open(name, "rb") as file:
        image = Image.open(file)
        image.load()
        return image


def stored(media, item):
    """The storage names the item's record holds, by size."""
    return {name: entry["name"] for name, entry in get_record(item).items()}


def exists(media, name):
    return (media / name).exists()


# Rendering


def test_contain_fits_inside_the_box_without_upscaling():
    content, width, height, extension = render_image(
        io.BytesIO(image_bytes(400, 200)), width=100, height=100
    )

    assert (width, height, extension) == (100, 50, "webp")
    assert Image.open(io.BytesIO(content)).size == (100, 50)

    _, width, height, _ = render_image(io.BytesIO(image_bytes(400, 200)), width=800)

    assert (width, height) == (400, 200)

    _, width, height, _ = render_image(
        io.BytesIO(image_bytes(400, 200)), width=800, upscale=True
    )

    assert (width, height) == (800, 400)


def test_cover_fills_the_box_around_the_focal_point():
    source = image_bytes(400, 200)

    def colour(focal_point):
        content, width, height, _ = render_image(
            io.BytesIO(source),
            width=50,
            height=50,
            fit="cover",
            focal_point=focal_point,
            image_format="png",
        )
        assert (width, height) == (50, 50)
        return Image.open(io.BytesIO(content)).convert("RGB").getpixel((25, 25))

    assert colour({"x": 10, "y": 50}) == RED
    assert colour({"x": 90, "y": 50}) == BLUE


def test_cover_keeps_the_shape_of_a_small_source():
    _, width, height, _ = render_image(
        io.BytesIO(image_bytes(90, 90)), width=300, height=100, fit="cover"
    )

    assert (width, height) == (90, 30)


@pytest.mark.parametrize(
    "image_format, source_format, extension",
    [("jpeg", "PNG", "jpg"), ("original", "PNG", "png"), ("original", "GIF", "webp")],
)
def test_formats(image_format, source_format, extension):
    content, _, _, result = render_image(
        io.BytesIO(image_bytes(40, 20, source_format)),
        width=20,
        image_format=image_format,
    )

    assert result == extension
    assert (
        Image.open(io.BytesIO(content)).format
        == {
            "jpg": "JPEG",
            "png": "PNG",
            "webp": "WEBP",
        }[extension]
    )


# Making and reading


@pytest.mark.django_db
def test_sizes_are_made_after_an_upload(media, django_capture_on_commit_callbacks):
    item = make_item(django_capture_on_commit_callbacks)
    item.refresh_from_db()
    names = stored(media, item)

    assert set(names) == {"card", "wide"}
    assert all(exists(media, name) for name in names.values())
    assert all(name.startswith("content_studio/sizes/") for name in names.values())
    assert open_image(item, names["card"]).size == (100, 100)
    assert open_image(item, names["wide"]).size == (120, 60)

    sizes = get_image_sizes(item)

    assert sizes["card"] == {
        "url": item.file.storage.url(names["card"]),
        "width": 100,
        "height": 100,
        "ready": True,
    }
    assert sizes["wide"]["ready"] is True
    assert is_up_to_date(item)


@pytest.mark.django_db
def test_a_size_not_made_yet_is_the_file_itself(media):
    # Not committed: the task has not run.
    item = Media.objects.create(
        type="image",
        file=ContentFile(image_bytes(), name="photo.png"),
        metadata={"width": 400, "height": 200},
    )

    assert get_image_sizes(item)["card"] == {
        "url": item.file.url,
        "width": 400,
        "height": 200,
        "ready": False,
    }


@pytest.mark.django_db
def test_items_that_are_not_images_have_no_sizes(
    media, django_capture_on_commit_callbacks
):
    with django_capture_on_commit_callbacks(execute=True):
        item = Media.objects.create(
            type="file", file=ContentFile(b"%PDF-1.4", name="doc.pdf")
        )

    item.refresh_from_db()

    assert get_image_sizes(item) == {}
    assert get_record(item) == {}


@pytest.mark.django_db
def test_no_sizes_without_the_setting(tmp_path, django_capture_on_commit_callbacks):
    with override_settings(MEDIA_ROOT=str(tmp_path), CONTENT_STUDIO=settings_with({})):
        item = make_item(django_capture_on_commit_callbacks)
        item.refresh_from_db()

        assert get_image_sizes(item) == {}
        assert get_record(item) == {}


@pytest.mark.django_db
def test_a_new_focal_point_remakes_only_cover_sizes(
    media, django_capture_on_commit_callbacks
):
    item = make_item(django_capture_on_commit_callbacks)
    item.refresh_from_db()
    before = stored(media, item)

    item.properties = {"focal_point": {"x": 90, "y": 50}}

    # Out of date as soon as the focal point changes.
    assert get_image_sizes(item)["card"]["ready"] is False
    assert get_image_sizes(item)["wide"]["ready"] is True

    with django_capture_on_commit_callbacks(execute=True):
        item.save()

    item.refresh_from_db()
    after = stored(media, item)

    assert after["wide"] == before["wide"]
    assert after["card"] != before["card"]
    assert not exists(media, before["card"])
    assert exists(media, after["card"])
    assert open_image(item, after["card"]).convert("RGB").getpixel((50, 50)) == BLUE


@pytest.mark.django_db
def test_a_new_file_remakes_every_size_and_deletes_the_old(
    media, django_capture_on_commit_callbacks
):
    item = make_item(django_capture_on_commit_callbacks)
    item.refresh_from_db()
    before = stored(media, item)

    # Like an upload or a crop: the metadata is read again, without the
    # record.
    item.file.save("other.png", ContentFile(image_bytes(300, 300)), save=False)
    item.metadata = {"width": 300, "height": 300}

    with django_capture_on_commit_callbacks(execute=True):
        item.save()

    item.refresh_from_db()
    after = stored(media, item)

    assert set(after) == {"card", "wide"}
    assert not set(after.values()) & set(before.values())
    assert not any(exists(media, name) for name in before.values())
    assert open_image(item, after["wide"]).size == (120, 120)


@pytest.mark.django_db
def test_a_crop_remakes_the_sizes(media, django_capture_on_commit_callbacks):
    item = make_item(django_capture_on_commit_callbacks)
    item.refresh_from_db()
    before = stored(media, item)
    user = auth_models.User.objects.create_superuser(username="admin", password="x")
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")

    with django_capture_on_commit_callbacks(execute=True):
        response = client.post(
            f"/api/media-library/items/{item.pk}/crop",
            {"crop": {"x": 50, "y": 0, "width": 50, "height": 100}},
            format="json",
        )

    assert response.status_code == 200
    item.refresh_from_db()
    after = stored(media, item)

    assert set(after) == {"card", "wide"}
    assert not any(exists(media, name) for name in before.values())
    assert open_image(item, after["wide"]).size == (120, 120)
    assert item.metadata["crop"]["original"]


@pytest.mark.django_db
def test_deleting_the_item_deletes_its_sizes(media, django_capture_on_commit_callbacks):
    item = make_item(django_capture_on_commit_callbacks)
    item.refresh_from_db()
    names = stored(media, item)

    with django_capture_on_commit_callbacks(execute=True):
        item.delete()

    assert not any(exists(media, name) for name in names.values())


@pytest.mark.django_db
def test_an_unreadable_image_keeps_serving_the_file(
    media, django_capture_on_commit_callbacks
):
    item = make_item(django_capture_on_commit_callbacks, content=b"not an image")
    item.refresh_from_db()

    assert get_record(item) == {}
    assert get_image_sizes(item)["card"]["ready"] is False


# The command


@pytest.mark.django_db
def test_the_command_follows_changed_sizes(media, django_capture_on_commit_callbacks):
    item = make_item(django_capture_on_commit_callbacks)
    item.refresh_from_db()
    before = stored(media, item)
    changed = {"card": {"width": 50, "height": 50, "fit": "cover"}}

    with override_settings(
        MEDIA_ROOT=str(media), CONTENT_STUDIO=settings_with(changed)
    ):
        assert get_image_sizes(item)["card"]["ready"] is False

        with django_capture_on_commit_callbacks(execute=True):
            call_command("content_studio_image_sizes", stdout=io.StringIO())

        item.refresh_from_db()
        after = stored(media, item)

        assert set(after) == {"card"}
        assert open_image(item, after["card"]).size == (50, 50)
        assert not any(exists(media, name) for name in before.values())
        assert get_image_sizes(item)["card"]["ready"] is True


@pytest.mark.django_db
def test_the_command_makes_nothing_up_to_date_unless_all(
    media, django_capture_on_commit_callbacks
):
    make_item(django_capture_on_commit_callbacks)
    out = io.StringIO()

    with django_capture_on_commit_callbacks(execute=True):
        call_command("content_studio_image_sizes", stdout=out)

    assert "made 0 size(s)" in out.getvalue()

    out = io.StringIO()

    with django_capture_on_commit_callbacks(execute=True):
        call_command("content_studio_image_sizes", "--all", stdout=out)

    assert "made 2 size(s)" in out.getvalue()


@pytest.mark.django_db
def test_the_command_needs_the_media_model(tmp_path):
    with override_settings(
        CONTENT_STUDIO={"ADMIN_SITE": "content_studio.admin.admin_site"}
    ):
        with pytest.raises(CommandError):
            call_command("content_studio_image_sizes")


@pytest.mark.django_db
def test_rereading_metadata_keeps_the_sizes(media, django_capture_on_commit_callbacks):
    item = make_item(django_capture_on_commit_callbacks)
    item.refresh_from_db()
    before = stored(media, item)

    call_command("content_studio_media_metadata", "--all", stdout=io.StringIO())
    item.refresh_from_db()

    assert stored(media, item) == before


# Consumers


@pytest.mark.django_db
def test_template_tags(media, django_capture_on_commit_callbacks):
    item = make_item(django_capture_on_commit_callbacks)
    item.refresh_from_db()
    names = stored(media, item)
    template = Template(
        "{% load content_studio %}"
        '{% image_url item "wide" %}|'
        '{% image_size item "card" as card %}{{ card.width }}x{{ card.height }}|'
        '{% image_url item "missing" %}|{% image_url None "wide" %}'
    )

    assert template.render(Context({"item": item})) == (
        f"{item.file.storage.url(names['wide'])}|100x100||"
    )


@pytest.mark.django_db
def test_the_admin_api_lists_the_sizes(media, django_capture_on_commit_callbacks):
    item = make_item(django_capture_on_commit_callbacks)
    user = auth_models.User.objects.create_superuser(username="admin", password="x")
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")

    data = client.get(f"/api/media-library/items/{item.pk}").json()

    assert set(data["sizes"]) == {"card", "wide"}
    assert data["sizes"]["card"]["url"].startswith("http://testserver/")
    assert data["sizes"]["card"]["ready"] is True


# System checks


def test_invalid_sizes_are_reported():
    sizes = {
        "bad name": {"width": 10},
        "nothing": {},
        "cover": {"width": 10, "fit": "cover"},
        "options": {"width": 0, "fit": "stretch", "format": "gif", "colour": 1},
        "quality": {"width": 10, "quality": 101},
        "ok": {"width": 10},
    }

    with override_settings(CONTENT_STUDIO=settings_with(sizes)):
        errors = [message for _, message in image_size_errors()]

    assert {check_id for check_id, _ in image_size_errors()} <= {"content_studio.E033"}
    assert any("'bad name'" in error for error in errors)
    assert any("'nothing' needs a width, a height or both" in error for error in errors)
    assert any("'cover' needs a width and a height" in error for error in errors)
    assert any("unknown option(s) colour" in error for error in errors)
    assert any("fit 'stretch'" in error for error in errors)
    assert any("format 'gif'" in error for error in errors)
    assert any("a width of 0" in error for error in errors)
    assert any("quality of 101" in error for error in errors)
    assert not any("'ok'" in error for error in errors)


def test_sizes_that_cannot_be_made_are_warned_about(monkeypatch):
    from content_studio.media_library import sizes

    monkeypatch.setattr(sizes, "pillow_available", lambda: False)

    with override_settings(CONTENT_STUDIO=settings_with(IMAGE_SIZE_FOLDER=None)):
        warnings = image_size_warnings()

    assert [check_id for check_id, _ in warnings] == ["content_studio.W022"]
    assert "IMAGE_SIZE_FOLDER" in warnings[0][1]
    assert "Pillow" in warnings[0][1]


def test_no_warning_when_sizes_can_be_made():
    with override_settings(CONTENT_STUDIO=settings_with()):
        assert image_size_warnings() == []
