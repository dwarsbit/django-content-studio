"""
Tests for soft delete: the opt-in trash.

A model studio that configures `soft_delete` swaps the hard delete for
a trash: deletes stamp the field instead of removing the row, the
lists exclude trashed objects, the trash lists them, and restore and
permanent delete act on them. Models without the config keep the
classic hard delete.
"""

from django.contrib.admin.models import CHANGE, DELETION, LogEntry
from django.contrib.auth import models as auth_models
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from content_studio.admin import ModelStudio, admin_site
from content_studio.checks import check_content_studio
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.models import Article, Note


class AuthenticatedTestCase(TestCase):
    def create_user(self, *permissions, superuser=False, **kwargs):
        if superuser:
            return auth_models.User.objects.create_superuser(
                username=kwargs.get("username", "admin"), password="x"
            )

        user = auth_models.User.objects.create_user(
            username=kwargs.get("username", "staff"), password="x", is_staff=True
        )
        for permission in permissions:
            user.user_permissions.set(
                list(user.user_permissions.all())
                + [auth_models.Permission.objects.get(codename=permission)]
            )
        return user

    def client_for(self, user):
        client = APIClient()
        token = create_access_token(user)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return client


class SoftDeleteTests(AuthenticatedTestCase):
    def setUp(self):
        self.superuser = self.create_user(superuser=True)
        self.client = self.client_for(self.superuser)

    def test_delete_moves_to_trash_instead_of_removing(self):
        note = Note.objects.create(title="one")

        response = self.client.delete(f"/api/content/testapp.note/{note.pk}")

        self.assertEqual(response.status_code, 204)
        note.refresh_from_db()
        self.assertIsNotNone(note.removed_at)

        # The list no longer shows it.
        response = self.client.get("/api/content/testapp.note")
        titles = [row["__str__"] for row in response.json()["results"]]
        self.assertNotIn("one", titles)

        # The deletion is in the activity log.
        entry = LogEntry.objects.get(
            content_type=ContentType.objects.get_for_model(Note), object_id=note.pk
        )
        self.assertEqual(entry.action_flag, DELETION)

    def test_trash_lists_only_deleted_most_recent_first(self):
        first = Note.objects.create(title="first")
        second = Note.objects.create(title="second")

        self.client.delete(f"/api/content/testapp.note/{first.pk}")
        self.client.delete(f"/api/content/testapp.note/{second.pk}")

        response = self.client.get("/api/content/testapp.note/trash")

        self.assertEqual(response.status_code, 200)
        rows = response.json()["results"]
        self.assertEqual([row["__str__"] for row in rows], ["second", "first"])
        self.assertTrue(all(row["removed_at"] for row in rows))

    def test_restore_returns_the_object_to_the_lists(self):
        note = Note.objects.create(title="one")
        self.client.delete(f"/api/content/testapp.note/{note.pk}")

        response = self.client.post(f"/api/content/testapp.note/{note.pk}/restore")

        self.assertEqual(response.status_code, 200)
        note.refresh_from_db()
        self.assertIsNone(note.removed_at)

        response = self.client.get("/api/content/testapp.note")
        titles = [row["__str__"] for row in response.json()["results"]]
        self.assertIn("one", titles)

        response = self.client.get("/api/content/testapp.note/trash")
        self.assertEqual(response.json()["pagination"]["count"], 0)

        # Restoring is logged as a change.
        entry = LogEntry.objects.filter(
            content_type=ContentType.objects.get_for_model(Note),
            object_id=note.pk,
            action_flag=CHANGE,
        ).get()
        self.assertEqual(entry.change_message, "Restored from trash.")

    def test_destroy_removes_the_row_permanently(self):
        note = Note.objects.create(title="one")
        self.client.delete(f"/api/content/testapp.note/{note.pk}")

        response = self.client.delete(f"/api/content/testapp.note/{note.pk}/destroy")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Note.objects.filter(pk=note.pk).exists())

        response = self.client.get("/api/content/testapp.note/trash")
        self.assertEqual(response.json()["pagination"]["count"], 0)

    def test_trash_actions_require_permissions(self):
        note = Note.objects.create(title="one")
        self.client.delete(f"/api/content/testapp.note/{note.pk}")

        viewer = self.create_user("view_note", username="viewer")
        editor = self.create_user("view_note", "change_note", username="editor")
        destroyer = self.create_user("view_note", "delete_note", username="destroyer")

        # Seeing the trash needs view permission.
        response = self.client_for(viewer).get("/api/content/testapp.note/trash")
        self.assertEqual(response.status_code, 200)

        # Restoring needs change permission.
        response = self.client_for(viewer).post(
            f"/api/content/testapp.note/{note.pk}/restore"
        )
        self.assertEqual(response.status_code, 403)
        response = self.client_for(editor).post(
            f"/api/content/testapp.note/{note.pk}/restore"
        )
        self.assertEqual(response.status_code, 200)

        # Permanent deletion needs delete permission.
        response = self.client_for(editor).delete(
            f"/api/content/testapp.note/{note.pk}/destroy"
        )
        self.assertEqual(response.status_code, 403)
        response = self.client_for(destroyer).delete(
            f"/api/content/testapp.note/{note.pk}/destroy"
        )
        self.assertEqual(response.status_code, 204)

    def test_trash_endpoint_returns_404_without_soft_delete(self):
        article = Article.objects.create(title="one")

        response = self.client.get("/api/content/testapp.article/trash")
        self.assertEqual(response.status_code, 404)

        response = self.client.post(
            f"/api/content/testapp.article/{article.pk}/restore"
        )
        self.assertEqual(response.status_code, 404)

        response = self.client.delete(
            f"/api/content/testapp.article/{article.pk}/destroy"
        )
        self.assertEqual(response.status_code, 404)

    def test_unconfigured_models_keep_hard_delete(self):
        article = Article.objects.create(title="one")

        response = self.client.delete(f"/api/content/testapp.article/{article.pk}")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Article.objects.filter(pk=article.pk).exists())

    def test_create_is_not_trashed(self):
        self.client.post("/api/content/testapp.note", {"title": "fresh"}, format="json")

        note = Note.objects.get(title="fresh")
        self.assertIsNone(note.removed_at)


class SoftDeleteCheckTests(AuthenticatedTestCase):
    def test_clean_project_produces_no_messages(self):
        assert check_content_studio() == []

    def test_unknown_soft_delete_field_surfaces_as_system_error(self):
        class UnknownField(ModelStudio):
            soft_delete = "gone_at"

        original = admin_site._registry.pop(Note)
        admin_site._registry[Note] = UnknownField(Note, admin_site)

        try:
            messages = check_content_studio()
        finally:
            del admin_site._registry[Note]
            admin_site._registry[Note] = original

        error = next(m for m in messages if m.id == "content_studio.E008")
        assert "gone_at" in str(error)

    def test_non_nullable_soft_delete_field_surfaces_as_system_error(self):
        class NotNullable(ModelStudio):
            soft_delete = "title"

        original = admin_site._registry.pop(Note)
        admin_site._registry[Note] = NotNullable(Note, admin_site)

        try:
            messages = check_content_studio()
        finally:
            del admin_site._registry[Note]
            admin_site._registry[Note] = original

        error = next(m for m in messages if m.id == "content_studio.E008")
        assert "nullable" in str(error)

    def test_discover_payload_announces_the_trash(self):
        # NoteAdmin configures soft_delete; ArticleAdmin does not.
        client = self.client_for(self.create_user(superuser=True))

        response = client.get("/api/discover")

        models = {model["label"]: model for model in response.json()["models"]}
        self.assertTrue(models["testapp.note"]["admin"]["list"]["trash"])
        self.assertFalse(models["testapp.article"]["admin"]["list"]["trash"])


class BulkDeleteTests(AuthenticatedTestCase):
    def setUp(self):
        self.superuser = self.create_user(superuser=True)
        self.client = self.client_for(self.superuser)

    def test_bulk_delete_moves_the_selection_to_the_trash(self):
        one = Note.objects.create(title="one")
        two = Note.objects.create(title="two")

        response = self.client.post(
            "/api/content/testapp.note/bulk",
            {"action": "delete", "ids": [one.pk, two.pk]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 2)
        # The rows are stamped, not removed.
        self.assertEqual(Note.objects.count(), 2)
        self.assertTrue(all(note.removed_at for note in Note.objects.all()))

        response = self.client.get("/api/content/testapp.note/trash")
        self.assertEqual(response.json()["pagination"]["count"], 2)

    def test_bulk_delete_confirm_announces_the_trash(self):
        response = self.client.get("/api/discover")

        note = next(
            model
            for model in response.json()["models"]
            if model["label"] == "testapp.note"
        )
        delete_action = next(
            action
            for action in note["admin"]["list"]["actions"]
            if action["id"] == "delete"
        )
        self.assertIn("trash", delete_action["confirm"])
        self.assertFalse(delete_action["destructive"])

        article = next(
            model
            for model in response.json()["models"]
            if model["label"] == "testapp.article"
        )
        delete_action = next(
            action
            for action in article["admin"]["list"]["actions"]
            if action["id"] == "delete"
        )
        self.assertNotIn("trash", delete_action["confirm"])
        self.assertTrue(delete_action["destructive"])
