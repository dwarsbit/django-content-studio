"""
Tests for the built-in media library models and their shipped migration.

The models are installed through the content_studio.media_library app;
its initial migration must create working tables without any project-side
makemigrations step.
"""

import pytest
from django.core.files.base import ContentFile
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder

from content_studio.media_library.models import Folder, Media


def test_models_belong_to_the_media_library_app():
    assert Folder._meta.app_label == "content_studio_media_library"
    assert Media._meta.app_label == "content_studio_media_library"


@pytest.mark.django_db
def test_migration_applied_and_models_usable():
    """The shipped migration creates the tables, ready to use."""
    applied = {
        (migration.app, migration.name)
        for migration in MigrationRecorder(connection).applied_migrations().values()
    }
    assert ("content_studio_media_library", "0001_initial") in applied

    folder = Folder.objects.create(name="Photographs")
    media = Media(
        file=ContentFile(b"file", name="photo.png"),
        folder=folder,
        type="image",
    )
    media.save()

    assert media.name == "photo"
    assert media.folder == folder
