"""
Media metadata: facts read from a media item's file, such as an image's
width and height, stored in the JSONField that MEDIA_METADATA_ATTR names.
What is read comes from ContentStudioSite.get_media_metadata.
"""

from django.core.exceptions import FieldDoesNotExist
from django.db import models

from content_studio.settings import cs_settings

# EXIF orientations that turn the image a quarter: the image shows with
# its width and height swapped.
QUARTER_TURN_ORIENTATIONS = (5, 6, 7, 8)
EXIF_ORIENTATION = 0x0112


def read_image_size(file) -> dict:
    """
    An image's width and height in pixels as it is shown (after its EXIF
    orientation), read from its header with Pillow. Empty when Pillow is
    not installed or the file is not an image it can read.
    """
    try:
        from PIL import Image
    except ImportError:
        return {}

    position = file.tell()

    try:
        file.seek(0)

        with Image.open(file) as image:
            width, height = image.size

            if image.getexif().get(EXIF_ORIENTATION) in QUARTER_TURN_ORIENTATIONS:
                width, height = height, width
    except Exception:
        return {}
    finally:
        file.seek(position)

    return {"width": width, "height": height}


def get_metadata_attr():
    """
    The media item field metadata is stored in: MEDIA_METADATA_ATTR,
    when the media model has a JSONField by that name. None otherwise,
    which turns metadata off: the default name applies to every media
    model, and one without the field simply has no metadata. A name
    set explicitly but missing is reported by system check E025.
    """
    attr = cs_settings.MEDIA_METADATA_ATTR
    media_model = cs_settings.MEDIA_LIBRARY_MODEL

    if not attr or not media_model:
        return None

    try:
        field = media_model._meta.get_field(attr)
    except FieldDoesNotExist:
        return None

    return attr if isinstance(field, models.JSONField) else None


def get_metadata_values(file, media_type) -> dict:
    """
    The metadata to save with an item whose file is file, as model field
    values: {MEDIA_METADATA_ATTR: {...}}, or nothing when metadata is
    off or there is no file.
    """
    attr = get_metadata_attr()

    if not attr or not file:
        return {}

    return {attr: cs_settings.ADMIN_SITE.get_media_metadata(file, media_type) or {}}
