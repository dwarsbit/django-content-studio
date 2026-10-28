"""
Tests for the Button component: its serialization, its state and run
endpoints, and the permissions and visibility that gate them.
"""

import pytest
from django.contrib.auth.models import Permission, User
from rest_framework.test import APIClient

from content_studio.form import Button, ButtonResult
from content_studio.signals import content_changed, record_change
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.admin import ArticleAdmin
from tests.testapp.models import Article

ARTICLES = "/api/content/testapp.article"


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


def staff_with(*codenames, username="editor"):
    user = User.objects.create_user(username=username, password="x", is_staff=True)
    user.user_permissions.add(*Permission.objects.filter(codename__in=codenames))
    return User.objects.get(pk=user.pk)


class PublishButton(Button):
    label = "Publish"
    icon = "ph-bold ph-paper-plane-tilt"
    confirm = "Publish this article?"
    allowed_permissions = ["change"]

    def is_visible(self, obj, request):
        return obj.status != Article.Status.PUBLISHED

    def handle(self, obj, request):
        obj.status = Article.Status.PUBLISHED
        obj.save(update_fields=["status"])
        record_change(request, obj, "updated", "Published.")
        return "Published."


class SecretButton(Button):
    label = "Show secret"

    def handle(self, obj, request):
        return ButtonResult(message="A new secret.", value="s3cr3t")


class SilentButton(Button):
    label = "Nothing"

    def handle(self, obj, request):
        return None


@pytest.fixture
def buttons(monkeypatch):
    components = [PublishButton(), SecretButton(), SilentButton()]
    monkeypatch.setattr(
        ArticleAdmin, "edit_sidebar", ArticleAdmin.edit_sidebar + components
    )
    return components


def url(article, button, run=False):
    return f"{ARTICLES}/{article.pk}/components/{button.component_id}" + (
        "/run" if run else ""
    )


def test_a_button_serializes_its_options():
    button = PublishButton()

    assert button.serialize() == {
        "type": "component",
        "component_type": "Button",
        "component_id": str(button.component_id),
        "label": "Publish",
        "icon": "ph-bold ph-paper-plane-tilt",
        "confirm": "Publish this article?",
        "destructive": False,
    }


def test_the_id_follows_the_label():
    assert PublishButton().component_id == PublishButton().component_id
    assert PublishButton().component_id != SecretButton().component_id


@pytest.mark.django_db
def test_running_a_button_returns_its_message(buttons):
    publish, *_ = buttons
    article = Article.objects.create(title="a")
    client = client_for(staff_with("view_article", "change_article"))

    response = client.post(url(article, publish, run=True))

    assert response.status_code == 200
    assert response.json() == {"message": "Published.", "value": None}
    article.refresh_from_db()
    assert article.status == Article.Status.PUBLISHED


@pytest.mark.django_db
def test_a_result_can_carry_a_value_or_nothing(buttons):
    _, secret, silent = buttons
    article = Article.objects.create(title="a")
    client = client_for(staff_with("view_article"))

    assert client.post(url(article, secret, run=True)).json() == {
        "message": "A new secret.",
        "value": "s3cr3t",
    }
    assert client.post(url(article, silent, run=True)).json() == {
        "message": None,
        "value": None,
    }


@pytest.mark.django_db
def test_the_state_reports_visibility_and_permissions(buttons):
    publish, secret, _ = buttons
    article = Article.objects.create(title="a")
    published = Article.objects.create(title="b", status=Article.Status.PUBLISHED)
    editor = client_for(staff_with("view_article", "change_article"))

    assert editor.get(url(article, publish)).json() == {"visible": True}
    assert editor.get(url(published, publish)).json() == {"visible": False}
    assert editor.get(url(article, secret)).json() == {"visible": True}


@pytest.mark.django_db
def test_a_button_needs_its_permissions_and_visibility(buttons):
    publish, *_ = buttons
    article = Article.objects.create(title="a")
    published = Article.objects.create(title="b", status=Article.Status.PUBLISHED)
    viewer = client_for(staff_with("view_article"))

    assert viewer.get(url(article, publish)).json() == {"visible": False}
    assert viewer.post(url(article, publish, run=True)).status_code == 403

    editor = client_for(staff_with("view_article", "change_article", username="other"))
    assert editor.post(url(published, publish, run=True)).status_code == 403

    article.refresh_from_db()
    assert article.status == Article.Status.DRAFT


@pytest.mark.django_db
def test_a_button_needs_view_permission(buttons):
    _, secret, _ = buttons
    article = Article.objects.create(title="a")
    client = client_for(staff_with())

    assert client.get(url(article, secret)).status_code == 403
    assert client.post(url(article, secret, run=True)).status_code == 403


@pytest.mark.django_db
def test_only_buttons_run(buttons):
    from content_studio.form import ActivityLog

    article = Article.objects.create(title="a")
    client = client_for(staff_with("view_article"))
    unknown = f"{ARTICLES}/{article.pk}/components/"

    assert client.post(unknown + "not-a-uuid/run").status_code == 404
    assert client.post(unknown + f"{ActivityLog().component_id}/run").status_code == 404


@pytest.mark.django_db(transaction=True)
def test_the_changes_a_button_records_are_sent(buttons):
    publish, *_ = buttons
    article = Article.objects.create(title="a")
    client = client_for(staff_with("view_article", "change_article"))
    sent = []

    def receiver(sender, changes, **kwargs):
        sent.append([(change.action, change.object_id) for change in changes])

    content_changed.connect(receiver)
    try:
        client.post(url(article, publish, run=True))
    finally:
        content_changed.disconnect(receiver)

    assert sent == [[("updated", str(article.pk))]]
