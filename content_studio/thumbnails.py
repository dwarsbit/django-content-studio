"""
Thumbnails of media library images, made with Pillow (the [images]
extra).

A thumbnail is a WebP version of the image scaled down to fit a square
box ("small" for grids, pickers and list rows; "large" for the cover
image widget, cropping and the focal point). It is saved in the
image's own storage under THUMBNAIL_FOLDER, named after the image's
file name and the size, so replacing the file gives new thumbnails.

Thumbnails are made when first asked for (the upload response asks for
both) and remembered in the THUMBNAIL_CACHE cache, so listing a folder
does not check the storage for every item.
"""

import hashlib
import io
import logging

from django.core.cache import caches
from django.core.files.base import ContentFile

from content_studio.settings import cs_settings

logger = logging.getLogger(__name__)

# The box (in pixels) each size fits in.
SIZES = {
    "small": 480,
    "large": 1600,
}

WEBP_QUALITY = 82

CACHE_PREFIX = "content_studio:thumbnail:"
# A thumbnail that exists is remembered for a day; one that could not be
# made (an unreadable image) for an hour, so it is not tried on every
# request.
CACHE_TIMEOUT = 24 * 60 * 60
FAILED_CACHE_TIMEOUT = 60 * 60
FAILED = "failed"


def get_cache():
    return caches[cs_settings.THUMBNAIL_CACHE]


def pillow_available() -> bool:
    try:
        import PIL  # noqa: F401
    except ImportError:
        return False

    return True


def thumbnail_name(file_name: str, size: str) -> str | None:
    """The storage name of a file's thumbnail; None when turned off."""
    if size not in SIZES:
        raise ValueError(
            f"Unknown thumbnail size {size!r}: use one of {', '.join(SIZES)}."
        )

    folder = cs_settings.THUMBNAIL_FOLDER

    if not folder:
        return None

    digest = hashlib.sha256(file_name.encode()).hexdigest()[:32]

    return f"{folder.strip('/')}/{digest}-{size}.webp"


def _cache_key(storage, name: str) -> str:
    # The storage is part of the key: two storages can hold the same name.
    storage_id = f"{type(storage).__module__}.{type(storage).__qualname__}"
    location = str(getattr(storage, "location", "") or "")
    digest = hashlib.sha256(f"{storage_id}:{location}:{name}".encode()).hexdigest()

    return CACHE_PREFIX + digest


def render_thumbnail(source, box: int) -> bytes:
    """A WebP of the image in source, scaled down to fit box x box."""
    content, _, _, _ = render_image(source, width=box, height=box)

    return content


# The Pillow format and file extension of each output format.
OUTPUT_FORMATS = {
    "webp": ("WEBP", "webp"),
    "jpeg": ("JPEG", "jpg"),
    "png": ("PNG", "png"),
}


def output_format(image_format: str, source_format: str | None) -> tuple[str, str]:
    """
    The Pillow format and extension to save in: "original" keeps the
    source's format when it is one of OUTPUT_FORMATS, and is WebP
    otherwise.
    """
    if image_format == "original":
        for pillow_format, extension in OUTPUT_FORMATS.values():
            if pillow_format == source_format:
                return pillow_format, extension

        return OUTPUT_FORMATS["webp"]

    return OUTPUT_FORMATS[image_format]


def _cover_box(size, target, focal_point):
    """
    The largest box with the target's aspect ratio inside an image of the
    given size, centred on the focal point (percentages; the centre when
    None) as far as the image's edges allow.
    """
    width, height = size
    ratio = target[0] / target[1]

    if width / height > ratio:
        box_width, box_height = height * ratio, height
    else:
        box_width, box_height = width, width / ratio

    x, y = (focal_point or {}).get("x", 50), (focal_point or {}).get("y", 50)
    left = min(max(width * x / 100 - box_width / 2, 0), width - box_width)
    top = min(max(height * y / 100 - box_height / 2, 0), height - box_height)

    return left, top, left + box_width, top + box_height


def render_image(
    source,
    width: int | None = None,
    height: int | None = None,
    fit: str = "contain",
    focal_point: dict | None = None,
    image_format: str = "webp",
    quality: int = WEBP_QUALITY,
    upscale: bool = False,
) -> tuple[bytes, int, int, str]:
    """
    The image in source resized, as (content, width, height, extension).

    "contain" scales the image to fit inside width x height (a missing
    side is free). "cover" fills width x height exactly, cut around the
    focal point; without upscale, a source smaller than the box gives a
    smaller image of the same shape. image_format is "webp", "jpeg",
    "png" or "original". Animated images keep their first frame.
    """
    from PIL import Image, ImageOps

    resample = Image.Resampling.LANCZOS

    with Image.open(source) as image:
        source_format = image.format
        pillow_format, extension = output_format(image_format, source_format)

        # Lets JPEG decode at a lower resolution: much faster for photos.
        # Only for contain: the cover box is computed on the full size.
        # Square, as the EXIF orientation may still swap the sides.
        if fit == "contain":
            side = max(width or 0, height or 0)
            image.draft(image.mode, (side, side))

        image = ImageOps.exif_transpose(image)
        source_width, source_height = image.size

        if fit == "cover":
            box = _cover_box(image.size, (width, height), focal_point)
            box_width = box[2] - box[0]
            scale = width / box_width

            if not upscale:
                scale = min(scale, 1)

            size = (
                max(round(box_width * scale), 1),
                max(round((box[3] - box[1]) * scale), 1),
            )
            image = image.resize(size, resample, box=box)
        else:
            scales = []

            if width:
                scales.append(width / source_width)

            if height:
                scales.append(height / source_height)

            scale = min(scales)

            if not upscale:
                scale = min(scale, 1)

            size = (
                max(round(source_width * scale), 1),
                max(round(source_height * scale), 1),
            )

            if size != image.size:
                image = image.resize(size, resample)

        transparent = image.mode in ("RGBA", "LA", "PA") or (
            "transparency" in image.info
        )

        if pillow_format == "JPEG":
            image = image.convert("RGB")
        elif image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if transparent else "RGB")

        options = {}

        if pillow_format == "WEBP":
            options = {"quality": quality, "method": 4}
        elif pillow_format == "JPEG":
            options = {"quality": quality, "optimize": True}
        elif pillow_format == "PNG":
            options = {"optimize": True}

        buffer = io.BytesIO()
        image.save(buffer, pillow_format, **options)

    return buffer.getvalue(), image.width, image.height, extension


def make_thumbnail(file, size: str, force: bool = False) -> bool:
    """
    Save the file's thumbnail of the given size in its storage, unless it
    exists (or force is set), and remember it in the cache. True when
    it was made; False when it existed or thumbnails are off. Errors
    reading or saving the image are raised.
    """
    name = thumbnail_name(file.name, size)

    if not name or not pillow_available():
        return False

    storage = file.storage
    made = force or not storage.exists(name)

    if made:
        with storage.open(file.name, "rb") as source:
            content = render_thumbnail(source, SIZES[size])

        if force:
            storage.delete(name)

        saved = storage.save(name, ContentFile(content))

        # Made at the same time elsewhere: the storage gave this one
        # another name, which nothing points to.
        if saved != name:
            storage.delete(saved)

    get_cache().set(_cache_key(storage, name), True, CACHE_TIMEOUT)

    return made


def get_thumbnail_url(file, size: str = "small") -> str | None:
    """
    The URL of the file's thumbnail, made first when missing. None when
    thumbnails are off (no Pillow or no THUMBNAIL_FOLDER) or the image
    cannot be read: the caller then shows the file itself.
    """
    if not file or not file.name:
        return None

    name = thumbnail_name(file.name, size)

    if not name or not pillow_available():
        return None

    storage = file.storage
    key = _cache_key(storage, name)
    cache = get_cache()

    try:
        state = cache.get(key)

        if state == FAILED:
            return None

        if state is None:
            make_thumbnail(file, size)

        return storage.url(name)
    except Exception:
        logger.warning("Could not make a thumbnail of %s.", file.name, exc_info=True)
        cache.set(key, FAILED, FAILED_CACHE_TIMEOUT)
        return None


def delete_thumbnails(file) -> None:
    """Remove a file's thumbnails from its storage (and the cache)."""
    if not file or not file.name:
        return

    storage = file.storage

    for size in SIZES:
        name = thumbnail_name(file.name, size)

        if not name:
            return

        try:
            get_cache().delete(_cache_key(storage, name))
            storage.delete(name)
        except Exception:
            logger.warning("Could not delete the thumbnail %s.", name, exc_info=True)


def delete_thumbnails_of_deleted_item(sender, instance, using, **kwargs):
    """
    post_delete receiver: a deleted media item's thumbnails go once the
    deletion is committed. Connected for every model and filtered here,
    as the media model is a setting.
    """
    if sender is not cs_settings.MEDIA_LIBRARY_MODEL:
        return

    file = getattr(instance, "file", None)

    if not file or not file.name:
        return

    from django.db import transaction

    transaction.on_commit(lambda: delete_thumbnails(file), using=using)
