from django.core.management.base import BaseCommand

from ...pruning import prune_versions


class Command(BaseCommand):
    help = (
        "Remove the history versions of objects that no longer exist, and "
        "the versions beyond HISTORY_MAX_VERSIONS per object. Run it "
        "periodically, for example daily from cron."
    )

    def handle(self, *args, **options):
        deleted = prune_versions()
        self.stdout.write(f"Removed {deleted} versions.")
