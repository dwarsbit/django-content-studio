"""
The duplicate check for combinations of fields: Meta.unique_together and
UniqueConstraints over several fields. While an editor types, the edit
page asks whether another object already uses the combination of values
in the form.

Only what can be checked reliably is offered: constraints over plain
fields, optionally with a condition. Functional constraints
(expressions), deferrable constraints and sets with generated, many-to-
many or primary key fields are skipped. The check is only a warning:
it must never report a clash the database would accept.
"""

from dataclasses import dataclass

from django.core.exceptions import FieldDoesNotExist, FieldError
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError, connections, router
from django.db.models import F, Q, UniqueConstraint, Value

from .utils import get_tenant_field_name


@dataclass(frozen=True)
class UniqueSet:
    # unique_together:<fields> or constraint:<name>.
    id: str
    # The fields whose combination must be unique, without the tenant
    # field: the check is scoped to the tenant already.
    fields: tuple
    condition: Q | None = None
    # The fields the condition reads, by name.
    condition_fields: tuple = ()
    # nulls_distinct=False: a null value clashes with another null.
    nulls_equal: bool = False

    def serialize(self):
        data = {"id": self.id, "fields": list(self.fields)}

        if self.condition_fields:
            data["condition_fields"] = list(self.condition_fields)

        if self.nulls_equal:
            data["nulls_equal"] = True

        return data


def _checkable_field(model, name):
    try:
        field = model._meta.get_field(name)
    except FieldDoesNotExist:
        return None

    if (
        not getattr(field, "concrete", False)
        or field.many_to_many
        or field.primary_key
        or getattr(field, "generated", False)
    ):
        return None

    return field


def _references(node):
    """The field names a condition reads, or None if it cannot be read."""
    if isinstance(node, Q):
        names = []
        for child in node.children:
            if isinstance(child, tuple):
                lookup, value = child
                names.append(lookup.split("__")[0])
                refs = _references(value)
            else:
                refs = _references(child)
            if refs is None:
                return None
            names.extend(refs)
        return names

    if isinstance(node, F):
        return [node.name.split("__")[0]]

    if hasattr(node, "get_source_expressions"):
        names = []
        for expression in node.get_source_expressions():
            refs = _references(expression)
            if refs is None:
                return None
            names.extend(refs)
        return names

    if hasattr(node, "resolve_expression"):
        # An expression of an unknown shape.
        return None

    return []


def _unique_set(model, set_id, names, condition=None, nulls_equal=False):
    if len(names) < 2:
        return None

    fields = [_checkable_field(model, name) for name in names]
    if not all(fields):
        return None

    condition_fields = ()
    if condition is not None:
        refs = _references(condition)
        if refs is None:
            return None
        referenced = [_checkable_field(model, name) for name in refs]
        if not all(referenced):
            return None
        condition_fields = tuple(dict.fromkeys(field.name for field in referenced))

    tenant_field = get_tenant_field_name(model)

    return UniqueSet(
        id=set_id,
        fields=tuple(field.name for field in fields if field.name != tenant_field),
        condition=condition,
        condition_fields=condition_fields,
        nulls_equal=nulls_equal,
    )


def get_unique_sets(model):
    """The combinations of fields of a model the editor can check."""
    opts = model._meta
    sets = []
    # A database without NULLS NOT DISTINCT ignores nulls_distinct=False.
    features = connections[router.db_for_write(model)].features
    supports_nulls_equal = features.supports_nulls_distinct_unique_constraints

    for names in opts.unique_together:
        sets.append(_unique_set(model, f"unique_together:{','.join(names)}", names))

    for constraint in opts.constraints:
        if (
            not isinstance(constraint, UniqueConstraint)
            or constraint.expressions
            or constraint.deferrable is not None
        ):
            continue

        sets.append(
            _unique_set(
                model,
                f"constraint:{constraint.name}",
                constraint.fields,
                condition=constraint.condition,
                nulls_equal=(
                    constraint.nulls_distinct is False and supports_nulls_equal
                ),
            )
        )

    return [unique_set for unique_set in sets if unique_set is not None]


def _python_value(field, value):
    """The field's value for a form value; raises ValueError if invalid."""
    # An empty form value of a field that holds no empty strings (a
    # number, a date, a relation) is null.
    if value == "" and not field.empty_strings_allowed:
        return None

    try:
        return field.to_python(value)
    except (DjangoValidationError, TypeError):
        raise ValueError


def find_duplicate(unique_set, model, queryset, values, instance=None, tenant=None):
    """
    The first object in the queryset that uses the combination, or None.

    values holds the form's values by field name. A value missing from
    the form comes from the object being edited (instance); a new object
    has none, so its set fields must all be in the form. Condition fields
    of a new object fall back to the field's default. The tenant field
    takes the tenant's id.
    """
    opts = model._meta
    tenant_field = get_tenant_field_name(model)

    def value_of(name, fallback_to_default):
        field = opts.get_field(name)

        if name == tenant_field:
            return field.to_python(tenant)

        if name in values:
            return _python_value(field, values[name])

        if instance is not None:
            return getattr(instance, field.attname)

        if fallback_to_default and (field.has_default() or field.null):
            return field.get_default()

        raise KeyError(name)

    try:
        lookups = {}
        for name in unique_set.fields:
            field = opts.get_field(name)
            value = value_of(name, fallback_to_default=False)

            if value is None:
                # NULL never equals NULL, unless the constraint says so.
                if not unique_set.nulls_equal:
                    return None
                lookups[f"{field.attname}__isnull"] = True
            elif value in field.empty_values:
                return None
            else:
                lookups[field.attname] = value

        if unique_set.condition is not None:
            against = {}
            for name in unique_set.condition_fields:
                field = opts.get_field(name)
                value = Value(
                    value_of(name, fallback_to_default=True), output_field=field
                )
                against[field.name] = value
                against[field.attname] = value

            # Only an object that meets the condition can clash, and
            # only with objects that meet it as well.
            if not unique_set.condition.check(against, using=queryset.db):
                return None

            queryset = queryset.filter(unique_set.condition)
    except (KeyError, ValueError, FieldError, DatabaseError):
        # A value the form does not hold or the field cannot take, or a
        # condition that cannot be evaluated: no warning.
        return None

    if instance is not None:
        queryset = queryset.exclude(pk=instance.pk)

    return queryset.filter(**lookups).first()
