"""
Tests for history with restore: the changed fields in the activity log,
the versions the history app keeps, the version endpoint, the
HISTORY_MAX_VERSIONS cap and the prune command.
"""

import json
from io import StringIO
from unittest import mock

from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.apps import apps
from django.core.management import call_command

from content_studio.history.models import Version
from content_studio.snapshots import get_changed_fields, get_tracked_field_names
from tests.test_activity import AuthenticatedTestCase
from tests.testapp.models import Article, Category, Product

ARTICLES = "/api/content/testapp.article"
PRODUCTS = "/api/content/testapp.product"


def entries_for(article):
    return LogEntry.objects.filter(
        content_type=ContentType.objects.get_for_model(Article),
        object_id=str(article.pk),
    ).order_by("-action_time", "-pk")


class HistoryTestCase(AuthenticatedTestCase):
    def setUp(self):
        self.superuser = self.create_user(superuser=True)
        self.client = self.client_for(self.superuser)

    def create_article(self, **data):
        response = self.client.post(
            ARTICLES, {"title": "Draft", "body": "One two", **data}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        return Article.objects.get(pk=response.json()["id"])


class TrackedFieldsTests(HistoryTestCase):
    def test_stamps_and_pk_are_not_tracked(self):
        names = get_tracked_field_names(Article)

        self.assertIn("title", names)
        self.assertIn("categories", names)
        for name in ("id", "created_by", "edited_by", "edited_at"):
            self.assertNotIn(name, names)

    def test_changed_fields_keep_field_order(self):
        self.assertEqual(
            get_changed_fields(
                {"title": "a", "body": "b", "views": 1},
                {"title": "x", "body": "b", "views": 2},
            ),
            ["title", "views"],
        )


class ChangeMessageTests(HistoryTestCase):
    def test_update_logs_the_changed_fields(self):
        article = self.create_article()

        response = self.client.patch(
            f"{ARTICLES}/{article.pk}",
            {"title": "Final", "rating": "4.5"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        entry = entries_for(article).first()
        self.assertEqual(entry.action_flag, CHANGE)
        self.assertEqual(
            json.loads(entry.change_message),
            [{"changed": {"fields": ["Title", "Rating"]}}],
        )
        self.assertEqual(entry.get_change_message(), "Changed Title and Rating.")

    def test_many_to_many_changes_are_logged(self):
        news = Category.objects.create(name="News")
        product = Product.objects.create(title="Hammer", slug="hammer")

        response = self.client.patch(
            f"{PRODUCTS}/{product.pk}", {"tags": [{"id": news.pk}]}, format="json"
        )

        self.assertEqual(response.status_code, 200, response.content)
        entry = LogEntry.objects.filter(
            content_type=ContentType.objects.get_for_model(Product)
        ).first()
        self.assertEqual(entry.get_change_message(), "Changed Tags.")
        self.assertEqual(entry.content_studio_version.previous, {"tags": []})

    def test_save_without_changes_logs_no_fields(self):
        article = self.create_article()

        self.client.patch(f"{ARTICLES}/{article.pk}", {"title": "Draft"}, format="json")

        self.assertEqual(entries_for(article).first().change_message, "")

    def test_activity_answers_the_message(self):
        article = self.create_article()
        self.client.patch(f"{ARTICLES}/{article.pk}", {"body": "New"}, format="json")

        entries = self.client.get(f"{ARTICLES}/{article.pk}/activity").json()

        self.assertEqual(entries[0]["message"], "Changed Body.")
        self.assertTrue(entries[0]["has_version"])
        self.assertTrue(entries[1]["has_version"])

    def test_empty_change_list_has_no_message(self):
        article = self.create_article()
        entry = entries_for(article).first()
        entry.change_message = "[]"
        entry.save()

        entries = self.client.get(f"{ARTICLES}/{article.pk}/activity").json()

        self.assertEqual(entries[0]["message"], "")


class VersionTests(HistoryTestCase):
    def test_create_and_update_keep_versions(self):
        article = self.create_article()
        self.client.patch(f"{ARTICLES}/{article.pk}", {"title": "Final"}, format="json")

        update, create = entries_for(article)
        self.assertEqual(create.content_studio_version.fields, [])
        self.assertEqual(create.content_studio_version.data["title"], "Draft")

        version = update.content_studio_version
        self.assertEqual(version.fields, ["title"])
        self.assertEqual(version.previous, {"title": "Draft"})
        self.assertEqual(version.data["title"], "Final")
        self.assertEqual(version.data["body"], "One two")
        self.assertNotIn("edited_at", version.data)

    def test_version_endpoint(self):
        article = self.create_article()
        self.client.patch(f"{ARTICLES}/{article.pk}", {"title": "Final"}, format="json")
        entry = entries_for(article).first()

        response = self.client.get(f"{ARTICLES}/{article.pk}/activity/{entry.pk}")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["fields"], ["title"])
        self.assertEqual(data["previous"], {"title": "Draft"})
        self.assertEqual(data["data"]["title"], "Final")
        self.assertEqual(data["message"], "Changed Title.")
        self.assertEqual(data["user"]["id"], self.superuser.pk)

    def test_version_of_another_object_is_not_found(self):
        article = self.create_article()
        other = self.create_article(title="Other")
        entry = entries_for(other).first()

        response = self.client.get(f"{ARTICLES}/{article.pk}/activity/{entry.pk}")

        self.assertEqual(response.status_code, 404)

    def test_version_needs_view_permission(self):
        article = self.create_article()
        entry = entries_for(article).first()
        client = self.client_for(self.create_user(username="nobody"))

        response = client.get(f"{ARTICLES}/{article.pk}/activity/{entry.pk}")

        self.assertEqual(response.status_code, 403)

    def test_restoring_is_a_normal_save(self):
        article = self.create_article()
        self.client.patch(f"{ARTICLES}/{article.pk}", {"title": "Final"}, format="json")
        create = entries_for(article).last()
        data = self.client.get(f"{ARTICLES}/{article.pk}/activity/{create.pk}").json()[
            "data"
        ]

        response = self.client.patch(f"{ARTICLES}/{article.pk}", data, format="json")

        self.assertEqual(response.status_code, 200, response.content)
        article.refresh_from_db()
        self.assertEqual(article.title, "Draft")
        self.assertEqual(
            entries_for(article).first().get_change_message(), "Changed Title."
        )


class RetentionTests(HistoryTestCase):
    def test_versions_are_capped_per_object(self):
        article = self.create_article()
        other = self.create_article(title="Other")

        with self.settings(CONTENT_STUDIO={"HISTORY_MAX_VERSIONS": 2}):
            for views in range(1, 4):
                self.client.patch(
                    f"{ARTICLES}/{article.pk}", {"title": f"v{views}"}, format="json"
                )

        versions = Version.objects.filter(object_id=str(article.pk))
        self.assertEqual(versions.count(), 2)
        self.assertEqual(
            sorted(version.data["title"] for version in versions), ["v2", "v3"]
        )
        # The activity log keeps every entry; only the versions go.
        self.assertEqual(entries_for(article).count(), 4)
        self.assertEqual(Version.objects.filter(object_id=str(other.pk)).count(), 1)

    def test_none_keeps_every_version(self):
        article = self.create_article()

        with self.settings(CONTENT_STUDIO={"HISTORY_MAX_VERSIONS": None}):
            for views in range(1, 4):
                self.client.patch(
                    f"{ARTICLES}/{article.pk}", {"title": f"v{views}"}, format="json"
                )

        self.assertEqual(Version.objects.filter(object_id=str(article.pk)).count(), 4)

    def test_prune_command(self):
        kept = self.create_article()
        gone = self.create_article(title="Gone")

        for views in range(1, 4):
            self.client.patch(
                f"{ARTICLES}/{kept.pk}", {"title": f"v{views}"}, format="json"
            )

        Article.objects.filter(pk=gone.pk).delete()
        out = StringIO()

        with self.settings(CONTENT_STUDIO={"HISTORY_MAX_VERSIONS": 2}):
            call_command("content_studio_prune_history", stdout=out)

        self.assertIn("Removed 3 versions.", out.getvalue())
        self.assertEqual(Version.objects.filter(object_id=str(kept.pk)).count(), 2)
        self.assertFalse(Version.objects.filter(object_id=str(gone.pk)).exists())


class WithoutHistoryAppTests(HistoryTestCase):
    def test_changed_fields_are_logged_without_the_app(self):
        article = self.create_article()
        is_installed = apps.is_installed

        with mock.patch.object(
            apps,
            "is_installed",
            lambda name: name != "content_studio.history" and is_installed(name),
        ):
            self.client.patch(
                f"{ARTICLES}/{article.pk}", {"title": "Final"}, format="json"
            )
            entries = self.client.get(f"{ARTICLES}/{article.pk}/activity").json()
            entry = entries_for(article).first()
            version = self.client.get(f"{ARTICLES}/{article.pk}/activity/{entry.pk}")

        self.assertEqual(entries[0]["message"], "Changed Title.")
        self.assertFalse(entries[0]["has_version"])
        self.assertEqual(version.status_code, 404)
        self.assertFalse(Version.objects.filter(log_entry=entry).exists())
