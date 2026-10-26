from django.core.management.base import BaseCommand

from ...delivery import deliver_due


class Command(BaseCommand):
    help = (
        "Attempt the webhook deliveries that are due: new deliveries no task "
        "worker sent, and retries of failed attempts. Run it periodically, "
        "for example every minute from cron."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="The maximum number of deliveries to attempt.",
        )

    def handle(self, *args, limit=None, **options):
        attempted = deliver_due(limit=limit)
        self.stdout.write(f"Attempted {attempted} webhook deliveries.")
