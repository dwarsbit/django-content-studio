"""
The media item's JSON fields:

- metadata (MEDIA_METADATA_ATTR): facts read from the file, such as an
  image's width and height. What is read comes from
  ContentStudioSite.get_media_metadata; editors never change it.
- properties (MEDIA_PROPERTIES_ATTR): values editors set for some types
  of media, such as an image's focal point. Kept when the file changes.
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


def get_media_json_attr(setting):
    """
    The media item field the setting names, when the media model has a
    JSONField by that name. None otherwise, which turns the feature
    off: the default names apply to every media model, and one without
    the field simply goes without. A name set explicitly but missing is
    reported by a system check (E025, E026).
    """
    attr = getattr(cs_settings, setting)
    media_model = cs_settings.MEDIA_LIBRARY_MODEL

    if not attr or not media_model:
        return None

    try:
        field = media_model._meta.get_field(attr)
    except FieldDoesNotExist:
        return None

    return attr if isinstance(field, models.JSONField) else None


def get_metadata_attr():
    """The media item field metadata is stored in, or None."""
    return get_media_json_attr("MEDIA_METADATA_ATTR")


def get_properties_attr():
    """The media item field properties are stored in, or None."""
    return get_media_json_attr("MEDIA_PROPERTIES_ATTR")


def validate_focal_point(value):
    """
    A focal point: {"x": 0-100, "y": 0-100}, percentages of the image's
    width and height from its top left; None for none. Raises
    ValueError otherwise.
    """
    if value is None:
        return None

    if not isinstance(value, dict) or set(value) != {"x", "y"}:
        raise ValueError('A focal point is {"x": 0-100, "y": 0-100}.')

    for key in ("x", "y"):
        number = value[key]

        if (
            isinstance(number, bool)
            or not isinstance(number, (int, float))
            or not 0 <= number <= 100
        ):
            raise ValueError(f"The focal point's {key} must be a number from 0 to 100.")

    return value


# The properties Content Studio knows, with their validators. Other keys
# are kept as they are, for a site's own use.
PROPERTY_VALIDATORS = {"focal_point": validate_focal_point}


def validate_properties(value):
    """
    A media item's properties: a JSON object whose known keys hold
    valid values. Raises ValueError otherwise.
    """
    if not isinstance(value, dict):
        raise ValueError("Properties must be a JSON object.")

    for key, validator in PROPERTY_VALIDATORS.items():
        if key in value:
            validator(value[key])

    return value


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
