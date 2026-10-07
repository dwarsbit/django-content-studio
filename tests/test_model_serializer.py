"""
Tests for the model serializer (the field metadata sent to the frontend).
"""

from django.contrib.auth import models as auth_models

from content_studio.models import ModelSerializer


def test_required_follows_blank_semantics():
    """blank=True means the field is optional, like the Django admin."""
    serializer = ModelSerializer(auth_models.User)

    first_name = serializer.get_field(
        auth_models.User._meta.get_field("first_name")  # blank=True, null=False
    )
    username = serializer.get_field(
        auth_models.User._meta.get_field("username")  # blank=False
    )

    assert first_name["required"] is False
    assert username["required"] is True


def test_optional_fields_are_clearable():
    """The frontend uses required to decide whether a value can be cleared."""
    serializer = ModelSerializer(auth_models.User)

    first_name = serializer.get_field(auth_models.User._meta.get_field("first_name"))

    assert first_name["required"] is False
