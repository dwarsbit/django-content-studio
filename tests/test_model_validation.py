"""
Model validation on save: like the classic admin, a save runs the model's
clean(), its unique checks and its constraints, and reports their errors
per field, or as non-field errors for the editor to show above the form.
"""

import pytest
from django.contrib.auth.models import Permission, User
from django.core.exceptions import NON_FIELD_ERRORS, ValidationError
from rest_framework.test import APIClient

from content_studio.token_backends.jwt import create_access_token
from tests.testapp.admin import ArticleAdmin
from tests.testapp.models import Article, Category, SiteSettings

pytestmark = pytest.mark.django_db

URL = "/api/content/testapp.article"


@pytest.fixture
def client():
    user = User.objects.create_user(username="editor", password="x", is_staff=True)
    user.user_permissions.add(
        *Permission.objects.filter(
            codename__in=[
                "view_article",
                "add_article",
                "change_article",
                "view_sitesettings",
                "add_sitesettings",
                "change_sitesettings",
            ]
        )
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


def rule(monkeypatch, model, clean):
    monkeypatch.setattr(model, "clean", clean, raising=False)


def no_published_without_date(self):
    if self.status == Article.Status.PUBLISHED and not self.published_at:
        raise ValidationError(
            {"published_at": "A published article needs a publication date."}
        )


def test_a_field_error_from_clean_is_reported_on_the_field(client, monkeypatch):
    rule(monkeypatch, Article, no_published_without_date)

    response = client.post(URL, {"title": "A", "status": "published"}, format="json")

    assert response.status_code == 400
    assert response.json() == {
        "published_at": ["A published article needs a publication date."]
    }
    assert not Article.objects.exists()


def test_a_non_field_error_from_clean_is_a_non_field_error(client, monkeypatch):
    def clean(self):
        if self.title == self.body:
            raise ValidationError("The body must say more than the title.")

    rule(monkeypatch, Article, clean)
    article = Article.objects.create(title="A", body="B")

    response = client.patch(f"{URL}/{article.pk}", {"body": "A"}, format="json")

    assert response.status_code == 400
    assert response.json() == {
        "non_field_errors": ["The body must say more than the title."]
    }
    article.refresh_from_db()
    assert article.body == "B"


def test_errors_of_fields_the_form_does_not_write_are_non_field_errors(
    client, monkeypatch
):
    """views is not on the edit page: its error cannot sit on a field,
    so it is a non-field error that names the field."""

    def clean(self):
        raise ValidationError(
            {"views": "Too many views.", NON_FIELD_ERRORS: ["Not now."]}
        )

    rule(monkeypatch, Article, clean)

    response = client.post(URL, {"title": "A"}, format="json")

    assert response.status_code == 400
    assert sorted(response.json()["non_field_errors"]) == [
        "Not now.",
        "Views: Too many views.",
    ]


def test_a_valid_save_keeps_what_clean_changed(client, monkeypatch):
    def clean(self):
        self.title = self.title.strip()

    rule(monkeypatch, Article, clean)

    response = client.post(URL, {"title": "  Spaced  "}, format="json")

    assert response.status_code == 201, response.content
    assert Article.objects.get().title == "Spaced"

    article = Article.objects.get()
    response = client.patch(f"{URL}/{article.pk}", {"title": "  Again "}, format="json")

    assert response.status_code == 200, response.content
    article.refresh_from_db()
    assert article.title == "Again"


def test_create_still_sets_many_to_many_values(client, monkeypatch):
    monkeypatch.setattr(
        ArticleAdmin, "edit_sidebar", ["published_at", "rating", "categories"]
    )
    news = Category.objects.create(name="News")

    response = client.post(
        URL, {"title": "A", "categories": [{"id": news.pk}]}, format="json"
    )

    assert response.status_code == 201, response.content
    assert list(Article.objects.get().categories.all()) == [news]


def test_server_set_fields_are_not_reported_as_blank(client):
    """created_by is null=True without blank=True, and the server sets
    it: field checks are the serializer's, not clean_fields()'."""
    response = client.post(URL, {"title": "A"}, format="json")

    assert response.status_code == 201, response.content


def test_a_singleton_is_validated_before_its_manager_creates_it(client, monkeypatch):
    def clean(self):
        if self.tagline and self.tagline == self.site_name:
            raise ValidationError({"tagline": "Say something else."})

    rule(monkeypatch, SiteSettings, clean)
    url = "/api/content/testapp.sitesettings"

    response = client.post(url, {"site_name": "Same", "tagline": "Same"}, format="json")

    assert response.status_code == 400
    assert response.json() == {"tagline": ["Say something else."]}
    assert not SiteSettings.objects.exists()

    response = client.post(
        url, {"site_name": "Site", "tagline": "A tagline"}, format="json"
    )

    assert response.status_code == 201, response.content
    assert SiteSettings.objects.get().tagline == "A tagline"
