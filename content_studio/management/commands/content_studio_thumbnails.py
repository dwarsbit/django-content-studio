"""
Make the thumbnails of media library images that have none, such as
images uploaded before Content Studio made thumbnails, so the media
library does not make them the first time it shows them.
"""

from django.core.management.base import BaseCommand, CommandError

from content_studio.settings import cs_settings
from content_studio.thumbnails import SIZES, make_thumbnail, pillow_available


class Command(BaseCommand):
    help = (
        "Make the small and large thumbnails of media library images that "
        "have none, in the folder THUMBNAIL_FOLDER names."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--all",
            action="store_true",
            help="Make every thumbnail again, also thumbnails that exist.",
        )

    def handle(self, *args, **options):
        media_model = cs_settings.MEDIA_LIBRARY_MODEL

        if not media_model:
            raise CommandError("MEDIA_LIBRARY_MODEL is not set.")

        if not cs_settings.THUMBNAIL_FOLDER:
            raise CommandError("Thumbnails are off: THUMBNAIL_FOLDER is None.")

        if not pillow_available():
            raise CommandError(
                "Thumbnails need Pillow: install django-content-studio[images]."
            )

        checked = made = failed = 0
        items = media_model.objects.filter(type="image").order_by("pk")

        for item in items.iterator():
            if not item.file:
                continue

            checked += 1

            try:
                for size in SIZES:
                    made += make_thumbnail(item.file, size, force=options["all"])
            except Exception as e:
                failed += 1
                self.stderr.write(f"{item.pk}: cannot make a thumbnail ({e}).")

        self.stdout.write(
            self.style.SUCCESS(
                f"Checked {checked} image(s) and made {made} thumbnail(s)."
            )
        )

        if failed:
            raise CommandError(f"{failed} image(s) could not be read.")
