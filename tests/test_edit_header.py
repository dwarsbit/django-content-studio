"""
Tests for edit_header (components in the edit page's header, on studios
and inlines), the inline permissions in the admin payload, and
get_created_result (shown once after creating an object).
"""

import pytest
from django.contrib.auth.models import Permission, User
from rest_framework.test import APIClient, APIRequestFactory

from content_studio.admin import AdminSerializer, ModelStudio, admin_site
from content_studio.checks import check_content_studio
from content_studio.form import Button, ButtonResult, Field, Link
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.admin import ArticleAdmin, ReviewInline
from tests.testapp.models import Article, Review

ARTICLES = "/api/content/testapp.article"
REVIEWS = "/api/inlines/testapp.article/testapp.review"


class HelpfulButton(Button):
    label = "Mark as helpful"

    def handle(self, obj, request):
        obj.stars = 5
        obj.save(update_fields=["stars"])
        return "Marked."


class ArchiveButton(Button):
    label = "Archive"

    def handle(self, obj, request):
        return "Archived."


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


def staff_with(*codenames):
    user = User.objects.create_user(username="editor", password="x", is_staff=True)
    user.user_permissions.add(*Permission.objects.filter(codename__in=codenames))
    return User.objects.get(pk=user.pk)


def payload(user):
    request = APIRequestFactory().get("/")
    request.user = user
    studio = admin_site._registry[Article]
    return AdminSerializer(studio).serialize(request)


@pytest.fixture
def headers(monkeypatch):
    archive, helpful = ArchiveButton(), HelpfulButton()
    monkeypatch.setattr(ArticleAdmin, "edit_header", [archive])
    monkeypatch.setattr(ReviewInline, "edit_header", [helpful])
    return archive, helpful


@pytest.mark.django_db
def test_the_header_is_serialized_for_studios_and_inlines(headers):
    archive, helpful = headers

    data = payload(User.objects.create_superuser(username="admin", password="x"))

    assert data["edit"]["header"] == [archive.serialize()]
    review_inline = data["edit"]["inlines"][0]
    assert review_inline["model"] == "testapp.review"
    assert review_inline["header"] == [helpful.serialize()]


@pytest.mark.django_db
def test_inlines_carry_their_permissions(monkeypatch):
    monkeypatch.setattr(
        ReviewInline, "has_add_permission", lambda self, request, obj=None: False
    )

    data = payload(staff_with("view_article", "view_review", "change_review"))

    assert data["edit"]["inlines"][0]["permissions"] == {
        "add_permission": False,
        "change_permission": True,
        "delete_permission": False,
        "view_permission": True,
    }


@pytest.mark.django_db
def test_header_buttons_run_on_studios_and_inline_rows(headers):
    archive, helpful = headers
    article = Article.objects.create(title="a")
    review = Review.objects.create(article=article, text="Good", stars=1)
    client = client_for(User.objects.create_superuser(username="admin", password="x"))

    response = client.post(
        f"{ARTICLES}/{article.pk}/components/{archive.component_id}/run"
    )
    assert response.json() == {"message": "Archived.", "value": None}

    response = client.post(
        f"{REVIEWS}/{review.pk}/components/{helpful.component_id}/run"
    )
    assert response.status_code == 200
    review.refresh_from_db()
    assert review.stars == 5


@pytest.mark.django_db
def test_an_inline_button_follows_the_inline_permissions(headers):
    _, helpful = headers
    review = Review.objects.create(article=Article.objects.create(title="a"), text="x")
    client = client_for(staff_with("view_article"))

    response = client.post(
        f"{REVIEWS}/{review.pk}/components/{helpful.component_id}/run"
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_the_created_result_travels_with_the_create_response(monkeypatch):
    client = client_for(User.objects.create_superuser(username="admin", password="x"))

    response = client.post(ARTICLES, {"title": "plain"}, format="json")
    assert "__result__" not in response.json()

    monkeypatch.setattr(
        ArticleAdmin,
        "get_created_result",
        lambda self, request, obj: ButtonResult(
            message=f"Created {obj.title}.", value="s3cr3t"
        ),
    )
    response = client.post(ARTICLES, {"title": "secret"}, format="json")
    assert response.status_code == 201
    assert response.json()["__result__"] == {
        "message": "Created secret.",
        "value": "s3cr3t",
    }

    monkeypatch.setattr(
        ArticleAdmin, "get_created_result", lambda self, request, obj: "Hello."
    )
    response = client.post(ARTICLES, {"title": "message"}, format="json")
    assert response.json()["__result__"] == {"message": "Hello.", "value": None}


def checked(monkeypatch, studio_class, header):
    monkeypatch.setattr(studio_class, "edit_header", header)
    return [m for m in check_content_studio() if m.id == "content_studio.E019"]


def test_header_entries_must_be_components(monkeypatch):
    assert checked(monkeypatch, ArticleAdmin, [ArchiveButton()]) == []
    assert len(checked(monkeypatch, ArticleAdmin, ["title", Field("body")])) == 2
    assert len(checked(monkeypatch, ArticleAdmin, ArchiveButton())) == 1
    monkeypatch.setattr(ArticleAdmin, "edit_header", [])
    assert len(checked(monkeypatch, ReviewInline, ["text"])) == 1


def test_duplicate_ids_in_inline_headers_are_reported(monkeypatch):
    monkeypatch.setattr(ArticleAdmin, "edit_header", [ArchiveButton()])
    monkeypatch.setattr(ReviewInline, "edit_header", [ArchiveButton()])

    assert [m.id for m in check_content_studio() if m.id == "content_studio.E005"] == [
        "content_studio.E005"
    ]


def test_inline_studios_find_their_header_components(headers):
    _, helpful = headers

    assert (
        ReviewInline(Article, admin_site).get_component(helpful.component_id) is helpful
    )
    assert ModelStudio(Review, admin_site).get_component(helpful.component_id) is None


class ReviewLink(Link):
    label = "Open review"

    def get_url(self, obj, request):
        return f"https://example.com/reviews/{obj.pk}"


@pytest.mark.django_db
def test_inline_rows_reach_the_components_of_the_inline_models_studio(monkeypatch):
    link, helpful = ReviewLink(), HelpfulButton()

    class ReviewStudio(ModelStudio):
        edit_sidebar = [link, helpful]

    monkeypatch.setitem(admin_site._registry, Review, ReviewStudio(Review, admin_site))
    review = Review.objects.create(article=Article.objects.create(title="a"), text="x")
    client = client_for(User.objects.create_superuser(username="admin", password="x"))

    response = client.get(f"{REVIEWS}/{review.pk}/components/{link.component_id}")
    assert response.json() == {"url": f"https://example.com/reviews/{review.pk}"}

    response = client.post(
        f"{REVIEWS}/{review.pk}/components/{helpful.component_id}/run"
    )
    assert response.json() == {"message": "Marked.", "value": None}


@pytest.mark.django_db
def test_the_inline_studios_permissions_gate_the_models_components(monkeypatch):
    helpful = HelpfulButton()
    helpful.allowed_permissions = ["change"]

    class ReviewStudio(ModelStudio):
        edit_sidebar = [helpful]

    monkeypatch.setitem(admin_site._registry, Review, ReviewStudio(Review, admin_site))
    monkeypatch.setattr(
        ReviewInline, "has_change_permission", lambda self, request, obj=None: False
    )
    review = Review.objects.create(article=Article.objects.create(title="a"), text="x")
    client = client_for(User.objects.create_superuser(username="admin", password="x"))

    response = client.post(
        f"{REVIEWS}/{review.pk}/components/{helpful.component_id}/run"
    )

    assert response.status_code == 403
