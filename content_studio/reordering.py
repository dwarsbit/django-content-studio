"""
Reordering: moving an object to another position in its list.

A studio enables it by naming its reorder_field, the numeric field the
list is ordered by. The built-in implementation below rewrites that
field for the objects between the old and the new position; studios
backed by another ordering implementation override the studio's
reorder method instead.
"""

from django.db import models, router, transaction

from .utils import get_related_field_name, get_tenant_field_name

# The field types the built-in implementation can rewrite.
NUMERIC_FIELDS = (models.IntegerField, models.FloatField, models.DecimalField)


def get_reorder_scope(studio) -> list[str]:
    """
    The fields whose values partition a studio's order, as attnames:
    the studio's reorder_scope plus, for inlines, the foreign key to
    the parent and, for tenant-scoped models, the tenant. Objects are
    only ever ordered among those sharing these values.
    """
    model = studio.model
    names = list(getattr(studio, "reorder_scope", None) or [])

    parent_model = getattr(studio, "parent_model", None)
    if parent_model is not None:
        names.append(get_related_field_name(studio, parent_model))

    tenant_field = get_tenant_field_name(model)
    if tenant_field:
        names.append(tenant_field)

    attnames = []
    for name in names:
        attname = model._meta.get_field(name).attname
        if attname not in attnames:
            attnames.append(attname)

    return attnames


def get_scope_queryset(studio, obj) -> models.QuerySet:
    """
    Every object sharing obj's scope, trashed ones included: they keep
    their keys, so restoring them puts them back where they were.
    """
    return studio.model._base_manager.filter(
        **{attname: getattr(obj, attname) for attname in get_reorder_scope(studio)}
    )


def is_strictly_increasing(keys) -> bool:
    return all(
        key is not None and (index == 0 or keys[index - 1] < key)
        for index, key in enumerate(keys)
    )


def _rewrite(rows, order, field, keys):
    """
    Give the rows the keys in the given order of pks and save the
    changed ones in one query. Returns whether anything changed.
    """
    by_pk = {row.pk: row for row in rows}
    changed = []

    for pk, key in zip(order, keys):
        row = by_pk[pk]

        if getattr(row, field) != key:
            setattr(row, field, key)
            changed.append(row)

    if changed:
        model = type(changed[0])
        model._base_manager.db_manager(changed[0]._state.db).bulk_update(
            changed, [field]
        )

    return bool(changed)


def move(queryset, obj, field: str, *, after=None, before=None) -> bool:
    """
    Place obj directly after `after` or directly before `before` within
    queryset (the objects sharing obj's scope), rewriting the numeric
    `field`. Unique, increasing keys are reused, so only the objects
    between the old and the new position change and gaps survive;
    duplicate or empty keys (a fresh ManualOrderModel table is all
    zeros) are renumbered from 1. Returns whether anything moved.
    """
    target = after if after is not None else before

    if target is None or target.pk == obj.pk:
        return False

    with transaction.atomic(using=router.db_for_write(queryset.model)):
        rows = list(queryset.select_for_update().order_by(field, "pk").only(field))
        pks = [row.pk for row in rows]

        if obj.pk not in pks or target.pk not in pks:
            raise ValueError("The object and its target must share a list.")

        order = [pk for pk in pks if pk != obj.pk]
        index = order.index(target.pk) + (1 if after is not None else 0)
        order.insert(index, obj.pk)

        if order == pks:
            return False

        keys = [getattr(row, field) for row in rows]
        if not is_strictly_increasing(keys):
            keys = list(range(1, len(rows) + 1))

        return _rewrite(rows, order, field, keys)


def renumber(queryset, field: str) -> bool:
    """
    Renumber `field` from 1 in the current order (field, then pk),
    saving only the changed objects. Returns whether anything changed.
    """
    with transaction.atomic(using=router.db_for_write(queryset.model)):
        rows = list(queryset.select_for_update().order_by(field, "pk").only(field))

        return _rewrite(rows, [row.pk for row in rows], field, range(1, len(rows) + 1))
