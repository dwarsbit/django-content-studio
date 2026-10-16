from rest_framework import serializers

from content_studio.settings import cs_settings


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

        def get_count(self, obj):
            """The folder's direct items; None without a media model."""
            media_model = cs_settings.MEDIA_LIBRARY_MODEL

            if not media_model:
                return None

            return media_model.objects.filter(folder_id=obj.pk).count()

    return MediaFolderSerializer
