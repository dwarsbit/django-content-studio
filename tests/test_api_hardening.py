"""
API hardening: only the edit form's fields are written, the tenant comes
from the tenant header alone, primary keys need not be called id, and
malformed input answers with a client error instead of a server error.
"""

import pytest
from django.contrib.admin.models import LogEntry
from django.contrib.auth.models import Permission, User
from django.db import models
from django.test import override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIClient, APIRequestFactory

from content_studio.admin import admin_site
from content_studio.form import ActivityLog
from content_studio.serializers import ContentRelatedField
from content_studio.token_backends.jwt import create_access_token
from content_studio.viewsets import BaseModelViewSet
from tests.testapp.admin import ArticleAdmin
from tests.testapp.models import Article, Category, Label, Page, Track

TENANT_SETTINGS = {
    "ADMIN_SITE": "content_studio.admin.admin_site",
    "TENANT_MODEL": "tests.testapp.models.Category",
}


class PageLink(models.Model):
    """A model relating to a tenant-scoped model (Page, by category)."""

    page = models.ForeignKey(Page, on_delete=models.CASCADE)

    class Meta:
        app_label = "content_studio"


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


def staff_with(*codenames):
    user = User.objects.create_user(username="editor", password="x", is_staff=True)
    user.user_permissions.add(*Permission.objects.filter(codename__in=codenames))
    return User.objects.get(pk=user.pk)


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


# Form fields


@pytest.mark.django_db
def test_fields_outside_the_edit_form_are_not_written():
    article = Article.objects.create(title="a", views=1)
    client = client_for(staff_with("view_article", "change_article"))

    response = client.patch(
        f"/api/content/testapp.article/{article.pk}",
        {"title": "b", "views": 999},
        format="json",
    )

    assert response.status_code == 200, response.content
    article.refresh_from_db()
    assert article.title == "b"
    # views is not on ArticleAdmin's edit page.
    assert article.views == 1
    # ... but it is still read.
    assert response.json()["views"] == 1


@pytest.mark.django_db
def test_excluded_fields_are_not_written(monkeypatch):
    monkeypatch.setattr(ArticleAdmin, "edit_main", [])
    monkeypatch.setattr(ArticleAdmin, "edit_sidebar", [])
    monkeypatch.setattr(ArticleAdmin, "exclude", ["views"])
    article = Article.objects.create(title="a", views=1)
    client = client_for(staff_with("view_article", "change_article"))

    response = client.patch(
        f"/api/content/testapp.article/{article.pk}",
        {"body": "text", "views": 999},
        format="json",
    )

    assert response.status_code == 200, response.content
    article.refresh_from_db()
    assert article.body == "text"
    assert article.views == 1


# Tenants


@pytest.mark.django_db
def test_tenant_field_cannot_move_an_object_to_another_tenant(only_tenant):
    a = Category.objects.create(name="A")
    b = Category.objects.create(name="B")
    only_tenant(a)
    page = Page.objects.create(title="p", slug="p", category=a)

    with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
        client = client_for(staff_with("view_page", "change_page"))
        response = client.patch(
            f"/api/content/testapp.page/{page.pk}",
            {"category": {"id": b.pk}},
            format="json",
            HTTP_X_DCS_TENANT=str(a.pk),
        )

    assert response.status_code == 200, response.content
    page.refresh_from_db()
    assert page.category == a


@pytest.mark.django_db
def test_create_takes_the_tenant_from_the_header(only_tenant):
    a = Category.objects.create(name="A")
    b = Category.objects.create(name="B")
    only_tenant(a)

    with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
        client = client_for(staff_with("view_page", "add_page"))
        response = client.post(
            "/api/content/testapp.page",
            {"title": "q", "slug": "q", "category": {"id": b.pk}},
            format="json",
            HTTP_X_DCS_TENANT=str(a.pk),
        )

    assert response.status_code == 201, response.content
    assert Page.objects.get(slug="q").category == a


@pytest.mark.django_db
def test_create_without_a_tenant_header_is_rejected():
    b = Category.objects.create(name="B")

    with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
        client = client_for(staff_with("view_page", "add_page"))
        response = client.post(
            "/api/content/testapp.page",
            {"title": "q", "slug": "q", "category": {"id": b.pk}},
            format="json",
        )

    assert response.status_code == 400
    assert not Page.objects.filter(slug="q").exists()


def tenant_request(tenant_id, user=None):
    request = Request(
        APIRequestFactory().post(
            "/", {"search": ""}, format="json", HTTP_X_DCS_TENANT=str(tenant_id)
        ),
        parsers=[JSONParser()],
    )
    request.user = user
    return request


@pytest.mark.django_db
def test_related_objects_are_picked_from_the_tenant_only():
    a = Category.objects.create(name="A")
    b = Category.objects.create(name="B")
    own = Page.objects.create(title="own", slug="own", category=a)
    other = Page.objects.create(title="other", slug="other", category=b)

    with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
        field = ContentRelatedField(queryset=Page.objects.all())
        field._context = {"request": tenant_request(a.pk)}

        assert field.to_internal_value({"id": own.pk}) == own
        with pytest.raises(ValidationError):
            field.to_internal_value({"id": other.pk})


@pytest.mark.django_db
def test_relations_endpoint_lists_the_tenant_only():
    a = Category.objects.create(name="A")
    b = Category.objects.create(name="B")
    Page.objects.create(title="own", slug="own", category=a)
    Page.objects.create(title="other", slug="other", category=b)
    user = User.objects.create_superuser(username="admin", password="x")

    viewset = BaseModelViewSet()
    viewset.queryset = PageLink.objects.none()
    viewset._admin_model = None

    with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
        response = viewset.get_related_objects(tenant_request(a.pk, user), "page")

    assert [item["__str__"] for item in response.data] == ["own"]


# Permissions


@pytest.mark.django_db
def test_relation_picker_works_for_editors_without_add_permission():
    client = client_for(staff_with("view_article", "change_article", "view_user"))

    response = client.post(
        "/api/content/testapp.article/relations/author", {}, format="json"
    )

    assert response.status_code == 200, response.content


@pytest.mark.django_db
def test_relation_picker_works_for_creators_without_view_permission():
    client = client_for(staff_with("add_article", "view_user"))

    response = client.post(
        "/api/content/testapp.article/relations/author", {}, format="json"
    )

    assert response.status_code == 200, response.content


@pytest.mark.django_db
def test_relation_picker_still_requires_a_permission_on_the_model():
    client = client_for(staff_with("view_user"))

    response = client.post(
        "/api/content/testapp.article/relations/author", {}, format="json"
    )

    assert response.status_code == 403


# Primary keys not called id


@pytest.mark.django_db
def test_models_with_a_custom_primary_key_name():
    client = client_for(User.objects.create_superuser(username="admin", password="x"))
    url = "/api/content/testapp.label"

    response = client.post(url, {"code": "news", "name": "News"}, format="json")
    assert response.status_code == 201, response.content
    assert response.json()["id"] == "news"

    rows = client.get(url).json()["results"]
    assert [row["id"] for row in rows] == ["news"]
    assert client.get(url, {"ordering": "-id"}).status_code == 200

    response = client.patch(f"{url}/news", {"name": "Updates"}, format="json")
    assert response.status_code == 200, response.content
    assert Label.objects.get(pk="news").name == "Updates"

    assert client.get(f"{url}/news/activity").status_code == 200
    assert client.delete(f"{url}/news").status_code == 204
    assert LogEntry.objects.filter(object_id="news").count() == 3


@pytest.mark.django_db
def test_related_objects_with_a_custom_primary_key_name():
    label = Label.objects.create(code="news", name="News")
    field = ContentRelatedField(queryset=Label.objects.all())
    field._context = {}

    assert field.to_representation(label) == {"id": "news", "__str__": "News"}
    assert field.to_internal_value({"id": "news"}) == label


# Client errors instead of server errors


@pytest.mark.django_db
def test_bulk_action_with_malformed_ids_is_a_client_error():
    client = client_for(staff_with("view_article", "delete_article"))

    response = client.post(
        "/api/content/testapp.article/bulk",
        {"action": "delete", "ids": ["not-a-number"]},
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_related_item_with_malformed_id_is_a_client_error():
    client = client_for(staff_with("view_article", "change_article"))
    article = Article.objects.create(title="a")

    response = client.patch(
        f"/api/content/testapp.article/{article.pk}",
        {"author": {"id": "not-a-number"}},
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_relations_endpoint_on_a_plain_field_is_a_client_error():
    client = client_for(User.objects.create_superuser(username="admin", password="x"))

    response = client.post(
        "/api/content/testapp.article/relations/title", {}, format="json"
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_undecodable_authorization_header_is_unauthorized():
    client = APIClient()

    response = client.get(
        "/api/me", HTTP_AUTHORIZATION=b"Bearer \xff\xfe".decode("latin-1")
    )

    assert response.status_code == 401


@pytest.mark.django_db
def test_component_without_a_handler_is_not_found(monkeypatch):
    component = ActivityLog()
    monkeypatch.setattr(
        ArticleAdmin, "edit_sidebar", ArticleAdmin.edit_sidebar + [component]
    )
    article = Article.objects.create(title="a")
    client = client_for(staff_with("view_article"))

    response = client.get(
        f"/api/content/testapp.article/{article.pk}/components/"
        f"{component.component_id}"
    )

    assert response.status_code == 404


def test_tenant_field_is_described_as_read_only():
    from content_studio.serializers import ModelSerializer

    with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
        fields = ModelSerializer(Page).serialize()["fields"]

    assert fields["category"]["readonly"] is True
    assert "readonly" not in fields["title"]


# Malformed query parameters and headers: client errors, never a 500


class CategoryGuard(models.Model):
    """Protects its category from being deleted."""

    category = models.ForeignKey(Category, on_delete=models.PROTECT)

    class Meta:
        app_label = "content_studio"


class CategoryLock(models.Model):
    """Restricts its category from being deleted."""

    category = models.ForeignKey(Category, on_delete=models.RESTRICT)

    class Meta:
        app_label = "content_studio"


class PageGuard(models.Model):
    """Protects its page (a soft-deletable model) from being deleted."""

    page = models.ForeignKey(Page, on_delete=models.PROTECT)

    class Meta:
        app_label = "content_studio"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "query",
    [
        {"title__icontains__exact": "x"},
        {"title__exact__in": "x"},
        {"category": "abc"},
        {"category__in": "1,abc"},
        {"~category": "abc"},
    ],
)
def test_malformed_filters_are_a_client_error(query):
    client = client_for(User.objects.create_superuser(username="admin", password="x"))

    response = client.get("/api/content/testapp.track", query)

    assert response.status_code == 400


@pytest.mark.django_db
def test_relation_filter_casts_the_value():
    category = Category.objects.create(name="c")
    Track.objects.create(title="in", category=category)
    Track.objects.create(title="out")
    client = client_for(User.objects.create_superuser(username="admin", password="x"))

    response = client.get("/api/content/testapp.track", {"category": str(category.pk)})

    assert response.status_code == 200
    assert [row["title"] for row in response.json()["results"]] == ["in"]


@pytest.mark.django_db
@pytest.mark.parametrize("tenant", ["abc", "1.5", " "])
def test_malformed_tenant_header_is_forbidden(tenant):
    client = client_for(User.objects.create_superuser(username="admin", password="x"))

    with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
        listed = client.get("/api/content/testapp.page", HTTP_X_DCS_TENANT=tenant)
        created = client.post(
            "/api/content/testapp.page",
            {"title": "t", "slug": "t"},
            format="json",
            HTTP_X_DCS_TENANT=tenant,
        )

    assert listed.status_code == 403
    assert listed.json()["detail"] == "Unknown or unauthorized tenant."
    assert created.status_code == 403
    assert not Page.objects.exists()


@pytest.mark.django_db
@pytest.mark.parametrize("guard", [CategoryGuard, CategoryLock])
def test_delete_blocked_by_a_reference_is_a_conflict(guard):
    category = Category.objects.create(name="c")
    guard.objects.create(category=category)
    client = client_for(User.objects.create_superuser(username="admin", password="x"))

    response = client.delete(f"/api/content/testapp.category/{category.pk}")

    assert response.status_code == 409
    assert guard._meta.verbose_name in response.json()["detail"]
    assert Category.objects.filter(pk=category.pk).exists()
    assert not LogEntry.objects.exists()


@pytest.mark.django_db
def test_bulk_delete_blocked_by_a_reference_is_a_conflict():
    category = Category.objects.create(name="c")
    CategoryGuard.objects.create(category=category)
    client = client_for(User.objects.create_superuser(username="admin", password="x"))

    response = client.post(
        "/api/content/testapp.category/bulk",
        {"action": "delete", "ids": [str(category.pk)]},
        format="json",
    )

    assert response.status_code == 409
    assert Category.objects.filter(pk=category.pk).exists()
    assert not LogEntry.objects.exists()


@pytest.mark.django_db
def test_permanent_delete_blocked_by_a_reference_is_a_conflict():
    page = Page.objects.create(title="p", slug="p")
    PageGuard.objects.create(page=page)
    client = client_for(User.objects.create_superuser(username="admin", password="x"))
    client.delete(f"/api/content/testapp.page/{page.pk}")
    LogEntry.objects.all().delete()

    response = client.delete(f"/api/content/testapp.page/{page.pk}/destroy")

    assert response.status_code == 409
    assert Page.objects.filter(pk=page.pk).exists()
    assert not LogEntry.objects.exists()
