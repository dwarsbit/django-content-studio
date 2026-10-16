"""
Global search: one endpoint searching every registered model.

The command palette sends a term and receives grouped results — per
model with `search_fields`, the same `icontains` match the model's
own list view runs, tenant-scoped and gated by view permission, with
a small cap per model so one chatty table cannot drown out the rest.
"""

import operator
from functools import reduce

from django.db.models import Q

from rest_framework.parsers import JSONParser
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from .permissions import IsActiveStaff
from .settings import cs_settings
from .utils import get_tenant_scoped_queryset

# The minimum term length, matching the frontend's debounce gate.
MIN_TERM_LENGTH = 2

# Results per model: enough to jump somewhere, not enough to flood
# the palette with one table's matches.
PER_MODEL_LIMIT = 5


class SearchViewSet(ViewSet):
    permission_classes = [IsActiveStaff]
    parser_classes = [JSONParser]
    renderer_classes = [JSONRenderer]

    def __init__(self, *args, **kwargs):
        # Forward kwargs: action-level overrides (permission_classes,
        # authentication_classes) arrive through the viewset init.
        super().__init__(*args, **kwargs)
        admin_site = cs_settings.ADMIN_SITE
        self.authentication_classes = [
            admin_site.token_backend.active_backend.authentication_class
        ]

    def list(self, request):
        """
        Search the registered models for a term. Only models with
        search_fields and view permission are searched; the results
        are grouped per model, capped at PER_MODEL_LIMIT entries.
        """
        term = (request.query_params.get("search") or "").strip()

        if len(term) < MIN_TERM_LENGTH:
            return Response([])

        site = cs_settings.ADMIN_SITE
        groups = []

        for model, studio in site._registry.items():
            if not studio.search_fields:
                continue

            if not studio.has_view_permission(request):
                continue

            query = reduce(
                operator.or_,
                (Q(**{f"{field}__icontains": term}) for field in studio.search_fields),
            )
            ordering = studio.ordering or ["pk"]
            queryset = get_tenant_scoped_queryset(request, model).filter(query)

            if getattr(studio, "soft_delete", ""):
                queryset = queryset.filter(**{f"{studio.soft_delete}__isnull": True})

            items = [
                {"id": obj.pk, "title": str(obj)[:200]}
                for obj in queryset.order_by(*ordering)[:PER_MODEL_LIMIT]
            ]

            if items:
                groups.append(
                    {
                        "model": model._meta.label_lower,
                        "verbose_name": str(model._meta.verbose_name_plural),
                        "icon": studio.icon,
                        "results": items,
                    }
                )

        return Response(groups)
