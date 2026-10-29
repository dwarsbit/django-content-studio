from django.template.defaultfilters import filesizeformat
from django.utils.translation import gettext as _
from rest_framework import serializers

from content_studio.settings import cs_settings

# Leading bytes that mark markup (HTML, SVG, XML): browsers may render
# such a file as a page when it is served from the site's own domain.
MARKUP_SNIFF_BYTES = 512


def looks_like_markup(file) -> bool:
    position = file.tell() if hasattr(file, "tell") else None

    try:
        file.seek(0)
        head = file.read(MARKUP_SNIFF_BYTES)
    finally:
        if position is not None:
            file.seek(position)

    if isinstance(head, str):
        head = head.encode("utf-8", "ignore")

    for bom in (b"\xef\xbb\xbf", b"\xff\xfe", b"\xfe\xff"):
        head = head.removeprefix(bom)

    return head.lstrip().replace(b"\x00", b"").startswith(b"<")


def validate_media_upload(file):
    """
    The media library's upload policy: the extension must be in
    MEDIA_LIBRARY_ALLOWED_EXTENSIONS, the size within
    MEDIA_LIBRARY_MAX_UPLOAD_SIZE, and the content must not be markup,
    whatever its extension claims.
    """
    allowed = cs_settings.MEDIA_LIBRARY_ALLOWED_EXTENSIONS
    max_size = cs_settings.MEDIA_LIBRARY_MAX_UPLOAD_SIZE
    name = getattr(file, "name", "") or ""
    extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""

    if allowed is not None and extension not in {e.lower() for e in allowed}:
        raise serializers.ValidationError(_("Files of this type cannot be uploaded."))

    if max_size is not None and file.size > max_size:
        raise serializers.ValidationError(
            _("The file is larger than %(size)s.") % {"size": filesizeformat(max_size)}
        )

    if looks_like_markup(file):
        raise serializers.ValidationError(_("Files of this type cannot be uploaded."))

    return file


def build_media_item_serializer(media_model):
    """
    Build a serializer for the given media model at call time, so the
    configured MEDIA_LIBRARY_MODEL is always current (the setting
    cannot be captured at import time). The exposed fields are
    controlled by ContentStudioSite.get_media_serializer_fields.
    """
    admin_site = cs_settings.ADMIN_SITE

    class MediaItemSerializer(serializers.ModelSerializer):
        thumbnail = serializers.SerializerMethodField()

        class Meta:
            model = media_model
            fields = admin_site.get_media_serializer_fields(media_model)

        def validate_file(self, file):
            return validate_media_upload(file)

        def get_thumbnail(self, obj):
            admin_site = cs_settings.ADMIN_SITE

            if admin_site and obj.type == "image":
                return admin_site.get_thumbnail(obj)

            return None

    return MediaItemSerializer


def build_media_folder_serializer(folder_model):
    """
    Build a serializer for the given media folder model at call time,
    so the configured MEDIA_LIBRARY_FOLDER_MODEL is always current.
    """

    class MediaFolderSerializer(serializers.ModelSerializer):
        has_children = serializers.SerializerMethodField()
        count = serializers.SerializerMethodField()

        class Meta:
            model = folder_model
            fields = ["id", "name", "parent", "has_children", "count"]

        def get_has_children(self, obj):
            return obj.children.exists()

        def validate_parent(self, parent):
            """
            Reject a parent that is the folder itself or one of its
            subfolders: either would make the folder part of a cycle.
            """
            if parent is None or self.instance is None:
                return parent

            seen = set()
            ancestor = parent

            # Bounded by the folders seen, so cyclic data cannot loop.
            while ancestor is not None and ancestor.pk not in seen:
                if ancestor.pk == self.instance.pk:
                    raise serializers.ValidationError(
                        _("A folder cannot be moved into itself or its subfolders.")
                    )
                seen.add(ancestor.pk)
                ancestor = ancestor.parent

            return parent

        def get_count(self, obj):
            """The folder's direct items; None without a media model."""
            media_model = cs_settings.MEDIA_LIBRARY_MODEL

            if not media_model:
                return None

            return media_model.objects.filter(folder_id=obj.pk).count()

    return MediaFolderSerializer
