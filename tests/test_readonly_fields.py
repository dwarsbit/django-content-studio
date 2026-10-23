"""
Studio-level read-only fields: readonly_fields and get_readonly_fields,
shown read-only on the edit page and never written through the API.
"""

from unittest import mock

from django.core import checks as django_checks
from django.test import RequestFactory

from content_studio.admin import AdminSerializer, ModelStudio, admin_site
from content_studio.checks import check_content_studio
from content_studio.form import Field
from tests.test_e2e_crud import AuthenticatedTestCase
from tests.testapp.admin import ReviewInline
from tests.testapp.models import Article, Review

ARTICLE_URL = "/api/content/testapp.article"


def article_studio():
    return admin_site._registry[Article]


class ReadonlyFieldsApiTests(AuthenticatedTestCase):
    def setUp(self):
        self.client = self.client_for(self.create_user(superuser=True))

    def test_readonly_field_is_not_written_on_update(self):
        article = Article.objects.create(title="Original", body="old")

        with mock.patch.object(article_studio(), "readonly_fields", ["title"]):
            response = self.client.patch(
                f"{ARTICLE_URL}/{article.id}",
                {"title": "Changed", "body": "new"},
                format="json",
            )

        assert response.status_code == 200
        article.refresh_from_db()
        assert article.title == "Original"
        assert article.body == "new"

    def test_readonly_field_is_not_written_on_create(self):
        with mock.patch.object(article_studio(), "readonly_fields", ["views"]):
            response = self.client.post(
                ARTICLE_URL, {"title": "New", "views": 99}, format="json"
            )

        assert response.status_code == 201
        assert Article.objects.get(title="New").views == 0

    def test_detail_reports_the_objects_readonly_fields(self):
        article = Article.objects.create(title="Existing")

        def get_readonly_fields(request, obj=None):
            return ["title"] if obj else []

        with mock.patch.object(
            article_studio(), "get_readonly_fields", get_readonly_fields
        ):
            detail = self.client.get(f"{ARTICLE_URL}/{article.id}").json()
            created = self.client.post(
                ARTICLE_URL, {"title": "Fresh"}, format="json"
            ).json()

        assert detail["__readonly_fields__"] == ["title"]
        # The create request had no object yet, so the title was
        # written; the response reports the saved object's fields.
        assert Article.objects.filter(title="Fresh").exists()
        assert created["__readonly_fields__"] == ["title"]

    def test_object_dependent_readonly_field_is_enforced(self):
        article = Article.objects.create(title="Fixed")

        def get_readonly_fields(request, obj=None):
            return ["title"] if obj else []

        with mock.patch.object(
            article_studio(), "get_readonly_fields", get_readonly_fields
        ):
            self.client.patch(
                f"{ARTICLE_URL}/{article.id}", {"title": "Moved"}, format="json"
            )

        article.refresh_from_db()
        assert article.title == "Fixed"

    def test_edit_page_readonly_field_is_enforced_too(self):
        article = Article.objects.create(title="Original")

        with mock.patch.object(
            article_studio(), "edit_main", [Field("title", readonly=True), "body"]
        ):
            self.client.patch(
                f"{ARTICLE_URL}/{article.id}", {"title": "Changed"}, format="json"
            )

        article.refresh_from_db()
        assert article.title == "Original"

    def test_list_rows_carry_no_readonly_fields(self):
        Article.objects.create(title="Row")

        row = self.client.get(ARTICLE_URL).json()["results"][0]

        assert "__readonly_fields__" not in row

    def test_inline_readonly_field_is_not_written(self):
        article = Article.objects.create(title="Parent")
        review = Review.objects.create(article=article, text="Good", stars=4)

        with mock.patch.object(ReviewInline, "readonly_fields", ["stars"]):
            response = self.client.patch(
                f"/api/inlines/testapp.article/testapp.review/{review.id}",
                {"stars": 1, "text": "Better"},
                format="json",
            )

        assert response.status_code == 200
        review.refresh_from_db()
        assert review.stars == 4
        assert review.text == "Better"


class ReadonlyFieldsSchemaTests(AuthenticatedTestCase):
    def test_schema_carries_the_create_forms_readonly_fields(self):
        request = RequestFactory().get("/")
        request.user = self.create_user(superuser=True)

        def get_readonly_fields(request, obj=None):
            return ["title"] if obj else ["status"]

        with (
            mock.patch.object(
                article_studio(), "get_readonly_fields", get_readonly_fields
            ),
            mock.patch.object(ReviewInline, "readonly_fields", ["stars"]),
        ):
            edit = AdminSerializer(article_studio()).serialize(request)["edit"]

        assert edit["readonly_fields"] == ["status"]
        assert edit["inlines"][0]["readonly_fields"] == ["stars"]


def test_get_readonly_fields_defaults_to_the_attribute():
    class Studio(ModelStudio):
        readonly_fields = ["title"]

    studio = Studio(Article, admin_site)

    assert studio.get_readonly_fields(None) == ["title"]
    assert ModelStudio(Article, admin_site).get_readonly_fields(None) == []


def _messages_with(studio_class):
    original = admin_site._registry[Article]
    admin_site._registry[Article] = studio_class(Article, admin_site)

    try:
        return check_content_studio()
    finally:
        admin_site._registry[Article] = original


def test_unknown_readonly_field_is_an_error():
    class Typo(ModelStudio):
        readonly_fields = ["titel"]

    error = next(m for m in _messages_with(Typo) if m.id == "content_studio.E015")

    assert "titel" in str(error)
    assert isinstance(error, django_checks.Error)


def test_unknown_inline_readonly_field_is_an_error():
    class Inline(ReviewInline):
        readonly_fields = ["rating"]

    class WithInline(ModelStudio):
        inlines = [Inline]

    assert [m for m in _messages_with(WithInline) if m.id == "content_studio.E015"]


def test_known_readonly_field_produces_no_error():
    class Fine(ModelStudio):
        readonly_fields = ["views"]

    assert not [m for m in _messages_with(Fine) if m.id == "content_studio.E015"]


def test_required_field_in_readonly_fields_is_a_warning():
    class Required(ModelStudio):
        readonly_fields = ["title"]

    warning = next(m for m in _messages_with(Required) if m.id == "content_studio.W002")

    assert "title" in str(warning)
