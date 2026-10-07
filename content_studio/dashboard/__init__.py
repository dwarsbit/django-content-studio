import uuid

from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.parsers import JSONParser
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from content_studio.settings import cs_settings
from content_studio.utils import derive_uuid


class Dashboard:
    """
    The Dashboard class is used to define the structure of the dashboard
    in Django Content Studio.
    """

    widgets = None

    def __init__(self, **kwargs):
        self.widgets = kwargs.get("widgets", [])

    def set_up_router(self):
        from content_studio.router import content_studio_router

        content_studio_router.register(
            "api/dashboard",
            DashboardViewSet,
            basename="content_studio_dashboard",
        )

    def serialize(self):
        return {
            "widgets": [
                {
                    "name": w.name,
                    "widget_id": w.widget_id,
                    "col_span": w.col_span,
                }
                for w in self.widgets
            ]
        }


class DashboardViewSet(ViewSet):
    parser_classes = [JSONParser]
    renderer_classes = [JSONRenderer]

    def __init__(self, *args, **kwargs):
        # Forward kwargs: action-level overrides arrive through the viewset init.
        super(ViewSet, self).__init__(*args, **kwargs)
        admin_site = cs_settings.ADMIN_SITE

        self.dashboard = admin_site.dashboard
        self.authentication_classes = [
            admin_site.token_backend.active_backend.authentication_class
        ]

    @action(detail=False, url_path="widgets/(?P<widget_id>[^/.]+)")
    def get(self, request, widget_id=None):
        widget = None

        for w in self.dashboard.widgets:
            if widget_id == str(w.widget_id):
                widget = w

        if not widget:
            raise NotFound()

        data = widget.get_data(request)

        if isinstance(data, serializers.Serializer):
            data.is_valid(raise_exception=True)
            data = data.data

        return Response(data=data)


class BaseWidget:
    # Display name of the widget; every widget should set one.
    name = None
    col_span = 1
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


class SpacingWidget(BaseWidget):
    name = "SpacingWidget"

    def __init__(self, col_span=1, widget_id=None):
        self.col_span = col_span
        super().__init__(widget_id)
