from django.core.management.base import BaseCommand

from ...pruning import prune


class Command(BaseCommand):
    help = (
        "Remove read notifications older than NOTIFICATION_RETENTION days "
        "and unread ones older than NOTIFICATION_UNREAD_RETENTION days, "
        "follows of objects that no longer exist, and subscriptions to "
        "models that no longer exist. Run it periodically, for example "
        "daily from cron."
    )

    def handle(self, *args, **options):
        notifications, follows, subscriptions = prune()
        self.stdout.write(
            f"Removed {notifications} notifications, {follows} follows and "
            f"{subscriptions} subscriptions."
        )
