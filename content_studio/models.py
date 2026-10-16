import uuid
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from .managers import (
    SingletonManager,
    SoftDeletableManager,
    SoftDeletableQuerySet,
)


class UUIDModel(models.Model):
    class Meta:
        abstract = True

    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)


class TimeStampedModel(models.Model):
    class Meta:
        abstract = True
        get_latest_by = "created_at"
        ordering = ["-created_at"]

    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Created at"))

    modified_at = models.DateTimeField(auto_now=True, verbose_name=_("Modified at"))


class EditorModel(models.Model):
    class Meta:
        abstract = True

    edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="%(app_label)s_%(class)s_edited",
        editable=False,
        verbose_name=_("Edited by"),
    )


class ManualOrderModel(models.Model):
    class Meta:
        abstract = True
        ordering = ["order_key"]

    # The order key determines the relative position of the object. Objects are ordered by ascending key.
    order_key = models.IntegerField(default=0, verbose_name=_("Order key"))

    def reorder(self):
        qs = type(self)._default_manager.all().order_by("order_key")
        idx = 1
        for obj in qs:
            obj.order_key = idx
            obj.save()
            idx += 1


class SoftDeletableModel(models.Model):
    class Meta:
        abstract = True

    objects = SoftDeletableQuerySet.as_manager()

    available_objects = SoftDeletableManager()

    removed_at = models.DateTimeField(
        null=True, editable=False, verbose_name=_("Removed at")
    )

    @property
    def is_removed(self):
        return self.removed_at is not None

    def delete(
        self, using: Any = None, keep_parents: bool = False, soft: bool = True
    ) -> tuple[int, dict[str, int]]:
        """
        Soft-deletes by default: stamps removed_at instead of removing the row.
        Pass soft=False to delete for real.
        """
        if soft:
            self.removed_at = timezone.now()
            self.save(using=using)
            return 1, {self.__class__._meta.label: 1}

        return super().delete(using=using, keep_parents=keep_parents)


class ContentModel(UUIDModel, TimeStampedModel, EditorModel):
    class Meta(TimeStampedModel.Meta):
        abstract = True


class SoftDeletableContentModel(ContentModel, SoftDeletableModel):
    class Meta(ContentModel.Meta):
        abstract = True


class SingletonModel(UUIDModel):
    class Meta(UUIDModel.Meta):
        abstract = True

    objects = SingletonManager()

    # Enforces a single row per concrete model at the database level.
    singleton = models.BooleanField(
        default=True, editable=False, unique=True, verbose_name=_("Singleton")
    )

    @property
    def is_singleton(self):
        return True
