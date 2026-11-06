from typing import Optional

from django.db.models import Model
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from ..form import Component
from .extensions import analytics_visible, get_analytics
from .report import build_report, normalize_path

__all__ = ["Analytics"]

LAYOUTS = ("auto", "compact", "full")


class Analytics(Component):
    """
    The analytics of the object being edited: visits to its page on the
    site. In edit_sidebar it shows a compact summary, in edit_main the
    full report; layout="compact" or "full" picks one.

    The page is found with get_path(obj, request): by default
    path_prefix + the path_field's value + path_suffix, such as

        Analytics(path_field="slug", path_prefix="/blog/", path_suffix="/")

    or else the path of obj.get_absolute_url(). With path_field set, the
    analytics page's top pages also link to the objects they show; for a
    custom get_path, override get_objects to keep those links.
    """

    component_type = "Analytics"
    title: str = _("Analytics")
    layout: str = "auto"
    path_field: Optional[str] = None
    path_prefix: str = "/"
    path_suffix: str = ""
    # The range the component opens with.
    default_range: str = "30d"

    def __init__(
        self,
        title: str = None,
        *,
        path_field: str = None,
        path_prefix: str = None,
        path_suffix: str = None,
        layout: str = None,
        default_range: str = None,
        component_id=None,
        when=None,
    ):
        # Set before super().__init__(): get_id_parts() reads them.
        if title is not None:
            self.title = title
        if path_field is not None:
            self.path_field = path_field
        if path_prefix is not None:
            self.path_prefix = path_prefix
        if path_suffix is not None:
            self.path_suffix = path_suffix
        if layout is not None:
            self.layout = layout
        if default_range is not None:
            self.default_range = default_range

        if self.layout not in LAYOUTS:
            raise ValueError(
                f"Unknown analytics layout {self.layout!r}; choose from "
                f"{', '.join(LAYOUTS)}."
            )

        super().__init__(component_id, when=when)

    def get_id_parts(self):
        return (
            str(self.title),
            self.path_field or "",
            self.path_prefix,
            self.path_suffix,
            self.layout,
        )

    def get_path(self, obj: Model, request) -> Optional[str]:
        """The path of obj's page on the site, or None without one."""
        if self.path_field:
            value = getattr(obj, self.path_field, None)
            if value in (None, ""):
                return None
            return normalize_path(f"{self.path_prefix}{value}{self.path_suffix}")

        get_absolute_url = getattr(obj, "get_absolute_url", None)

        if callable(get_absolute_url):
            try:
                return normalize_path(get_absolute_url())
            except Exception:
                return None

        return None

    def get_objects(self, paths: list[str], queryset, request) -> dict[str, Model]:
        """
        The objects among queryset whose page is one of paths, by path,
        so the analytics page can link its top pages to them. Only with
        path_field; override it alongside a custom get_path.
        """
        if not self.path_field:
            return {}

        prefix, suffix = self.path_prefix, self.path_suffix
        values: dict[str, list[str]] = {}

        for path in paths:
            if not (path.startswith(prefix) and path.endswith(suffix)):
                continue
            value = path[len(prefix) : len(path) - len(suffix)]
            if not suffix:
                # Accept the trailing slash a site may add.
                value = value.rstrip("/")
            if value and "/" not in value:
                values.setdefault(value, []).append(path)

        if not values:
            return {}

        found = {}

        for obj in queryset.filter(**{f"{self.path_field}__in": list(values)}):
            for path in values.get(str(getattr(obj, self.path_field)), []):
                found[path] = obj

        return found

    def handle_request(self, obj: Model, request):
        analytics = get_analytics()

        if analytics is None or not analytics_visible(request):
            raise NotFound()

        path = self.get_path(obj, request)

        if not path:
            return Response({"path": None})

        return build_report(
            analytics,
            request,
            request.query_params,
            path=path,
            parts=("summary", "timeseries", "breakdown"),
        )

    def serialize(self):
        return {
            **super().serialize(),
            "title": str(self.title),
            "layout": self.layout,
            "default_range": self.default_range,
        }
