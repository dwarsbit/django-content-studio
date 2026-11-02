"""
The notifications dashboard widget: the editor's latest notifications.
Add it to the site's dashboard yourself.
"""

from django.utils.translation import gettext_lazy as _

from ..dashboard import DashboardWidget

__all__ = [
    "NotificationsWidget",
]


class NotificationsWidget(DashboardWidget):
    """
    The latest notifications of the editor viewing the dashboard, unread
    ones marked, with the number of unread ones and links to all of them
    and to the notification settings. It updates when a new notification
    arrives.
    """

    widget_type = "NotificationsWidget"
    name = "NotificationsWidget"
    col_span = 2

    def __init__(self, title=None, description=None, limit=5, widget_id=None):
        if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1:
            raise ValueError("limit must be a positive whole number.")

        self.title = title
        self.description = description
        self.limit = min(limit, 20)
        super().__init__(widget_id)

    def get_data(self, request):
        from .reading import visible_notifications
        from .viewsets import serialize_notifications

        visible = visible_notifications(request)
        latest = list(
            visible.select_related("actor").order_by("-updated_at", "-pk")[: self.limit]
        )

        return {
            "title": str(self.title or _("Notifications")),
            "description": str(self.description or _("Your latest notifications")),
            "unread": visible.filter(read_at=None).count(),
            "results": serialize_notifications(request, latest),
        }
