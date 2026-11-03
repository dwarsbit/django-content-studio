from django.core.management.base import BaseCommand

from ...uploads import clear_expired_uploads


class Command(BaseCommand):
    help = (
        "Remove files picked in a FileWidget that were not attached to an "
        "object within a day (in UPLOAD_FOLDER). Run it periodically, for "
        "example daily from cron."
    )

    def handle(self, *args, **options):
        removed = clear_expired_uploads()
        self.stdout.write(f"Removed {removed} uploads.")
