"""
The built-in crop of image media items.

A crop never resizes: it cuts the selection out of the original at full
resolution. The item's file becomes the cropped image, so everything
that shows the file shows the crop; the original is kept in storage and
named in the item's metadata, under "crop":

    {"original": "<storage name>", "width": 4000, "height": 3000,
     "box": {"x": 10.0, "y": 20.0, "width": 50.0, "height": 40.0}}

The box is in percentages of the original, so every crop starts from the
original, and resetting puts the original back. One original, one crop.

The focal point (in the item's properties) is relative to the file
shown, so a crop or reset moves it along; a point outside a new crop is
clamped to its nearest edge.
"""

import io
import os

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.db import router, transaction

from content_studio.settings import cs_settings

from .metadata import get_metadata_attr, get_properties_attr

__all__ = []

# The metadata key that holds the crop.
CROP_KEY = "crop"

# JPEG quality of a cropped JPEG: high, as the crop is what is shown.
JPEG_QUALITY = 95

BOX_KEYS = ("x", "y", "width", "height")


def pillow_installed() -> bool:
    try:
        import PIL  # noqa: F401
    except ImportError:
        return False

    return True


def builtin_cropping_available() -> bool:
    """
    The built-in crop needs Pillow (the images extra) and a metadata
    field on the media model to name the original in.
    """
    return bool(
        cs_settings.MEDIA_LIBRARY_MODEL and get_metadata_attr() and pillow_installed()
    )


def get_crop_hook(site, name):
    """
    The site's crop_image or reset_crop hook, or None when cropping is
    not offered: the site's own method always counts; the built-in one
    only when it can run.
    """
    from content_studio.admin import ContentStudioSite

    hook = getattr(site, name, None)

    if not callable(hook):
        return None

    builtin = getattr(ContentStudioSite, name, None)

    if getattr(hook, "__func__", None) is builtin:
        return hook if builtin_cropping_available() else None

    return hook


def get_crop(obj):
    """The item's crop, from its metadata, or None when uncropped."""
    attr = get_metadata_attr()

    if not attr:
        return None

    crop = (getattr(obj, attr, None) or {}).get(CROP_KEY)

    if isinstance(crop, dict) and crop.get("original"):
        return crop

    return None


def validate_crop_box(crop_info) -> dict:
    """
    A crop selection as percentages of the image:
    {"x", "y", "width", "height"} (numbers or numeric strings) and
    optionally "unit": "%". Returns the box as floats.
    """
    if not isinstance(crop_info, dict):
        raise ValidationError("A crop is a JSON object.")

    if crop_info.get("unit", "%") != "%":
        raise ValidationError('A crop is given in percentages ("unit": "%").')

    box = {}

    for key in BOX_KEYS:
        value = crop_info.get(key)

        if isinstance(value, bool):
            value = None

        try:
            box[key] = float(value)
        except (TypeError, ValueError):
            raise ValidationError(f"The crop's {key} must be a number.")

        if not 0 <= box[key] <= 100:
            raise ValidationError(f"The crop's {key} must be from 0 to 100.")

    if box["width"] <= 0 or box["height"] <= 0:
        raise ValidationError("The crop must have a width and a height.")

    # Rounding in the editor can overshoot the edge by a hair.
    if box["x"] + box["width"] > 100.01 or box["y"] + box["height"] > 100.01:
        raise ValidationError("The crop must lie within the image.")

    return {key: round(value, 4) for key, value in box.items()}


def pixel_box(box, width, height) -> tuple[int, int, int, int]:
    """The box in whole pixels of an image of the given size."""
    left = min(max(round(box["x"] * width / 100), 0), width - 1)
    top = min(max(round(box["y"] * height / 100), 0), height - 1)
    right = min(max(round((box["x"] + box["width"]) * width / 100), left + 1), width)
    bottom = min(max(round((box["y"] + box["height"]) * height / 100), top + 1), height)

    return left, top, right, bottom


FULL_BOX = {"x": 0, "y": 0, "width": 100, "height": 100}


def move_focal_point(point, from_box, to_box):
    """
    A focal point on the image cropped to from_box, moved onto the image
    cropped to to_box; both boxes in percentages of the original. A
    point outside to_box is clamped to its nearest edge.
    """
    moved = {}

    for axis, size in (("x", "width"), ("y", "height")):
        original = from_box[axis] + point[axis] * from_box[size] / 100
        value = (original - to_box[axis]) / to_box[size] * 100
        moved[axis] = round(min(max(value, 0), 100), 2)

    return moved


def update_focal_point(obj, from_box, to_box):
    """Move the item's focal point, when it has one, between crops."""
    attr = get_properties_attr()

    if not attr:
        return

    properties = getattr(obj, attr, None) or {}
    point = properties.get("focal_point")

    if not isinstance(point, dict) or not {"x", "y"} <= set(point):
        return

    setattr(
        obj,
        attr,
        {**properties, "focal_point": move_focal_point(point, from_box, to_box)},
    )


def delete_on_commit(obj, storage, name):
    """Remove a file from storage once the change is committed."""
    transaction.on_commit(
        lambda: storage.delete(name), using=router.db_for_write(type(obj))
    )


def crop_media(obj, crop_info):
    """
    Crop an image item to the selection, from its original. The first
    crop keeps the uploaded file as the original; a later crop replaces
    the previous one. Raises ValidationError for a selection or image
    that cannot be cropped.
    """
    from PIL import Image, ImageOps, UnidentifiedImageError

    if obj.type != "image" or not obj.file:
        raise ValidationError("Only images can be cropped.")

    box = validate_crop_box(crop_info)
    attr = get_metadata_attr()
    previous = get_crop(obj)
    storage = obj.file.storage
    original_name = previous["original"] if previous else obj.file.name

    try:
        with storage.open(original_name, "rb") as file:
            with Image.open(file) as image:
                image_format = image.format

                if getattr(image, "n_frames", 1) > 1:
                    raise ValidationError("Animated images cannot be cropped.")

                Image.init()

                if image_format not in Image.SAVE:
                    raise ValidationError("Images of this type cannot be cropped.")

                icc_profile = image.info.get("icc_profile")
                # The editor selects on the image as it is shown, after
                # its EXIF orientation.
                shown = ImageOps.exif_transpose(image)
                width, height = shown.size
                cropped = shown.crop(pixel_box(box, width, height))
                exif = shown.info.get("exif")
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as e:
        raise ValidationError(f"The image cannot be cropped ({e}).")

    options = {"format": image_format}

    if icc_profile:
        options["icc_profile"] = icc_profile

    if exif:
        options["exif"] = exif

    if image_format == "JPEG":
        options["quality"] = JPEG_QUALITY

    buffer = io.BytesIO()
    cropped.save(buffer, **options)

    content = ContentFile(buffer.getvalue(), name=os.path.basename(original_name))
    metadata = cs_settings.ADMIN_SITE.get_media_metadata(content, obj.type) or {}

    # A re-crop replaces the previous crop; the original stays.
    if previous and obj.file.name != original_name:
        delete_on_commit(obj, storage, obj.file.name)

    obj.file.save(content.name, content, save=False)

    setattr(
        obj,
        attr,
        {
            **metadata,
            CROP_KEY: {
                "original": original_name,
                "width": width,
                "height": height,
                "box": box,
            },
        },
    )
    update_focal_point(obj, previous["box"] if previous else FULL_BOX, box)
    obj.save()


def reset_media_crop(obj):
    """
    Put an item's original back in place of its crop. Raises
    ValidationError when the item is not cropped.
    """
    crop = get_crop(obj)

    if not crop:
        raise ValidationError("The image is not cropped.")

    attr = get_metadata_attr()
    storage = obj.file.storage
    cropped_name = obj.file.name

    with storage.open(crop["original"], "rb") as file:
        metadata = cs_settings.ADMIN_SITE.get_media_metadata(file, obj.type) or {}

    obj.file.name = crop["original"]
    setattr(obj, attr, metadata)
    update_focal_point(obj, crop["box"], FULL_BOX)
    obj.save()

    if cropped_name and cropped_name != crop["original"]:
        delete_on_commit(obj, storage, cropped_name)


def delete_original(sender, instance, using, **kwargs):
    """
    Remove a deleted media item's original from storage, once the
    deletion is committed. Connected to post_delete for every sender,
    and acts on the media library model only.
    """
    if sender is not cs_settings.MEDIA_LIBRARY_MODEL:
        return

    crop = get_crop(instance)

    if not crop:
        return

    storage, name = instance.file.storage, crop["original"]
    transaction.on_commit(lambda: storage.delete(name), using=using)
