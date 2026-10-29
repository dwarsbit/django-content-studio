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


@pytest.fixture
def media_root(tmp_path):
    from django.test import override_settings

    with override_settings(MEDIA_ROOT=str(tmp_path)):
        yield tmp_path


def stored(media):
    return media.file.storage.exists(media.file.name)


@pytest.mark.django_db
def test_deleting_an_item_removes_its_file_from_storage(media_root):
    from django.test import TestCase

    media = Media.objects.create(file=ContentFile(b"file", name="photo.png"))
    name = media.file.name
    assert stored(media)

    with TestCase.captureOnCommitCallbacks(execute=True):
        media.delete()

    assert not media.file.storage.exists(name)


@pytest.mark.django_db
def test_deleting_a_queryset_removes_every_file(media_root):
    from django.test import TestCase

    items = [
        Media.objects.create(file=ContentFile(b"one", name="one.png")),
        Media.objects.create(file=ContentFile(b"two", name="two.png")),
    ]
    names = [media.file.name for media in items]

    with TestCase.captureOnCommitCallbacks(execute=True):
        Media.objects.all().delete()

    assert not any(items[0].file.storage.exists(name) for name in names)


@pytest.mark.django_db
def test_deleting_a_folder_removes_the_files_of_its_items(media_root):
    from django.test import TestCase

    folder = Folder.objects.create(name="Photographs")
    media = Media.objects.create(
        file=ContentFile(b"file", name="photo.png"), folder=folder
    )
    name = media.file.name

    with TestCase.captureOnCommitCallbacks(execute=True):
        folder.delete()

    assert not Media.objects.exists()
    assert not media.file.storage.exists(name)


@pytest.mark.django_db
def test_a_rolled_back_deletion_keeps_the_file(media_root):
    from django.db import transaction
    from django.test import TestCase

    media = Media.objects.create(file=ContentFile(b"file", name="photo.png"))
    pk = media.pk

    class Abort(Exception):
        pass

    with TestCase.captureOnCommitCallbacks(execute=True):
        try:
            with transaction.atomic():
                media.delete()
                raise Abort()
        except Abort:
            pass

    assert Media.objects.filter(pk=pk).exists()
    assert stored(media)


@pytest.mark.django_db
def test_an_item_without_a_file_deletes_quietly(media_root):
    from django.test import TestCase

    media = Media.objects.create(name="empty")

    with TestCase.captureOnCommitCallbacks(execute=True):
        media.delete()

    assert not Media.objects.exists()
