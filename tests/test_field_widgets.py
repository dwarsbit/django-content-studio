"""
Tests for the built-in content fields.

The fields formerly provided by the optional django-blueprint integration
ship first-class in Content Studio: they are always importable and always
mapped to their dedicated widgets and formats.
"""

from content_studio import fields, formats
from content_studio.admin import admin_site
from content_studio.media_library import fields as media_fields

FIELD_NAMES = {
    "HTMLField",
    "TagField",
    "FlexField",
    "MultipleChoiceField",
    "URLPathField",
    "MediaField",
    "ManyMediaField",
}


def test_field_widgets_registered():
    """Every built-in content field maps to its dedicated widget."""
    widget_names = {
        key if isinstance(key, str) else key.__name__
        for key in admin_site.default_widget_mapping
    }
    assert FIELD_NAMES <= widget_names


def test_field_formats_registered():
    """Every built-in content field maps to its dedicated format."""
    format_names = {
        key if isinstance(key, str) else key.__name__
        for key in admin_site.default_format_mapping
    }
    assert FIELD_NAMES <= format_names


def test_fields_are_content_studio_classes():
    """The fields live in Content Studio itself, not a third-party package."""
    assert fields.HTMLField.__module__ == "content_studio.fields"
    assert fields.TagField.__module__ == "content_studio.fields"
    assert media_fields.MediaField.__module__ == "content_studio.media_library.fields"
    assert formats.HtmlFormat.__module__ == "content_studio.formats"


def test_media_fields_default_to_built_in_media_model():
    """Without `to`, the media fields point at the built-in Media model."""
    from django.apps import apps

    from content_studio.media_library.models import Media

    for field in (media_fields.MediaField(), media_fields.ManyMediaField()):
        assert apps.get_model(field.remote_field.model) is Media
