"""
Tests for the MainMenuButton extension: its serialization, its
visibility in discover and the run endpoint.
"""

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from content_studio.admin import admin_site
from content_studio.checks import check_content_studio
from content_studio.extensions import MainMenuButton, MainMenuLink
from content_studio.form import ButtonResult
from content_studio.signals import content_changed, record_change
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.models import Article


class ClearCacheButton(MainMenuButton):
    label = "Clear cache"
    icon = "ph-bold ph-broom"

    def handle(self, request):
        return "The cache is cleared."


class SuperuserButton(MainMenuButton):
    label = "Rotate keys"

    def is_visible(self, request):
        return request.user.is_superuser

    def handle(self, request):
        return ButtonResult(message="Rotated.", value="new-key")


class PublishAllButton(MainMenuButton):
    label = "Publish all"

    def handle(self, request):
        for article in Article.objects.all():
            record_change(request, article, "updated", "Published.")


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


def staff(username="editor"):
    return User.objects.create_user(username=username, password="x", is_staff=True)


@pytest.fixture
def buttons(monkeypatch):
    extensions = [
        MainMenuLink(url="https://example.com", label="Website"),
        ClearCacheButton(confirm="Clear the cache?"),
        SuperuserButton(),
        PublishAllButton(),
    ]
    monkeypatch.setattr(admin_site, "extensions", extensions, raising=False)
    return extensions


def run_url(button):
    return f"/api/extensions/{button.extension_id}/run"


def test_a_button_serializes_its_options():
    button = ClearCacheButton(confirm="Clear the cache?", color="amber")

    assert button.serialize() == {
        "extension_type": "MainMenuButton",
        "extension_id": str(button.extension_id),
        "config": {
            "label": "Clear cache",
            "icon": "ph-bold ph-broom",
            "color": "amber",
            "confirm": "Clear the cache?",
            "weight": 0,
        },
    }


def test_arguments_override_the_class_attributes_and_set_the_id():
    renamed = ClearCacheButton(label="Empty cache")

    assert renamed.label == "Empty cache"
    assert renamed.icon == "ph-bold ph-broom"
    assert renamed.extension_id != ClearCacheButton().extension_id
    assert ClearCacheButton().extension_id == ClearCacheButton().extension_id


def test_a_button_needs_a_label():
    with pytest.raises(ValueError):
        MainMenuButton()


@pytest.mark.django_db
def test_discover_lists_only_the_buttons_the_request_may_see(buttons):
    link, clear, rotate, publish = buttons

    def listed(user):
        extensions = client_for(user).get("/api/discover").json()["extensions"]
        return [extension["extension_id"] for extension in extensions]

    assert listed(staff()) == [
        str(link.extension_id),
        str(clear.extension_id),
        str(publish.extension_id),
    ]
    assert str(rotate.extension_id) in listed(
        User.objects.create_superuser(username="admin", password="x")
    )


@pytest.mark.django_db
def test_running_a_button_returns_its_result(buttons):
    _, clear, rotate, _ = buttons
    admin = client_for(User.objects.create_superuser(username="admin", password="x"))

    assert admin.post(run_url(clear)).json() == {
        "message": "The cache is cleared.",
        "value": None,
    }
    assert admin.post(run_url(rotate)).json() == {
        "message": "Rotated.",
        "value": "new-key",
    }


@pytest.mark.django_db
def test_a_hidden_button_cannot_run(buttons):
    _, _, rotate, _ = buttons

    assert client_for(staff()).post(run_url(rotate)).status_code == 403


@pytest.mark.django_db
def test_running_needs_a_staff_user(buttons):
    _, clear, _, _ = buttons
    user = User.objects.create_user(username="visitor", password="x")

    assert APIClient().post(run_url(clear)).status_code == 401
    assert client_for(user).post(run_url(clear)).status_code in (401, 403)


@pytest.mark.django_db
def test_unknown_extensions_and_links_do_not_run(buttons):
    link, *_ = buttons
    client = client_for(staff())

    assert client.post("/api/extensions/not-a-uuid/run").status_code == 404
    assert client.post(run_url(link)).status_code == 404


@pytest.mark.django_db(transaction=True)
def test_the_changes_a_button_records_are_sent_together(buttons):
    *_, publish = buttons
    articles = [Article.objects.create(title=title) for title in "ab"]
    sent = []

    def receiver(sender, changes, **kwargs):
        sent.append(sorted(change.object_id for change in changes))

    content_changed.connect(receiver)
    try:
        client_for(staff()).post(run_url(publish))
    finally:
        content_changed.disconnect(receiver)

    assert sent == [sorted(str(article.pk) for article in articles)]


def test_duplicate_button_ids_are_reported(monkeypatch):
    monkeypatch.setattr(
        admin_site,
        "extensions",
        [ClearCacheButton(), ClearCacheButton()],
        raising=False,
    )

    assert "content_studio.E003" in [m.id for m in check_content_studio()]


def test_links_and_buttons_carry_their_weight():
    assert ClearCacheButton(weight=-5).serialize()["config"]["weight"] == -5
    link = MainMenuLink(url="https://example.com", label="Website", weight=3)
    assert link.serialize()["config"]["weight"] == 3
    assert MainMenuLink(url="/", label="Home").serialize()["config"]["weight"] == 0
