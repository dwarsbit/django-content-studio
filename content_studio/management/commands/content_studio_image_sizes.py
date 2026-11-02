"""
Make the image sizes (IMAGE_SIZES) of media library images that are
missing or out of date, such as after adding or changing a size, and
delete the sizes no longer configured.
"""

from django.core.management.base import BaseCommand, CommandError

from content_studio.media_library.metadata import get_metadata_attr
from content_studio.media_library.sizes import make_image_sizes, pillow_available
from content_studio.settings import cs_settings


class Command(BaseCommand):
    help = (
        "Make the IMAGE_SIZES of media library images that are missing or "
        "out of date, and delete sizes that are no longer configured."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--all",
            action="store_true",
            help="Make every size again, also sizes that are up to date.",
        )

    def handle(self, *args, **options):
        media_model = cs_settings.MEDIA_LIBRARY_MODEL

        if not media_model:
            raise CommandError("MEDIA_LIBRARY_MODEL is not set.")

        if not get_metadata_attr():
            raise CommandError(
                f"{media_model._meta.label_lower} has no JSONField named by "
                f"MEDIA_METADATA_ATTR ({cs_settings.MEDIA_METADATA_ATTR!r}) "
                "to record the sizes in."
            )

        if not cs_settings.IMAGE_SIZE_FOLDER:
            raise CommandError("IMAGE_SIZE_FOLDER is not set.")

        if not pillow_available():
            raise CommandError(
                "Image sizes need Pillow: install django-content-studio[images]."
            )

        checked = made = failed = 0
        items = media_model.objects.filter(type="image").order_by("pk")

        for item in items.iterator():
            if not item.file:
                continue

            checked += 1

            try:
                made += make_image_sizes(item, force=options["all"])
            except Exception as e:
                failed += 1
                self.stderr.write(f"{item.pk}: cannot make the sizes ({e}).")

        self.stdout.write(
            self.style.SUCCESS(f"Checked {checked} image(s) and made {made} size(s).")
        )

        if failed:
            raise CommandError(f"{failed} image(s) could not be read.")
