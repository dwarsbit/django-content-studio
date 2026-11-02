"""
Image sizes: every media library image made in the sizes the
IMAGE_SIZES setting names, for the site and other consumers.

    CONTENT_STUDIO = {
        "IMAGE_SIZES": {
            "card": {"width": 600, "height": 400, "fit": "cover"},
            "hero": {"width": 1920},
        },
    }

A size is made with Pillow (the [images] extra) in a Django task after
the image changes: an upload, a new file, a crop or reset, and for
"cover" sizes a new focal point. It is saved in the image's own storage
under IMAGE_SIZE_FOLDER, and recorded in the item's metadata, under
"sizes":

    {"card": {"key": "<file>-card-<spec>", "name": "<storage name>",
              "width": 600, "height": 400}}

The key is made from the file's name, the size's settings and (for
"cover") the focal point, so a size whose key no longer matches is out
of date. get_image_sizes() reads the record: a size that is not made
(yet) is the item's own file, with "ready" False.
"""

import hashlib
import json
import logging
import re

from django.core.files.base import ContentFile
from django.db import router, transaction

from content_studio.settings import cs_settings

from .metadata import get_metadata_attr, get_properties_attr

__all__ = ["get_image_sizes"]

logger = logging.getLogger(__name__)

# The metadata key that holds the record of an item's sizes.
SIZES_KEY = "sizes"

FITS = ("contain", "cover")
FORMATS = ("webp", "jpeg", "png", "original")
SPEC_DEFAULTS = {
    "width": None,
    "height": None,
    "fit": "contain",
    "format": "webp",
    "quality": 82,
    "upscale": False,
}
SIZE_NAME = re.compile(r"^[A-Za-z0-9_-]+$")


def size_spec_errors(name, spec) -> list[str]:
    """What is wrong with a size in IMAGE_SIZES, as messages."""
    if not isinstance(name, str) or not SIZE_NAME.match(name):
        return [
            f"The image size name {name!r} may only hold letters, digits, "
            "hyphens and underscores."
        ]

    if not isinstance(spec, dict):
        return [f"The image size {name!r} must be a dict."]

    errors = []
    unknown = set(spec) - set(SPEC_DEFAULTS)

    if unknown:
        errors.append(
            f"The image size {name!r} has unknown option(s) "
            f"{', '.join(sorted(map(str, unknown)))}; use "
            f"{', '.join(SPEC_DEFAULTS)}."
        )

    for side in ("width", "height"):
        value = spec.get(side)

        if value is not None and (
            isinstance(value, bool) or not isinstance(value, int) or value < 1
        ):
            errors.append(
                f"The image size {name!r} has a {side} of {value!r}; use a "
                "whole number of pixels."
            )

    fit = spec.get("fit", "contain")

    if fit not in FITS:
        errors.append(
            f"The image size {name!r} has the fit {fit!r}; use "
            f"{' or '.join(map(repr, FITS))}."
        )

    if not spec.get("width") and not spec.get("height"):
        errors.append(f"The image size {name!r} needs a width, a height or both.")
    elif fit == "cover" and not (spec.get("width") and spec.get("height")):
        errors.append(f"The image size {name!r} needs a width and a height to cover.")

    image_format = spec.get("format", "webp")

    if image_format not in FORMATS:
        errors.append(
            f"The image size {name!r} has the format {image_format!r}; use "
            f"{', '.join(map(repr, FORMATS))}."
        )

    quality = spec.get("quality", 82)

    if (
        isinstance(quality, bool)
        or not isinstance(quality, int)
        or not 1 <= quality <= 100
    ):
        errors.append(
            f"The image size {name!r} has a quality of {quality!r}; use a "
            "whole number from 1 to 100."
        )

    if not isinstance(spec.get("upscale", False), bool):
        errors.append(f"The image size {name!r} has an upscale that is not a bool.")

    return errors


def image_sizes_errors() -> list[str]:
    """What is wrong with the IMAGE_SIZES setting, as messages."""
    sizes = cs_settings.IMAGE_SIZES

    if not sizes:
        return []

    if not isinstance(sizes, dict):
        return ["IMAGE_SIZES must be a dict of size names to options."]

    errors = []

    for name, spec in sizes.items():
        errors.extend(size_spec_errors(name, spec))

    return errors


def get_size_specs() -> dict[str, dict]:
    """
    The valid sizes of IMAGE_SIZES with every option filled in; a size
    with errors (reported by a system check) is left out.
    """
    sizes = cs_settings.IMAGE_SIZES

    if not sizes or not isinstance(sizes, dict):
        return {}

    return {
        name: {**SPEC_DEFAULTS, **spec}
        for name, spec in sizes.items()
        if not size_spec_errors(name, spec)
    }


def pillow_available() -> bool:
    try:
        import PIL  # noqa: F401
    except ImportError:
        return False

    return True


def image_sizes_available() -> bool:
    """
    Sizes are made when there are any, Pillow is installed, a folder is
    set and the media model has a metadata field to record them in.
    """
    return bool(
        get_size_specs()
        and cs_settings.IMAGE_SIZE_FOLDER
        and get_metadata_attr()
        and pillow_available()
    )


def has_sizes(item) -> bool:
    """Whether the item is an image that sizes are made of."""
    file = getattr(item, "file", None)

    return getattr(item, "type", None) == "image" and bool(file and file.name)


def get_focal_point(item):
    attr = get_properties_attr()
    point = ((getattr(item, attr, None) or {}) if attr else {}).get("focal_point")

    return point if isinstance(point, dict) else None


def size_key(item, name, spec) -> str:
    """
    What a size of the item is made from, as a short name: the file's
    name, the size's options and, for cover, the focal point. A size
    whose recorded key differs is out of date.
    """
    file_digest = hashlib.sha256(item.file.name.encode()).hexdigest()[:32]
    made_from = dict(spec)

    if spec["fit"] == "cover":
        made_from["focal_point"] = get_focal_point(item)

    spec_digest = hashlib.sha256(
        json.dumps(made_from, sort_keys=True).encode()
    ).hexdigest()[:8]

    return f"{file_digest}-{name}-{spec_digest}"


def get_record(item) -> dict:
    """The item's record of its sizes, from its metadata."""
    attr = get_metadata_attr()

    if not attr:
        return {}

    record = (getattr(item, attr, None) or {}).get(SIZES_KEY)

    return record if isinstance(record, dict) else {}


def recorded_names(record) -> set[str]:
    return {
        entry["name"]
        for entry in record.values()
        if isinstance(entry, dict) and isinstance(entry.get("name"), str)
    }


def current_keys(item) -> dict[str, str]:
    """The key every size of the item should have now."""
    return {name: size_key(item, name, spec) for name, spec in get_size_specs().items()}


def is_up_to_date(item) -> bool:
    """Whether every size of the item is made and recorded."""
    record = get_record(item)

    return all(
        isinstance(record.get(name), dict) and record[name].get("key") == key
        for name, key in current_keys(item).items()
    )


def get_image_sizes(item) -> dict[str, dict]:
    """
    The sizes of a media library image, for every size in IMAGE_SIZES:

        {"card": {"url": "...", "width": 600, "height": 400, "ready": True}}

    A size that is not made yet, or out of date, is the item's own file
    with its width and height (when known) and "ready" False. Empty for
    an item that is not an image, or when there are no sizes.
    """
    specs = get_size_specs()

    if not specs or not has_sizes(item):
        return {}

    attr = get_metadata_attr()
    metadata = (getattr(item, attr, None) or {}) if attr else {}
    record = get_record(item) if image_sizes_available() else {}
    storage = item.file.storage
    sizes = {}

    for name, spec in specs.items():
        entry = record.get(name)

        if isinstance(entry, dict) and entry.get("key") == size_key(item, name, spec):
            sizes[name] = {
                "url": storage.url(entry["name"]),
                "width": entry.get("width"),
                "height": entry.get("height"),
                "ready": True,
            }
        else:
            sizes[name] = {
                "url": item.file.url,
                "width": metadata.get("width"),
                "height": metadata.get("height"),
                "ready": False,
            }

    return sizes


def render_size(item, spec) -> tuple[bytes, int, int, str]:
    from content_studio.thumbnails import render_image

    with item.file.storage.open(item.file.name, "rb") as source:
        return render_image(
            source,
            width=spec["width"],
            height=spec["height"],
            fit=spec["fit"],
            focal_point=get_focal_point(item),
            image_format=spec["format"],
            quality=spec["quality"],
            upscale=spec["upscale"],
        )


def save_size(storage, name, content) -> str:
    """Save a size under its name, replacing a file by that name."""
    if storage.exists(name):
        storage.delete(name)

    return storage.save(name, ContentFile(content))


def delete_files(storage, names) -> None:
    for name in names:
        try:
            storage.delete(name)
        except Exception:
            logger.warning("Could not delete the image size %s.", name, exc_info=True)


def make_image_sizes(item, force: bool = False) -> int:
    """
    Make the item's sizes that are missing or out of date (every size
    with force) and record them in its metadata; sizes no longer in
    IMAGE_SIZES, or replaced, are deleted. Returns how many were made.
    Errors reading the image are raised.

    The images are made outside a transaction; the record is then
    written to the locked row, keeping only what still matches it, so an
    item changed in the meantime gets no stale sizes.
    """
    specs = get_size_specs()

    # Without sizes, only recorded ones are deleted.
    if specs and not image_sizes_available():
        return 0

    if not get_metadata_attr() or not has_sizes(item):
        return 0

    record = get_record(item)
    storage = item.file.storage
    folder = (cs_settings.IMAGE_SIZE_FOLDER or "").strip("/")
    made = {}

    for name, spec in specs.items():
        key = size_key(item, name, spec)
        entry = record.get(name)

        if not force and isinstance(entry, dict) and entry.get("key") == key:
            continue

        content, width, height, extension = render_size(item, spec)
        saved = save_size(storage, f"{folder}/{key}.{extension}", content)
        made[name] = {"key": key, "name": saved, "width": width, "height": height}

    if not made and set(record) <= set(specs):
        return 0

    model = type(item)
    attr = get_metadata_attr()
    using = router.db_for_write(model)

    with transaction.atomic(using=using):
        fresh = model._default_manager.select_for_update().filter(pk=item.pk).first()

        if fresh is None or not has_sizes(fresh):
            transaction.on_commit(
                lambda: delete_files(storage, [e["name"] for e in made.values()]),
                using=using,
            )
            return 0

        keys = current_keys(fresh)
        old = get_record(fresh)
        new = {}

        for name, key in keys.items():
            for entry in (made.get(name), old.get(name)):
                if isinstance(entry, dict) and entry.get("key") == key:
                    new[name] = entry
                    break

        stale = (recorded_names(old) | recorded_names(made)) - recorded_names(new)
        metadata = {**(getattr(fresh, attr, None) or {}), SIZES_KEY: new}
        model._default_manager.filter(pk=item.pk).update(**{attr: metadata})
        setattr(item, attr, metadata)

        if stale:
            transaction.on_commit(lambda: delete_files(storage, stale), using=using)

    return len(made)


# Signal receivers, connected for every model in the app config and
# filtered here, as the media model is a setting.


def remember_stored_sizes(sender, instance, raw=False, **kwargs):
    """
    pre_save: note the sizes recorded in the database, as a save that
    rewrites the metadata (a crop, a new file) drops the record.
    """
    if raw or sender is not cs_settings.MEDIA_LIBRARY_MODEL:
        return

    if not get_size_specs() or not get_metadata_attr() or instance.pk is None:
        return

    attr = get_metadata_attr()
    stored = (
        sender._default_manager.filter(pk=instance.pk)
        .values_list(attr, flat=True)
        .first()
    )
    record = (stored or {}).get(SIZES_KEY) if isinstance(stored, dict) else None
    instance._content_studio_stored_sizes = record if isinstance(record, dict) else {}


def update_sizes_of_saved_item(sender, instance, raw=False, using=None, **kwargs):
    """
    post_save: delete the sizes the save made unreachable and enqueue
    the task that makes the missing ones, once the save is committed.
    """
    if raw or sender is not cs_settings.MEDIA_LIBRARY_MODEL:
        return

    stored = instance.__dict__.pop("_content_studio_stored_sizes", None) or {}

    if not image_sizes_available():
        return

    using = using or router.db_for_write(sender)
    record = get_record(instance)
    keys = current_keys(instance) if has_sizes(instance) else {}
    kept = recorded_names(record) | {
        entry["name"]
        for name, entry in stored.items()
        if isinstance(entry, dict) and entry.get("key") == keys.get(name)
    }
    dropped = recorded_names(stored) - kept

    if dropped and instance.file:
        storage = instance.file.storage
        transaction.on_commit(lambda: delete_files(storage, dropped), using=using)

    if has_sizes(instance) and not is_up_to_date(instance):
        from .tasks import make_image_sizes_task

        pk = str(instance.pk)
        transaction.on_commit(lambda: make_image_sizes_task.enqueue(pk), using=using)


def delete_sizes_of_deleted_item(sender, instance, using=None, **kwargs):
    """post_delete: a deleted item's sizes go once the deletion is committed."""
    if sender is not cs_settings.MEDIA_LIBRARY_MODEL:
        return

    names = recorded_names(get_record(instance))
    file = getattr(instance, "file", None)

    if names and file:
        storage = file.storage
        transaction.on_commit(lambda: delete_files(storage, names), using=using)
