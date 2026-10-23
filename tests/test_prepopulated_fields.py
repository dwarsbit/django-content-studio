"""
prepopulated_fields and get_prepopulated_fields: fields the create form
fills in from other fields, like the classic Django admin.
"""

from unittest import mock

from django.core import checks as django_checks
from django.test import RequestFactory

from content_studio.admin import AdminSerializer, ModelStudio, admin_site
from content_studio.checks import check_content_studio
from tests.test_e2e_crud import AuthenticatedTestCase
from tests.testapp.admin import ReviewInline
from tests.testapp.models import Article


def article_studio():
    return admin_site._registry[Article]


class PrepopulatedFieldsSchemaTests(AuthenticatedTestCase):
    def test_schema_carries_the_create_forms_prepopulated_fields(self):
        request = RequestFactory().get("/")
        request.user = self.create_user(superuser=True)

        with (
            mock.patch.object(
                article_studio(), "prepopulated_fields", {"body": ("title",)}
            ),
            mock.patch.object(ReviewInline, "prepopulated_fields", {"text": ["stars"]}),
        ):
            edit = AdminSerializer(article_studio()).serialize(request)["edit"]

        assert edit["prepopulated_fields"] == {"body": ["title"]}
        assert edit["inlines"][0]["prepopulated_fields"] == {"text": ["stars"]}

    def test_hook_decides_per_request(self):
        request = RequestFactory().get("/")
        request.user = self.create_user(superuser=True)

        def get_prepopulated_fields(request, obj=None):
            return {"body": ["title", "status"]}

        with mock.patch.object(
            article_studio(), "get_prepopulated_fields", get_prepopulated_fields
        ):
            edit = AdminSerializer(article_studio()).serialize(request)["edit"]

        assert edit["prepopulated_fields"] == {"body": ["title", "status"]}


def test_get_prepopulated_fields_defaults_to_the_attribute():
    class Studio(ModelStudio):
        prepopulated_fields = {"body": ("title",)}

    assert Studio(Article, admin_site).get_prepopulated_fields(None) == {
        "body": ("title",)
    }
    assert ModelStudio(Article, admin_site).get_prepopulated_fields(None) == {}


def _errors_with(studio_class):
    original = admin_site._registry[Article]
    admin_site._registry[Article] = studio_class(Article, admin_site)

    try:
        return [m for m in check_content_studio() if m.id == "content_studio.E016"]
    finally:
        admin_site._registry[Article] = original


def test_valid_prepopulated_fields_produce_no_error():
    class Fine(ModelStudio):
        prepopulated_fields = {"body": ("title", "status")}

    assert not _errors_with(Fine)


def test_prepopulated_fields_must_be_a_mapping():
    class NotMapping(ModelStudio):
        prepopulated_fields = [("body", "title")]

    [error] = _errors_with(NotMapping)

    assert "mapping" in str(error)
    assert isinstance(error, django_checks.Error)


def test_unknown_target_is_an_error():
    class Typo(ModelStudio):
        prepopulated_fields = {"slug": ("title",)}

    [error] = _errors_with(Typo)

    assert "'slug'" in str(error)


def test_unsuitable_targets_are_errors():
    class DateTime(ModelStudio):
        prepopulated_fields = {"published_at": ("title",)}

    class Relation(ModelStudio):
        prepopulated_fields = {"author": ("title",)}

    class ManyToMany(ModelStudio):
        prepopulated_fields = {"categories": ("title",)}

    for studio_class in (DateTime, Relation, ManyToMany):
        [error] = _errors_with(studio_class)
        assert "must not be a DateTimeField" in str(error)


def test_sources_must_be_a_list_of_fields():
    class StringSources(ModelStudio):
        prepopulated_fields = {"body": "title"}

    class UnknownSource(ModelStudio):
        prepopulated_fields = {"body": ("titel",)}

    assert "list or tuple" in str(_errors_with(StringSources)[0])
    assert "'titel'" in str(_errors_with(UnknownSource)[0])


def test_readonly_target_is_an_error():
    class ReadOnly(ModelStudio):
        readonly_fields = ["body"]
        prepopulated_fields = {"body": ("title",)}

    [error] = _errors_with(ReadOnly)

    assert "readonly_fields" in str(error)


def test_inlines_are_checked_too():
    class Inline(ReviewInline):
        prepopulated_fields = {"rating": ("text",)}

    class WithInline(ModelStudio):
        inlines = [Inline]

    assert _errors_with(WithInline)
