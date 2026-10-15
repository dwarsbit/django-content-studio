"""
Tests for table_display columns: plain field names and TableColumn
objects with custom headers, formats and studio-method values.
"""

import pytest

from content_studio import formats
from content_studio.admin import ModelStudio, admin_site
from content_studio.checks import table_column_errors
from content_studio.form import TableColumn
from tests.test_e2e_crud import AuthenticatedTestCase
from tests.testapp.models import Article, Note


@pytest.mark.django_db
class TableColumnsTests(AuthenticatedTestCase):
    def setUp(self):
        self.superuser = self.create_user(superuser=True)

    def test_discover_serializes_columns_with_header_and_format(self):
        client = self.client_for(self.superuser)
        response = client.get("/api/discover")

        article = next(
            model
            for model in response.json()["models"]
            if model["label"] == "testapp.article"
        )
        columns = article["admin"]["list"]["display"]

        assert {"name": "id", "header": None, "format": None} in columns
        assert {
            "name": "get_body_preview",
            "header": "Preview",
            "format": None,
        } in columns

    def test_method_columns_carry_their_computed_value_on_rows(self):
        Article.objects.create(title="Words", body="one two three")

        client = self.client_for(self.superuser)
        response = client.get("/api/content/testapp.article")

        first = response.json()["results"][0]
        assert first["get_body_preview"] == "one two three"

    def test_inline_payload_serializes_columns(self):
        client = self.client_for(self.superuser)
        response = client.get("/api/discover")

        article = next(
            model
            for model in response.json()["models"]
            if model["label"] == "testapp.article"
        )
        inline = article["admin"]["edit"]["inlines"][0]

        assert inline["model"] == "testapp.review"
        assert inline["table_display"] == [
            {"name": "__str__", "header": None, "format": None}
        ]

    def test_ordering_drops_computed_and_dunder_columns(self):
        """Ordering by a computed column or __str__ is dropped instead
        of raising FieldError; model fields still order."""
        Article.objects.create(title="B")
        Article.objects.create(title="A")

        client = self.client_for(self.superuser)

        for ordering in ["get_body_preview", "__str__", "nonexistent"]:
            response = client.get(f"/api/content/testapp.article?ordering={ordering}")
            assert response.status_code == 200

        response = client.get("/api/content/testapp.article?ordering=title")
        titles = [row["title"] for row in response.json()["results"]]
        assert titles == ["A", "B"]

    def test_ordering_is_restricted_to_sortable_by(self):
        """With sortable_by declared, ordering by any other column is
        dropped instead of applied."""
        Note.objects.create(title="B")
        Note.objects.create(title="A")

        client = self.client_for(self.superuser)

        response = client.get("/api/content/testapp.note?ordering=title")
        titles = [row["title"] for row in response.json()["results"]]
        assert titles == ["A", "B"]

        # "id" is a real column but outside NoteAdmin's sortable_by:
        # dropped, so the default (pk ascending) ordering holds.
        response = client.get("/api/content/testapp.note?ordering=-id")
        titles = [row["title"] for row in response.json()["results"]]
        assert titles == ["B", "A"]


def test_string_entries_normalize_to_columns():
    from content_studio.admin import get_table_display_columns

    class Plain(ModelStudio):
        table_display = ["title", TableColumn(field="status", header="S")]

    columns = get_table_display_columns(Plain(Article, admin_site))

    assert [column.field for column in columns] == ["title", "status"]
    assert columns[0].header is None
    assert columns[1].header == "S"


def test_check_rejects_unresolvable_columns():
    class Broken(ModelStudio):
        table_display = ["nonexistent"]

    errors = table_column_errors(Broken(Article, admin_site))

    assert any(
        check_id == "content_studio.E006" and "nonexistent" in message
        for check_id, message in errors
    )


def test_check_rejects_duplicate_columns():
    class Duplicated(ModelStudio):
        table_display = ["title", TableColumn(field="title", header="Twice")]

    errors = table_column_errors(Duplicated(Article, admin_site))

    assert any(
        check_id == "content_studio.E006" and "duplicate" in message
        for check_id, message in errors
    )


def test_check_rejects_non_format_classes():
    class BadFormat(ModelStudio):
        table_display = [TableColumn(field="views", format=Article)]

    errors = table_column_errors(BadFormat(Article, admin_site))

    assert any(
        check_id == "content_studio.E006" and "format" in message
        for check_id, message in errors
    )


def test_check_accepts_method_and_formatted_columns():
    class Fine(ModelStudio):
        table_display = [
            "title",
            "__str__",
            TableColumn(field="get_word_count", header="Words"),
            TableColumn(field="views", format=formats.NumberFormat),
        ]

        def get_word_count(self, obj, request):
            return len(obj.body.split())

    assert table_column_errors(Fine(Article, admin_site)) == []


def test_check_validates_inline_columns():
    class BrokenInline:
        model = Article
        table_display = ["nonexistent"]

    class WithInline(ModelStudio):
        inlines = [BrokenInline]

    errors = table_column_errors(WithInline(Article, admin_site))

    assert any(
        check_id == "content_studio.E006" and "nonexistent" in message
        for check_id, message in errors
    )
