"""
Tests for the user menu extensions and for hiding links per user.
"""

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from content_studio.admin import admin_site
from content_studio.extensions import MainMenuLink, UserMenuButton, UserMenuLink
from content_studio.token_backends.jwt import create_access_token


class SignOutEverywhereButton(UserMenuButton):
    label = "Sign out everywhere"
    icon = "ph-bold ph-sign-out"

    def handle(self, request):
        return "Signed out."


class SuperuserLink(UserMenuLink):
    def is_visible(self, request):
        return request.user.is_superuser


class SuperuserMainLink(MainMenuLink):
    def is_visible(self, request):
        return request.user.is_superuser


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


@pytest.fixture
def extensions(monkeypatch):
    extensions = [
        UserMenuLink(url="/profile/", label="Profile", icon="ph-bold ph-user"),
        SuperuserLink(url="/huey/", label="Task queue"),
        SuperuserMainLink(url="https://example.com", label="Analytics"),
        SignOutEverywhereButton(),
    ]
    monkeypatch.setattr(admin_site, "extensions", extensions, raising=False)
    return extensions


def test_user_menu_extensions_have_their_own_type():
    link = UserMenuLink(url="/profile/", label="Profile", weight=2)

    assert link.serialize() == {
        "extension_type": "UserMenuLink",
        "extension_id": str(link.extension_id),
        "config": {
            "url": "/profile/",
            "icon": None,
            "color": None,
            "label": "Profile",
            "weight": 2,
        },
    }
    assert SignOutEverywhereButton().serialize()["extension_type"] == ("UserMenuButton")


def test_a_user_menu_link_does_not_share_the_main_menu_links_id():
    assert (
        UserMenuLink(url="/a/", label="A").extension_id
        != MainMenuLink(url="/a/", label="A").extension_id
    )


@pytest.mark.django_db
def test_discover_leaves_out_the_links_the_request_may_not_see(extensions):
    profile, queue, analytics, button = extensions

    def listed(user):
        extensions = client_for(user).get("/api/discover").json()["extensions"]
        return [extension["extension_id"] for extension in extensions]

    editor = User.objects.create_user(username="editor", password="x", is_staff=True)
    admin = User.objects.create_superuser(username="admin", password="x")

    assert listed(editor) == [str(profile.extension_id), str(button.extension_id)]
    assert listed(admin) == [str(extension.extension_id) for extension in extensions]


@pytest.mark.django_db
def test_a_user_menu_button_runs(extensions):
    *_, button = extensions
    editor = User.objects.create_user(username="editor", password="x", is_staff=True)

    response = client_for(editor).post(f"/api/extensions/{button.extension_id}/run")

    assert response.json() == {"message": "Signed out.", "value": None}
