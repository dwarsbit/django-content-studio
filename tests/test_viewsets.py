"""
Tests for the CRUD viewset behaviors.
"""

import pytest
from django.contrib.auth import models as auth_models
from django.db import models
from django.utils import timezone

from content_studio.viewsets import BaseModelViewSet


class EditedItem(models.Model):
    name = models.CharField(max_length=10)
    edited_by = models.ForeignKey(
        auth_models.User, null=True, on_delete=models.SET_NULL
    )
    edited_at = models.DateTimeField(null=True)

    class Meta:
        app_label = "content_studio"


class StubSerializer:
    """Stands in for a DRF serializer: returns the instance on save."""

    def __init__(self, instance):
        self.instance = instance

    def save(self, **attrs):
        for name, value in attrs.items():
            setattr(self.instance, name, value)
        return self.instance


def make_viewset():
    class ViewSet(BaseModelViewSet):
        queryset = EditedItem.objects.none()

    return ViewSet()


@pytest.mark.django_db
def test_perform_update_stamps_editor_with_targeted_save():
    user = auth_models.User.objects.create_user(username="staff", password="x")
    other = auth_models.User.objects.create_user(username="other", password="x")
    item = EditedItem.objects.create(name="original", edited_by=other)

    viewset = make_viewset()

    class Request:
        pass

    viewset.request = Request()
    viewset.request.user = user

    before = timezone.now()
    viewset.perform_update(StubSerializer(item))

    # The editor and timestamp are stamped...
    item.refresh_from_db()
    assert item.edited_by == user
    assert item.edited_at is not None
    assert item.edited_at > before
    # ...and nothing else was overwritten: the race-prone full save is gone.
    assert item.name == "original"


@pytest.mark.django_db
def test_perform_update_stamps_nothing_without_audit_fields():
    """Models without edited_by/edited_at get no second save at all."""
    from django.contrib.admin.models import LogEntry

    user = auth_models.User.objects.create_user(username="staff", password="x")
    auth_models.Group.objects.create(name="editors")
    group = auth_models.Group.objects.first()

    viewset = make_viewset()
    viewset.queryset = auth_models.Group.objects.none()

    class Request:
        pass

    viewset.request = Request()
    viewset.request.user = user

    log_count = LogEntry.objects.count()
    viewset.perform_update(StubSerializer(group))

    # Only the audit log entry was created; no instance save happened.
    assert LogEntry.objects.count() == log_count + 1
