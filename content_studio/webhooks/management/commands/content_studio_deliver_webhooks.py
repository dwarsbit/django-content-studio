from django.core.management.base import BaseCommand

from ...delivery import deliver_due, prune_deliveries


class Command(BaseCommand):
    help = (
        "Attempt the webhook deliveries that are due: new deliveries no task "
        "worker sent, and retries of failed attempts. Then remove the "
        "finished deliveries older than WEBHOOK_DELIVERY_RETENTION days. Run "
        "it periodically, for example every minute from cron."
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
        pruned = prune_deliveries()
        self.stdout.write(
            f"Attempted {attempted} webhook deliveries, "
            f"removed {pruned} old deliveries."
        )
