from django.db import models
from django.utils import timezone


class SingletonManager(models.Manager):
    def get(self, *args, **kwargs):
        """
        Get will return the singleton instance if it exists and None otherwise.
        """
        return super().first()

    def create(self, **kwargs):
        """
        Creates the singleton if it doesn't already exist.
        Otherwise updates the existing instance.
        """
        singleton = self.get()

        if not singleton:
            return super().create(**kwargs)

        for name, value in kwargs.items():
            setattr(singleton, name, value)

        singleton.save()

        return singleton


class SoftDeletableQuerySet(models.QuerySet):
    def delete(self):
        """
        Soft-deletes every instance in the queryset: stamps removed_at
        instead of removing rows.
        """
        count = self.update(removed_at=timezone.now())
        return count, {self.model._meta.label: count}


class SoftDeletableManager(models.Manager):
    def get_queryset(self):
        return SoftDeletableQuerySet(self.model, using=self._db).filter(
            removed_at__isnull=True
        )
