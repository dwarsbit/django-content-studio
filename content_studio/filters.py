from decimal import Decimal

from django.db import models
from rest_framework.exceptions import ParseError
from rest_framework.filters import BaseFilterBackend

from .utils import flatten


class LookupFilter(BaseFilterBackend):
    """
    A permissive filter backend that basically allows every supported lookup
    for a given field. Automatically handles multi-value lookups and booleans.
    Also supports exclusion.
    """

    MULTI_VALUE_LOOKUPS = ["in", "range"]

    EXCLUDE_SYMBOL = "~"

    NON_FILTER_FIELDS = ["search", "limit", "page", "ordering"]

    def filter_queryset(self, request, queryset, view):
        """
        Build the queryset based on the query params and the view's model.
        Only apply filters in list endpoints.
        """
        if getattr(view, "action", None) == "list":
            try:
                filter_kwargs, exclude_kwargs = self.get_filter_kwargs(
                    model_class=view.queryset.model,
                    query_params=request.query_params,
                )
            except Exception as e:
                print(e)
                raise ParseError(detail="Invalid filter parameters")
            return queryset.filter(**filter_kwargs).exclude(**exclude_kwargs).distinct()

        return queryset

    def get_filter_kwargs(self, model_class, query_params):
        filter_kwargs = {}
        exclude_kwargs = {}

        field_lookups = self.get_field_lookups(model_class=model_class)

        for key, value in query_params.lists():
            if key in self.NON_FILTER_FIELDS:
                continue
            # By default Django supports repeated multi-values (e.g. `a=1&a=2`)
            # but we allow for comma-seperated multi-values as well (e.g. `a=1,2`).
            value = flatten([param.split(",") for param in value])
            is_exclude = key.startswith(self.EXCLUDE_SYMBOL)
            # The first part of a key is considered the field name
            field_name = key.split("__")[0]
            # Get the model field.
            field = model_class._meta.get_field(field_name)
            # Get the allowed lookups for this field.
            lookups = field_lookups.get(field_name, [])
            try:
                # The last part of a key is considered its lookup
                # but it's not required.
                lookup = key.split("__")[-1]
                if lookup not in lookups:
                    lookup = None
            except IndexError:
                lookup = None

            # Default to "in" lookup for multi values that do not
            # have an explicit lookup set.
            if len(value) > 1 and not lookup and "in" in lookups:
                lookup = "in"
                key = f"{key}__in"

            # Some lookups allow multiple values, otherwise
            # the first value is used.
            is_multi = lookup in self.MULTI_VALUE_LOOKUPS
            # Depending on the field type we cast the value to
            # its correct type (i.e. number, boolean, etc.).
            if is_multi:
                casted_value = [self.cast_field_value(v, field) for v in value]
            elif lookup == "isnull":
                casted_value = value[0] in ["1", "true", "on"]
            else:
                casted_value = self.cast_field_value(value[0], field)

            if is_exclude:
                exclude_kwargs[key] = casted_value
            else:
                filter_kwargs[key] = casted_value

        print(filter_kwargs)
        return filter_kwargs, exclude_kwargs

    @staticmethod
    def get_field_lookups(model_class):
        """
        Allow all supported lookups.
        """
        field_lookups = {}
        for model_field in model_class._meta.get_fields():
            lookup_list = model_field.get_lookups().keys()
            field_lookups[model_field.name] = lookup_list
        return field_lookups

    def cast_field_value(self, value: str, field):
        value = value.strip().lower()

        if isinstance(field, models.BooleanField):
            if value in ["1", "true", "on"]:
                return True
            if value in ["0", "false", "off"]:
                return False
        if isinstance(field, models.NullBooleanField):
            if value in ["null", "none", "empty"]:
                return None

        if isinstance(field, models.IntegerField):
            return int(value)

        if isinstance(field, models.DecimalField):
            return Decimal(value)

        if isinstance(field, models.FloatField):
            return float(value)

        return value
