"""
Tests for conditions (when=): serializing Q objects and Conditions, the
evaluator shared with the frontend (tests/conditions_cases.json), the
fields a save does not write while hidden, the server-side condition
endpoint, and the system checks.
"""

import datetime
import json
from pathlib import Path

import pytest
from django.contrib.auth.models import Permission, User
from django.db.models import F, Q
from django.db.models.functions import Now
from django.utils import timezone
from rest_framework.test import APIClient

from content_studio.checks import check_content_studio
from content_studio.conditions import evaluate, referenced_fields, serialize
from content_studio.form import (
    Button,
    Callout,
    Condition,
    Field,
    FormSet,
    FormSetGroup,
    Text,
)
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.admin import ArticleAdmin
from tests.testapp.models import Article

ARTICLES = "/api/content/testapp.article"
CASES = json.loads((Path(__file__).parent / "conditions_cases.json").read_text())


class HasLongBody(Condition):
    fields = ["body"]
    calls = []

    def check(self, values, request):
        HasLongBody.calls.append(values)
        return len(values["body"] or "") > 20


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


@pytest.fixture
def staff(db):
    return User.objects.create_user("staff", password="x", is_staff=True)


@pytest.fixture
def superuser(db):
    return User.objects.create_superuser("admin", password="x")


# Serializing


def test_lookups_serialize():
    when = Q(status="published") & ~Q(views=0) | Q(title__icontains="news")

    assert serialize(when) == {
        "connector": "OR",
        "negated": False,
        "children": [
            {
                "connector": "AND",
                "negated": False,
                "children": [
                    {"field": "status", "lookup": "exact", "value": "published"},
                    {
                        "connector": "AND",
                        "negated": True,
                        "children": [{"field": "views", "lookup": "exact", "value": 0}],
                    },
                ],
            },
            {"field": "title", "lookup": "icontains", "value": "news"},
        ],
    }


def test_values_serialize():
    leaf = lambda when: serialize(when)["children"][0]["value"]  # noqa: E731

    assert leaf(Q(published_at__gt=Now())) == {"$now": 0}
    assert leaf(Q(published_at__lt=Now() + datetime.timedelta(days=7))) == {
        "$now": 604800
    }
    assert leaf(Q(published_at__gt=Now() - datetime.timedelta(hours=1))) == {
        "$now": -3600
    }
    assert leaf(Q(published_at__gte=F("edited_at"))) == {"$field": "edited_at"}
    assert leaf(Q(status=Article.Status.PUBLISHED)) == "published"
    assert leaf(Q(published_at__gte=datetime.date(2026, 1, 1))) == {
        "$date": "2026-01-01"
    }
    assert leaf(Q(views__in=(1, 2))) == [1, 2]
    assert leaf(Q(rating__gt=__import__("decimal").Decimal("2.5"))) == 2.5
    assert "$datetime" in leaf(
        Q(published_at__gt=datetime.datetime(2026, 1, 1, tzinfo=datetime.UTC))
    )


@pytest.mark.django_db
def test_model_instances_serialize_as_their_pk(staff):
    assert serialize(Q(author=staff))["children"][0]["value"] == staff.pk


@pytest.mark.parametrize(
    "when",
    [
        Q(author__username="ann"),
        Q(published_at__year=2026),
        Q(title__regex="^a"),
        Q(views__in=5),
        Q(views__range=(1, 2, 3)),
        Q(author__isnull="yes"),
        Q(views__gt=F("author__id")),
        Q(views__gt=F("rating") + 1),
        Q(views=object()),
    ],
)
def test_unsupported_conditions_are_rejected(when):
    with pytest.raises(ValueError):
        Field("title", when=when)


def test_when_must_be_a_condition():
    with pytest.raises(TypeError):
        Field("title", when={"status": "published"})

    with pytest.raises(TypeError):
        FormSet(when="status")


def test_conditions_combine_with_q():
    condition = HasLongBody()
    leaf = {"condition": str(condition.condition_id), "fields": ["body"]}

    assert serialize(~condition) == {
        "connector": "AND",
        "negated": True,
        "children": [leaf],
    }
    assert serialize(Q(status="draft") & condition)["children"] == [
        {"field": "status", "lookup": "exact", "value": "draft"},
        leaf,
    ]
    assert serialize(condition | Q(status="draft"))["connector"] == "OR"


def test_condition_ids_are_deterministic():
    assert HasLongBody().condition_id == HasLongBody().condition_id

    class Other(HasLongBody):
        pass

    assert Other().condition_id != HasLongBody().condition_id


def test_condition_fields_must_be_names():
    class Broken(Condition):
        fields = "body"

    with pytest.raises(TypeError):
        Broken()


def test_referenced_fields():
    when = Q(status="draft") & Q(views__lt=F("rating")) | HasLongBody()

    assert referenced_fields(when) == ["status", "views", "rating", "body"]


def test_form_items_serialize_when():
    when = Q(status="published")
    tree = serialize(when)

    assert Field("published_at", when=when).serialize()["when"] == tree
    assert FormSet(fields=["title"], when=when).serialize()["when"] == tree
    assert FormSetGroup("SEO", formsets=[], when=when).serialize()["when"] == tree
    assert Callout("Live", when=when).serialize()["when"] == tree
    assert Field("title").serialize()["when"] is None


def test_component_classes_take_when_as_an_attribute():
    class PublishButton(Button):
        label = "Publish"
        when = Q(status="draft")

        def handle(self, obj, request):
            return None

    assert PublishButton().serialize()["when"] == serialize(Q(status="draft"))


def test_when_does_not_change_component_ids():
    assert (
        Text("Hello").component_id == Text("Hello", when=Q(status="draft")).component_id
    )


# Evaluating: the cases the frontend evaluator runs too.


@pytest.mark.parametrize("case", CASES["cases"], ids=lambda case: case["name"])
def test_shared_cases(case):
    now = datetime.datetime.fromisoformat(case["now"].replace("Z", "+00:00"))
    server = case.get("server", {})

    with timezone.override(CASES["time_zone"]):
        result = evaluate(
            case["tree"],
            case["values"],
            now=now,
            run_condition=lambda leaf: server.get(leaf["condition"]),
        )

    assert result is case["expected"]


def test_no_condition_holds():
    assert evaluate(None, {}) is True


# Saving: hidden fields are not written.


@pytest.fixture
def conditional_article(monkeypatch):
    monkeypatch.setattr(
        ArticleAdmin,
        "edit_main",
        [
            FormSet(
                fields=[
                    "title",
                    "status",
                    Field("published_at", when=Q(status="published")),
                    "body",
                ]
            ),
            FormSet(title="Stats", fields=["views"], when=Q(status="published")),
        ],
    )
    monkeypatch.setattr(
        ArticleAdmin, "edit_sidebar", [Field("rating", when=HasLongBody())]
    )


def payload(**values):
    return {
        "title": "Hello",
        "body": "",
        "status": "draft",
        "published_at": None,
        "views": 0,
        "rating": None,
        "author": None,
        "categories": [],
        **values,
    }


@pytest.mark.django_db
def test_hidden_fields_keep_their_stored_values(superuser, conditional_article):
    article = Article.objects.create(
        title="Hello", published_at="2026-01-01T10:00:00Z", views=7, rating=4
    )

    response = client_for(superuser).put(
        f"{ARTICLES}/{article.pk}",
        payload(published_at="2026-02-02T10:00:00Z", views=99, rating="1.0"),
        format="json",
    )

    assert response.status_code == 200, response.data
    article.refresh_from_db()
    assert article.published_at == datetime.datetime(
        2026, 1, 1, 10, tzinfo=datetime.UTC
    )
    assert article.views == 7
    assert article.rating == 4


@pytest.mark.django_db
def test_shown_fields_are_written(superuser, conditional_article):
    article = Article.objects.create(title="Hello")

    response = client_for(superuser).put(
        f"{ARTICLES}/{article.pk}",
        payload(
            status="published",
            published_at="2026-02-02T10:00:00Z",
            views=99,
            body="A body that is long enough.",
            rating="1.0",
        ),
        format="json",
    )

    assert response.status_code == 200, response.data
    article.refresh_from_db()
    assert article.published_at == datetime.datetime(
        2026, 2, 2, 10, tzinfo=datetime.UTC
    )
    assert article.views == 99
    assert str(article.rating) == "1.0"


@pytest.mark.django_db
def test_hidden_fields_are_not_validated(superuser, conditional_article):
    article = Article.objects.create(title="Hello")

    response = client_for(superuser).put(
        f"{ARTICLES}/{article.pk}",
        payload(published_at="not a date", views="many"),
        format="json",
    )

    assert response.status_code == 200, response.data


@pytest.mark.django_db
def test_conditions_read_stored_values_the_request_does_not_send(
    superuser, conditional_article
):
    article = Article.objects.create(title="Hello", status="published")

    response = client_for(superuser).patch(
        f"{ARTICLES}/{article.pk}", {"views": 5}, format="json"
    )

    assert response.status_code == 200, response.data
    article.refresh_from_db()
    assert article.views == 5


@pytest.mark.django_db
def test_create_hides_fields_by_their_defaults(superuser, conditional_article):
    response = client_for(superuser).post(
        ARTICLES, payload(views=12, published_at="2026-02-02T10:00:00Z"), format="json"
    )

    assert response.status_code == 201, response.data
    article = Article.objects.get(pk=response.data["id"])
    assert article.views == 0
    assert article.published_at is None


@pytest.mark.django_db
def test_hidden_tabs_hide_their_fields(superuser, monkeypatch):
    monkeypatch.setattr(
        ArticleAdmin,
        "edit_main",
        [
            FormSetGroup("Content", formsets=[FormSet(fields=["title", "status"])]),
            FormSetGroup(
                "Stats",
                formsets=[FormSet(fields=["views"])],
                when=Q(status="published"),
            ),
        ],
    )
    article = Article.objects.create(title="Hello", views=3)

    response = client_for(superuser).put(
        f"{ARTICLES}/{article.pk}", payload(views=50), format="json"
    )

    assert response.status_code == 200, response.data
    article.refresh_from_db()
    assert article.views == 3


@pytest.mark.django_db
def test_a_field_placed_twice_shows_if_one_placement_shows(superuser, monkeypatch):
    monkeypatch.setattr(
        ArticleAdmin,
        "edit_main",
        [FormSet(fields=["title", "status", Field("views", when=Q(status="x"))])],
    )
    monkeypatch.setattr(ArticleAdmin, "edit_sidebar", ["views"])
    article = Article.objects.create(title="Hello", views=3)

    response = client_for(superuser).put(
        f"{ARTICLES}/{article.pk}", payload(views=50), format="json"
    )

    assert response.status_code == 200, response.data
    article.refresh_from_db()
    assert article.views == 50


# The server-side condition endpoint.


def condition_url(condition):
    return f"{ARTICLES}/conditions/{condition.condition_id}"


@pytest.mark.django_db
def test_condition_endpoint_answers(superuser, conditional_article):
    HasLongBody.calls.clear()
    client = client_for(superuser)

    response = client.post(
        condition_url(HasLongBody()),
        {"values": {"body": "A body that is long enough.", "title": "Secret"}},
        format="json",
    )

    assert response.status_code == 200
    assert response.data == {"result": True}
    # Only the condition's own fields reach check().
    assert HasLongBody.calls == [{"body": "A body that is long enough."}]

    response = client.post(
        condition_url(HasLongBody()), {"values": {"body": "Short"}}, format="json"
    )

    assert response.data == {"result": False}


@pytest.mark.django_db
def test_condition_endpoint_needs_view_or_add_permission(staff, conditional_article):
    url = condition_url(HasLongBody())

    assert client_for(staff).post(url, {"values": {}}, format="json").status_code == 403

    staff.user_permissions.add(Permission.objects.get(codename="add_article"))
    staff = User.objects.get(pk=staff.pk)

    assert client_for(staff).post(url, {"values": {}}, format="json").status_code == 200


@pytest.mark.django_db
def test_condition_endpoint_unknown_condition(superuser, conditional_article):
    client = client_for(superuser)

    class Unused(HasLongBody):
        pass

    assert (
        client.post(condition_url(Unused()), {"values": {}}, format="json").status_code
        == 404
    )
    assert (
        client.post(
            condition_url(HasLongBody()), {"values": "body"}, format="json"
        ).status_code
        == 400
    )


@pytest.mark.django_db
def test_discover_reports_the_time_zone(superuser):
    response = client_for(superuser).get("/api/discover")

    assert response.data["time_zone"] == timezone.get_current_timezone_name()


# System checks.


def check_ids(messages):
    return [message.id for message in messages]


def test_check_reports_unknown_condition_fields(monkeypatch):
    monkeypatch.setattr(
        ArticleAdmin,
        "edit_main",
        [FormSet(fields=["title", Field("body", when=Q(kind="news"))])],
    )

    messages = [m for m in check_content_studio() if m.id == "content_studio.E040"]

    assert len(messages) == 1
    assert "'kind'" in messages[0].msg


def test_check_reports_excluded_condition_fields(monkeypatch):
    monkeypatch.setattr(ArticleAdmin, "exclude", ["views"])
    monkeypatch.setattr(
        ArticleAdmin,
        "edit_main",
        [FormSet(fields=["title", Callout("Popular", when=Q(views__gt=100))])],
    )

    assert "content_studio.E040" in check_ids(check_content_studio())


def test_check_warns_about_required_conditional_fields(monkeypatch):
    monkeypatch.setattr(
        ArticleAdmin,
        "edit_main",
        [FormSet(fields=[Field("title", when=Q(status="draft")), "status"])],
    )

    messages = [m for m in check_content_studio() if m.id == "content_studio.W024"]

    assert len(messages) == 1
    assert "'title'" in messages[0].msg


def test_checks_pass_for_valid_conditions(conditional_article):
    ids = check_ids(check_content_studio())

    assert "content_studio.E040" not in ids
    assert "content_studio.W024" not in ids
