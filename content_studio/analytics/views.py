from rest_framework.exceptions import NotFound
from rest_framework.renderers import JSONRenderer
from rest_framework.viewsets import ViewSet

from ..parsers import ObjectJSONParser
from ..permissions import IsActiveStaff
from ..settings import cs_settings
from .extensions import get_analytics
from .report import build_report, normalize_path


class AnalyticsViewSet(ViewSet):
    """The site's analytics, for the analytics page."""

    # Explicit, so the project's DEFAULT_PERMISSION_CLASSES never decide.
    permission_classes = [IsActiveStaff]
    parser_classes = [ObjectJSONParser]
    renderer_classes = [JSONRenderer]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        admin_site = cs_settings.ADMIN_SITE
        self.authentication_classes = [
            admin_site.token_backend.active_backend.authentication_class
        ]

    def list(self, request):
        analytics = get_analytics()

        if analytics is None or not analytics.is_visible(request):
            raise NotFound()

        return build_report(
            analytics,
            request,
            request.query_params,
            path=normalize_path(request.query_params.get("path")),
        )


def set_up_router():
    from ..router import content_studio_router

    content_studio_router.register(
        "api/analytics", AnalyticsViewSet, basename="content_studio_analytics"
    )
