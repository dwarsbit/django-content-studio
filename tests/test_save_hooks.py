"""
Tests for the save and delete hooks of a studio: save_model,
save_related, delete_model and delete_queryset, called like the classic
admin's when the admin creates, changes or deletes objects.
"""

from unittest import mock

from django.contrib.admin.models import ADDITION, DELETION, LogEntry
from django.contrib.auth import models as auth_models
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from content_studio.admin import BaseStudio, admin_site
from content_studio.signals import content_changed
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.admin import PartInline
from tests.testapp.models import Article, Category, Note, Part, Product

ARTICLES = "/api/content/testapp.article"
PRODUCTS = "/api/content/testapp.product"
PARTS = "/api/inlines/testapp.product/testapp.part"


def studio(model):
    return admin_site._registry[model]


class HookTestCase(TestCase):
    def setUp(self):
        self.superuser = auth_models.User.objects.create_superuser(
            username="admin", password="x"
        )
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {create_access_token(self.superuser)}"
        )


class SaveModelTests(HookTestCase):
    def test_create_calls_save_model_with_the_unsaved_object(self):
        calls = []

        def save_model(request, obj, data, change):
            calls.append((request.user, obj.pk, data["title"], change))
            obj.body = "Set by the studio"
            obj.save()

        with mock.patch.object(studio(Article), "save_model", side_effect=save_model):
            response = self.client.post(ARTICLES, {"title": "Hello"}, format="json")

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(calls, [(self.superuser, None, "Hello", False)])
        article = Article.objects.get(pk=response.json()["id"])
        self.assertEqual(article.body, "Set by the studio")
        # The created_by stamp is on the object before it is saved.
        self.assertEqual(article.created_by, self.superuser)

    def test_update_calls_save_model_with_change(self):
        article = Article.objects.create(title="Old")
        calls = []

        def save_model(request, obj, data, change):
            calls.append((obj.pk, obj.title, data, change))
            obj.save()

        with mock.patch.object(studio(Article), "save_model", side_effect=save_model):
            response = self.client.patch(
                f"{ARTICLES}/{article.pk}", {"title": "New"}, format="json"
            )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(calls, [(article.pk, "New", {"title": "New"}, True)])
        article.refresh_from_db()
        self.assertEqual(article.title, "New")
        self.assertEqual(article.edited_by, self.superuser)

    def test_save_model_that_does_not_save_stores_nothing(self):
        with mock.patch.object(studio(Article), "save_model"):
            self.client.post(ARTICLES, {"title": "Hello"}, format="json")

        self.assertFalse(Article.objects.exists())

    def test_validation_error_refuses_the_save(self):
        article = Article.objects.create(title="Old")

        def save_model(request, obj, data, change):
            raise ValidationError("Published articles are locked.")

        with mock.patch.object(studio(Article), "save_model", side_effect=save_model):
            response = self.client.patch(
                f"{ARTICLES}/{article.pk}", {"title": "New"}, format="json"
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), ["Published articles are locked."])
        article.refresh_from_db()
        self.assertEqual(article.title, "Old")

    def test_validation_error_by_field_shows_on_the_field(self):
        def save_model(request, obj, data, change):
            raise ValidationError({"title": "This title is reserved."})

        with mock.patch.object(studio(Article), "save_model", side_effect=save_model):
            response = self.client.post(ARTICLES, {"title": "Home"}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"title": ["This title is reserved."]})
        self.assertFalse(Article.objects.exists())
        self.assertFalse(LogEntry.objects.filter(action_flag=ADDITION).exists())

    def test_refused_save_sends_no_content_changed(self):
        received = []

        def receiver(sender, changes, **kwargs):
            received.extend(changes)

        def save_model(request, obj, data, change):
            obj.save()
            raise ValidationError("No.")

        content_changed.connect(receiver)
        self.addCleanup(content_changed.disconnect, receiver)

        with self.captureOnCommitCallbacks(execute=True):
            with mock.patch.object(
                studio(Article), "save_model", side_effect=save_model
            ):
                response = self.client.post(ARTICLES, {"title": "Hi"}, format="json")

        self.assertEqual(response.status_code, 400)
        # The object saved before the refusal is rolled back.
        self.assertFalse(Article.objects.exists())
        self.assertEqual(received, [])


class SaveRelatedTests(HookTestCase):
    def setUp(self):
        super().setUp()
        self.tools = Category.objects.create(name="Tools")
        self.sale = Category.objects.create(name="Sale")

    def test_many_to_many_is_set_after_save_model(self):
        seen = []

        def save_related(request, obj, data, change):
            seen.append(list(obj.tags.all()))
            BaseStudio.save_related(studio(Product), request, obj, data, change)
            seen.append(list(obj.tags.all()))

        with mock.patch.object(
            studio(Product), "save_related", side_effect=save_related
        ):
            response = self.client.post(
                PRODUCTS,
                {"title": "Hammer", "slug": "hammer", "tags": [{"id": self.tools.pk}]},
                format="json",
            )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(seen, [[], [self.tools]])

    def test_data_carries_the_many_to_many_values(self):
        product = Product.objects.create(title="Hammer", slug="hammer")
        product.tags.set([self.tools])
        calls = []

        def save_model(request, obj, data, change):
            calls.append(data["tags"])
            obj.save()

        with mock.patch.object(studio(Product), "save_model", side_effect=save_model):
            response = self.client.patch(
                f"{PRODUCTS}/{product.pk}",
                {"tags": [{"id": self.sale.pk}]},
                format="json",
            )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(calls, [[self.sale]])
        self.assertEqual(list(product.tags.all()), [self.sale])

    def test_overriding_save_related_without_super_leaves_relations(self):
        product = Product.objects.create(title="Hammer", slug="hammer")
        product.tags.set([self.tools])

        with mock.patch.object(studio(Product), "save_related"):
            self.client.patch(f"{PRODUCTS}/{product.pk}", {"tags": []}, format="json")

        self.assertEqual(list(product.tags.all()), [self.tools])


class InlineSaveHookTests(HookTestCase):
    def setUp(self):
        super().setUp()
        self.product = Product.objects.create(title="Hammer", slug="hammer")

    def test_inline_rows_are_saved_through_the_inline_studio(self):
        calls = []

        def save_model(self, request, obj, data, change):
            calls.append((obj.product, data["name"], change))
            obj.name = obj.name.upper()
            obj.save()

        with mock.patch.object(PartInline, "save_model", save_model):
            response = self.client.post(
                PARTS,
                {"product": {"id": self.product.pk}, "name": "Head", "code": "head"},
                format="json",
            )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(calls, [(self.product, "Head", False)])
        self.assertEqual(Part.objects.get().name, "HEAD")

    def test_inline_rows_are_deleted_through_the_inline_studio(self):
        part = Part.objects.create(product=self.product, name="Head", code="head")
        calls = []

        def delete_model(self, request, obj):
            calls.append(obj.pk)
            obj.delete()

        with mock.patch.object(PartInline, "delete_model", delete_model):
            response = self.client.delete(f"{PARTS}/{part.pk}")

        self.assertEqual(response.status_code, 204, response.content)
        self.assertEqual(calls, [part.pk])
        self.assertFalse(Part.objects.exists())

    def test_duplicated_inline_rows_are_saved_through_the_inline_studio(self):
        Part.objects.create(product=self.product, name="Head", code="head")
        calls = []

        def save_model(self, request, obj, data, change):
            calls.append((data["name"], data["product"].title, change))
            obj.save()

        with mock.patch.object(PartInline, "save_model", save_model):
            response = self.client.post(
                f"{PRODUCTS}?duplicate_of={self.product.pk}",
                {"title": "Hammer 2", "slug": "hammer-2"},
                format="json",
            )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(calls, [("Head", "Hammer 2", False)])

    def test_refused_duplicated_inline_row_refuses_the_duplicate(self):
        Part.objects.create(product=self.product, name="Head", code="head")

        def save_model(self, request, obj, data, change):
            raise ValidationError("Parts cannot be copied.")

        with mock.patch.object(PartInline, "save_model", save_model):
            response = self.client.post(
                f"{PRODUCTS}?duplicate_of={self.product.pk}",
                {"title": "Hammer 2", "slug": "hammer-2"},
                format="json",
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), ["Parts cannot be copied."])
        self.assertEqual(Product.objects.count(), 1)


class DeleteModelTests(HookTestCase):
    def test_delete_calls_delete_model(self):
        article = Article.objects.create(title="One")
        calls = []

        def delete_model(request, obj):
            calls.append((request.user, obj.pk))
            obj.delete()

        with mock.patch.object(
            studio(Article), "delete_model", side_effect=delete_model
        ):
            response = self.client.delete(f"{ARTICLES}/{article.pk}")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(calls, [(self.superuser, article.pk)])
        self.assertFalse(Article.objects.exists())
        self.assertTrue(LogEntry.objects.filter(action_flag=DELETION).exists())

    def test_validation_error_refuses_the_delete(self):
        article = Article.objects.create(title="One")

        def delete_model(request, obj):
            raise ValidationError("Published articles cannot be deleted.")

        with mock.patch.object(
            studio(Article), "delete_model", side_effect=delete_model
        ):
            response = self.client.delete(f"{ARTICLES}/{article.pk}")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), ["Published articles cannot be deleted."])
        self.assertTrue(Article.objects.filter(pk=article.pk).exists())
        self.assertFalse(LogEntry.objects.filter(action_flag=DELETION).exists())

    def test_moving_to_the_trash_does_not_call_delete_model(self):
        note = Note.objects.create(title="One")

        with mock.patch.object(studio(Note), "delete_model") as delete_model:
            response = self.client.delete(f"/api/content/testapp.note/{note.pk}")

        self.assertEqual(response.status_code, 204)
        delete_model.assert_not_called()
        note.refresh_from_db()
        self.assertIsNotNone(note.removed_at)

    def test_permanent_delete_from_the_trash_calls_delete_model(self):
        note = Note.objects.create(title="One")
        self.client.delete(f"/api/content/testapp.note/{note.pk}")
        calls = []

        def delete_model(request, obj):
            calls.append(obj.pk)
            obj.delete()

        with mock.patch.object(studio(Note), "delete_model", side_effect=delete_model):
            response = self.client.delete(
                f"/api/content/testapp.note/{note.pk}/destroy"
            )

        self.assertEqual(response.status_code, 204)
        self.assertEqual(calls, [note.pk])
        self.assertFalse(Note.objects.exists())


class DeleteQuerysetTests(HookTestCase):
    def setUp(self):
        super().setUp()
        self.articles = [
            Article.objects.create(title="one"),
            Article.objects.create(title="two"),
        ]

    def bulk_delete(self):
        return self.client.post(
            f"{ARTICLES}/bulk",
            {"action": "delete", "ids": [str(a.pk) for a in self.articles]},
            format="json",
        )

    def test_bulk_delete_calls_delete_queryset(self):
        calls = []

        def delete_queryset(request, queryset):
            calls.append(sorted(queryset.values_list("title", flat=True)))
            queryset.delete()

        with mock.patch.object(
            studio(Article), "delete_queryset", side_effect=delete_queryset
        ):
            response = self.bulk_delete()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"count": 2})
        self.assertEqual(calls, [["one", "two"]])
        self.assertFalse(Article.objects.exists())

    def test_validation_error_refuses_the_bulk_delete(self):
        def delete_queryset(request, queryset):
            raise ValidationError("Not today.")

        with mock.patch.object(
            studio(Article), "delete_queryset", side_effect=delete_queryset
        ):
            response = self.bulk_delete()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), ["Not today."])
        self.assertEqual(Article.objects.count(), 2)
        self.assertFalse(LogEntry.objects.filter(action_flag=DELETION).exists())
