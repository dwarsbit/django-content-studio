"""
Tests for the display-only text components (Title, Subtitle, Text and
Callout): their serialization and IDs, per-object text through the
component endpoint, and the edit_header check.
"""

import pytest
from django.contrib.auth.models import Permission, User
from django.utils.translation import gettext_lazy as _
from django.utils.translation import override as override_language
from rest_framework.test import APIClient

from content_studio.checks import check_content_studio
from content_studio.form import Callout, FieldLayout, FormSet, Subtitle, Text, Title
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.admin import ArticleAdmin
from tests.testapp.models import Article

ARTICLES = "/api/content/testapp.article"


class WordCount(Text):
    def get_text(self, obj, request):
        return f"**{len(obj.title.split())}** words in the title."


class StatusCallout(Callout):
    variant = "warning"
    title = "Status"

    def get_text(self, obj, request):
        return f"This article is {obj.status}."


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


@pytest.fixture
def components(monkeypatch):
    components = [Title("Publishing"), WordCount(), StatusCallout()]
    monkeypatch.setattr(
        ArticleAdmin, "edit_sidebar", ArticleAdmin.edit_sidebar + components
    )
    return components


def url(article, component):
    return f"{ARTICLES}/{article.pk}/components/{component.component_id}"


@pytest.mark.parametrize(
    "cls,component_type", [(Title, "Title"), (Subtitle, "Subtitle"), (Text, "Text")]
)
def test_static_text_serializes(cls, component_type):
    component = cls("Some *text*")

    assert component.serialize() == {
        "type": "component",
        "component_type": component_type,
        "component_id": str(component.component_id),
        "when": None,
        "text": "Some *text*",
        "per_object": False,
    }


def test_a_callout_serializes_its_options():
    callout = Callout(
        "Changes go live immediately.",
        title="Heads up",
        variant="warning",
        icon="ph-bold ph-lightning",
    )

    assert callout.serialize() == {
        "type": "component",
        "component_type": "Callout",
        "component_id": str(callout.component_id),
        "when": None,
        "text": "Changes go live immediately.",
        "per_object": False,
        "title": "Heads up",
        "variant": "warning",
        "icon": "ph-bold ph-lightning",
    }


def test_a_callout_defaults_to_info_without_title_or_icon():
    data = Callout("Note").serialize()

    assert (data["variant"], data["title"], data["icon"]) == ("info", None, None)


def test_an_unknown_callout_variant_is_rejected():
    with pytest.raises(ValueError, match="variant"):
        Callout("Note", variant="error")


def test_static_text_is_required():
    with pytest.raises(ValueError, match="needs a text"):
        Text()


def test_text_can_be_a_class_attribute():
    class Intro(Text):
        text = "Welcome."

    assert Intro().serialize()["text"] == "Welcome."


def test_lazy_text_translates():
    title = Title(_("Activity"))

    with override_language("nl"):
        assert title.serialize()["text"] == "Activiteit"


def test_the_id_follows_the_text_and_type():
    assert Text("A").component_id == Text("A").component_id
    assert Text("A").component_id != Text("B").component_id
    assert Text("A").component_id != Title("A").component_id
    assert Callout("A").component_id != Callout("A", title="T").component_id
    assert WordCount().component_id != StatusCallout().component_id


def test_per_object_text_is_not_serialized():
    data = WordCount().serialize()

    assert data["per_object"] is True
    assert data["text"] is None


def test_text_components_fit_in_form_sets_but_not_field_layouts():
    form_set = FormSet(title="Info", fields=[Title("A"), "title", Callout("B")])

    assert [f["type"] for f in form_set.serialize()["fields"]] == [
        "component",
        "field",
        "component",
    ]

    with pytest.raises(ValueError):
        FieldLayout(fields=[Text("A")])


@pytest.mark.django_db
def test_per_object_text_is_fetched_for_the_object(components, admin_user):
    article = Article.objects.create(title="Three word title")
    client = client_for(admin_user)
    _title, word_count, status = components

    response = client.get(url(article, word_count))
    assert response.status_code == 200
    assert response.json() == {"text": "**3** words in the title."}

    response = client.get(url(article, status))
    assert response.json() == {"text": f"This article is {article.status}."}


@pytest.mark.django_db
def test_static_text_is_served_too(components, admin_user):
    article = Article.objects.create(title="A")
    title = components[0]

    response = client_for(admin_user).get(url(article, title))

    assert response.json() == {"text": "Publishing"}


@pytest.mark.django_db
def test_per_object_text_needs_view_permission(components):
    article = Article.objects.create(title="A")
    user = User.objects.create_user(username="nobody", password="x", is_staff=True)

    response = client_for(user).get(url(article, components[1]))

    assert response.status_code in (403, 404)

    user.user_permissions.add(Permission.objects.get(codename="view_article"))
    user = User.objects.get(pk=user.pk)

    assert client_for(user).get(url(article, components[1])).status_code == 200


def test_text_components_are_rejected_in_the_header(monkeypatch):
    monkeypatch.setattr(ArticleAdmin, "edit_header", [Title("Heading")])

    errors = [m for m in check_content_studio() if m.id == "content_studio.E020"]

    assert len(errors) == 1
    assert "text component" in errors[0].msg
