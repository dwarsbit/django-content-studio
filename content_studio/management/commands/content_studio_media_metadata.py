"""
Read the metadata of media items that have none, such as the width and
height of images uploaded before MEDIA_METADATA_ATTR was set.
"""

from django.core.management.base import BaseCommand, CommandError

from content_studio.media_library.metadata import get_metadata_values
from content_studio.settings import cs_settings


class Command(BaseCommand):
    help = (
        "Read the metadata (such as an image's width and height) of media "
        "items that have none, into the field MEDIA_METADATA_ATTR names."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--all",
            action="store_true",
            help="Read every item again, also items that have metadata.",
        )

    def handle(self, *args, **options):
        media_model = cs_settings.MEDIA_LIBRARY_MODEL
        attr = cs_settings.MEDIA_METADATA_ATTR

        if not media_model:
            raise CommandError("MEDIA_LIBRARY_MODEL is not set.")

        if not attr:
            raise CommandError("MEDIA_METADATA_ATTR is not set.")

        updated = failed = 0

        for item in media_model.objects.order_by("pk").iterator():
            if getattr(item, attr) and not options["all"]:
                continue

            if not item.file:
                continue

            try:
                with item.file.open("rb"):
                    values = get_metadata_values(item.file, item.type)
            except OSError as e:
                failed += 1
                self.stderr.write(f"{item.pk}: cannot read the file ({e}).")
                continue

            # An update, not a save: no audit stamps, signals or webhooks
            # for what is not an editor's change.
            media_model.objects.filter(pk=item.pk).update(**values)
            updated += 1

        self.stdout.write(
            self.style.SUCCESS(f"Read the metadata of {updated} media item(s).")
        )

        if failed:
            raise CommandError(f"{failed} media item(s) could not be read.")
