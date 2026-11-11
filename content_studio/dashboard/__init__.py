import uuid

from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from content_studio.parsers import ObjectJSONParser
from content_studio.permissions import IsActiveStaff
from content_studio.settings import cs_settings
from content_studio.utils import derive_uuid

__all__ = [
    "Dashboard",
    "DashboardWidget",
    "SpacingWidget",
]


class Dashboard:
    """
    The Dashboard class is used to define the structure of the dashboard
    in Django Content Studio.
    """

    widgets = None

    def __init__(self, **kwargs):
        self.widgets = kwargs.get("widgets", [])

    def set_up_router(self):
        set_up_router()

    def serialize(self):
        return {
            "widgets": [
                {
                    "name": w.name,
                    "widget_type": w.widget_type,
                    "widget_id": w.widget_id,
                    "col_span": w.col_span,
                    "refresh_interval": w.refresh_interval,
                }
                for w in self.widgets
            ]
        }


class DashboardViewSet(ViewSet):
    # Explicit, so the project's DEFAULT_PERMISSION_CLASSES (AllowAny
    # unless configured) never decides who sees the dashboard data.
    permission_classes = [IsActiveStaff]
    parser_classes = [ObjectJSONParser]
    renderer_classes = [JSONRenderer]

    def __init__(self, *args, **kwargs):
        # Forward kwargs: action-level overrides arrive through the viewset init.
        super(ViewSet, self).__init__(*args, **kwargs)
        admin_site = cs_settings.ADMIN_SITE

        self.dashboard = admin_site.dashboard
        self.extensions = getattr(admin_site, "extensions", None) or []
        self.authentication_classes = [
            admin_site.token_backend.active_backend.authentication_class
        ]

    def get_widgets(self, request):
        """
        The widgets the request may load: the site dashboard's and
        those of the dashboard pages the request may see.
        """
        from content_studio.extensions import DashboardPage

        if self.dashboard:
            yield from self.dashboard.widgets or []

        for extension in self.extensions:
            if isinstance(extension, DashboardPage) and extension.is_visible(request):
                yield from extension.dashboard.widgets or []

    @action(detail=False, url_path="widgets/(?P<widget_id>[^/.]+)")
    def get(self, request, widget_id=None):
        widget = next(
            (w for w in self.get_widgets(request) if widget_id == str(w.widget_id)),
            None,
        )

        if not widget:
            raise NotFound()

        if not callable(getattr(widget, "get_data", None)):
            # A layout-only widget (SpacingWidget) has no data to serve.
            raise NotFound()

        data = widget.get_data(request)

        if isinstance(data, serializers.Serializer):
            data.is_valid(raise_exception=True)
            data = data.data

        return Response(data=data)


def set_up_router():
    """Register the widget data endpoint, shared by every dashboard."""
    from content_studio.router import content_studio_router

    content_studio_router.register(
        "api/dashboard",
        DashboardViewSet,
        basename="content_studio_dashboard",
    )


class DashboardWidget:
    # How the admin shows the widget: one of the built-in widget types.
    # Set by the built-in widgets; subclasses inherit it.
    widget_type = None
    # The widget's name, part of its derived ID; subclasses may change it.
    name = None
    col_span = 1
    # Seconds between reloads of the widget's data while it is shown;
    # None reloads only when the editor returns to the admin.
    refresh_interval = None
    widget_id = None

    def __init__(self, widget_id=None):
        """
        The widget ID is derived deterministically from the class and its
        ID parts, so all workers agree on it. A widget_id class attribute
        or an explicit UUID argument takes precedence; pass one to
        disambiguate widgets that share a name.
        """
        if widget_id is None:
            widget_id = self.widget_id

        if widget_id is not None:
            self.widget_id = uuid.UUID(str(widget_id))
        else:
            self.widget_id = derive_uuid(
                self.__class__.__module__,
                self.__class__.__qualname__,
                *self.get_id_parts(),
            )

    def get_id_parts(self):
        """
        Return the properties that define this widget's identity.

        The parts feed the derived widget ID. The default identifies a
        widget by its name; override to add the values that distinguish
        this widget. Note that the method is called from __init__: only
        use attributes that are set before calling super().__init__().
        Widgets sharing their parts get the same ID and are rejected at
        setup.
        """
        return (self.name,)


class SpacingWidget(DashboardWidget):
    widget_type = "SpacingWidget"
    name = "SpacingWidget"

    def __init__(self, col_span=1, widget_id=None):
        self.col_span = col_span
        super().__init__(widget_id)
