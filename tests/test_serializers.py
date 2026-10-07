"""
Tests for the lazily built serializers.
"""

from django.contrib.auth import models as auth_models
from django.db import models

from content_studio.media_library.serializers import (
    build_media_folder_serializer,
    build_media_item_serializer,
)
from content_studio.serializers import (
    get_session_user_serializer,
    session_user_field_names,
)


class MinimalUser(models.Model):
    """Stand-in for a custom user model without the name fields."""

    username = models.CharField(max_length=150)
    USERNAME_FIELD = "username"

    class Meta:
        app_label = "content_studio"


def test_session_user_serializer_is_built_lazily():
    serializer_class = get_session_user_serializer()

    assert serializer_class.Meta.model is auth_models.User


def test_session_user_serializer_includes_name_fields_for_default_user():
    assert session_user_field_names(auth_models.User) == [
        "id",
        "username",
        "first_name",
        "last_name",
    ]


def test_session_user_serializer_omits_missing_name_fields():
    assert session_user_field_names(MinimalUser) == ["id", "username"]


def test_session_user_serializer_is_cached_per_user_model():
    assert get_session_user_serializer() is get_session_user_serializer()


def test_media_item_serializer_resolves_the_model_at_call_time():
    serializer_class = build_media_item_serializer(auth_models.User)

    assert serializer_class.Meta.model is auth_models.User


def test_media_folder_serializer_resolves_the_model_at_call_time():
    serializer_class = build_media_folder_serializer(auth_models.Group)

    assert serializer_class.Meta.model is auth_models.Group


def test_media_serializers_follow_setting_changes():
    """The old serializers captured the setting at import time."""
    from django.test import override_settings

    from content_studio.settings import cs_settings

    with override_settings(
        CONTENT_STUDIO={
            "ADMIN_SITE": "content_studio.admin.admin_site",
            "MEDIA_LIBRARY_MODEL": "django.contrib.auth.models.User",
            "MEDIA_LIBRARY_FOLDER_MODEL": "django.contrib.auth.models.Group",
        }
    ):
        assert cs_settings.MEDIA_LIBRARY_MODEL is auth_models.User

        item_class = build_media_item_serializer(cs_settings.MEDIA_LIBRARY_MODEL)
        folder_class = build_media_folder_serializer(
            cs_settings.MEDIA_LIBRARY_FOLDER_MODEL
        )

        assert item_class.Meta.model is auth_models.User
        assert folder_class.Meta.model is auth_models.Group
