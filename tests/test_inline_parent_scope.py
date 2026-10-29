"""
Inline lists look their parent up like the parent studio does: within the
tenant, outside the trash, and with a valid primary key.
"""

import pytest
from django.contrib.auth.models import Permission, User
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from content_studio.admin import admin_site
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.models import Category, Part, Product

PARTS = "/api/inlines/testapp.product/testapp.part"

TENANT_SETTINGS = {
    "ADMIN_SITE": "content_studio.admin.admin_site",
    "TENANT_MODEL": "tests.testapp.models.Category",
}


def editor_client(tenant=None):
    user = User.objects.create_user(username="editor", password="x", is_staff=True)
    user.user_permissions.add(
        *Permission.objects.filter(codename__in=["view_product", "view_part"])
    )
    client = APIClient()
    headers = {"HTTP_AUTHORIZATION": f"Bearer {create_access_token(user)}"}
    if tenant is not None:
        headers["HTTP_X_DCS_TENANT"] = str(tenant.pk)
    client.credentials(**headers)
    return client


@pytest.fixture
def only_tenant(monkeypatch):
    """Restrict the accessible tenants to the given one."""

    def restrict(tenant):
        monkeypatch.setattr(
            type(admin_site),
            "get_tenants",
            lambda self, tenant_model, **kwargs: tenant_model.objects.filter(
                pk=tenant.pk
            ),
        )

    return restrict


def make_product(slug, category=None, **kwargs):
    product = Product.objects.create(title=slug, slug=slug, category=category, **kwargs)
    Part.objects.create(product=product, name=f"{slug} part", code=f"{slug}-part")
    return product


@pytest.mark.django_db
@override_settings(CONTENT_STUDIO=TENANT_SETTINGS)
def test_inline_list_of_another_tenants_parent_is_refused(only_tenant):
    a = Category.objects.create(name="A")
    b = Category.objects.create(name="B")
    only_tenant(a)
    own = make_product("own", category=a)
    other = make_product("other", category=b)
    client = editor_client(tenant=a)

    response = client.get(PARTS, {"product": own.pk})
    assert response.status_code == 200, response.content
    assert [row["id"] for row in response.json()["results"]] == [own.part_set.get().pk]

    for params in ({"product": other.pk}, {"product_id": other.pk}):
        response = client.get(PARTS, params)
        assert response.status_code == 403, response.content


@pytest.mark.django_db
@override_settings(CONTENT_STUDIO=TENANT_SETTINGS)
def test_inline_list_without_tenant_header_is_refused(only_tenant):
    a = Category.objects.create(name="A")
    only_tenant(a)
    product = make_product("own", category=a)

    response = editor_client().get(PARTS, {"product": product.pk})

    assert response.status_code == 403, response.content


@pytest.mark.django_db
def test_inline_list_of_a_trashed_parent_is_refused():
    product = make_product("trashed", removed_at=timezone.now())

    response = editor_client().get(PARTS, {"product": product.pk})

    assert response.status_code == 403, response.content


@pytest.mark.django_db
@pytest.mark.parametrize("value", ["abc", "1.5", "1; drop"])
def test_inline_list_with_a_malformed_parent_id_is_a_client_error(value):
    make_product("p")

    response = editor_client().get(PARTS, {"product": value})

    assert response.status_code == 400, response.content
