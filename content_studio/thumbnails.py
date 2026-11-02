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
    from PIL import Image, ImageOps

    with Image.open(source) as image:
        # Lets JPEG decode at a lower resolution: much faster for photos.
        image.draft(image.mode, (box, box))
        # Animated images keep their first frame.
        image = ImageOps.exif_transpose(image)
        image.thumbnail((box, box), Image.Resampling.LANCZOS)

        if image.mode not in ("RGB", "RGBA"):
            transparent = image.mode in ("LA", "PA") or ("transparency" in image.info)
            image = image.convert("RGBA" if transparent else "RGB")

        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=WEBP_QUALITY, method=4)

    return buffer.getvalue()


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
