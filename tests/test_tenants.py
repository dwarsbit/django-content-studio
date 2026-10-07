"""
Tests for tenant scoping: AdminSite.get_tenants is the single
authorization hook, and tenant-scoped models fail closed.

Scratch models with app_label="content_studio" get their tables via
run_syncdb during test database setup.
"""

import pytest
from django.db import models
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from content_studio.admin import admin_site
from content_studio.utils import get_tenant_scoped_queryset


class TenantModel(models.Model):
    name = models.CharField(max_length=20)

    class Meta:
        app_label = "content_studio"


class TenantItem(models.Model):
    tenant = models.ForeignKey(TenantModel, on_delete=models.CASCADE)

    class Meta:
        app_label = "content_studio"


def make_request(tenant_id=None):
    headers = {}
    if tenant_id is not None:
        headers["HTTP_X_DCS_TENANT"] = str(tenant_id)
    return Request(APIRequestFactory().get("/", **headers), parsers=[JSONParser()])


TENANT_SETTINGS = {
    "ADMIN_SITE": "content_studio.admin.admin_site",
    "TENANT_MODEL": "test_tenants.TenantModel",
}


@pytest.mark.django_db
def test_non_scoped_models_are_unaffected():
    from django.test import override_settings

    with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
        result = get_tenant_scoped_queryset(make_request(), TenantModel)

        # Unfiltered queryset, no exception: TenantModel has no tenant field.
        assert list(result) == list(TenantModel.objects.all())


@pytest.mark.django_db
def test_scoped_model_without_header_fails_closed():
    from django.test import override_settings

    with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
        result = get_tenant_scoped_queryset(make_request(), TenantItem)

        assert not result.exists()


@pytest.mark.django_db
def test_scoped_model_filters_by_authorized_tenant():
    from django.test import override_settings

    a = TenantModel.objects.create(name="a")
    b = TenantModel.objects.create(name="b")
    TenantItem.objects.create(tenant=a)
    TenantItem.objects.create(tenant=b)

    with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
        result = get_tenant_scoped_queryset(make_request(a.pk), TenantItem)

        assert set(result.values_list("tenant_id", flat=True)) == {a.pk}


@pytest.mark.django_db
def test_unauthorized_tenant_is_rejected():
    from django.test import override_settings

    a = TenantModel.objects.create(name="a")
    b = TenantModel.objects.create(name="b")

    original = admin_site.get_tenants

    try:
        # Only tenant a is accessible for this user.
        admin_site.get_tenants = (
            lambda tenant_model, **kwargs: tenant_model.objects.filter(pk=a.pk)
        )

        with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
            with pytest.raises(PermissionDenied):
                get_tenant_scoped_queryset(make_request(b.pk), TenantItem)
    finally:
        admin_site.get_tenants = original
