"""
Tests for the admin's notification endpoints: the list and its unread
status, mark as read, the settings page (grid, events, follows) and the
Follow button, plus the discover flag and the studio flag.
"""

from datetime import timedelta

from django.contrib.admin.models import ADDITION, LogEntry
from django.contrib.auth.models import Permission, User
from django.contrib.contenttypes.models import ContentType
from django.test import RequestFactory, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from content_studio.admin import AdminSerializer, admin_site
from content_studio.notifications import events, register_event
from content_studio.notifications.models import (
    Follow,
    Notification,
    NotificationSubscription,
)
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.models import Article, Page

API = "/api/notifications"


class AdminTestCase(TestCase):
    def setUp(self):
        self.anna = self.staff("anna", first_name="Anna", last_name="de Vries")
        self.bob = self.staff("bob")
        self.article = Article.objects.create(title="Spring menu")

    def staff(self, username, *codenames, **fields):
        user = User.objects.create_user(
            username=username, password="x", is_staff=True, **fields
        )
        codenames = codenames or ("view_article", "view_page", "view_sitesettings")
        user.user_permissions.set(Permission.objects.filter(codename__in=codenames))
        return user

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
        return client

    def notification(self, recipient, obj=None, **fields):
        if obj is not None:
            fields.setdefault("content_type", ContentType.objects.get_for_model(obj))
            fields.setdefault("object_id", str(obj.pk))
            fields.setdefault("object_repr", str(obj))
        fields.setdefault("event", "content.updated")
        return Notification.objects.create(recipient=recipient, **fields)


class ListTests(AdminTestCase):
    def test_lists_unread_newest_first(self):
        first = self.notification(self.bob, self.article, actor=self.anna)
        second = self.notification(self.bob, self.article, event="content.deleted")
        self.notification(self.bob, self.article, read_at=timezone.now())
        self.notification(self.anna, self.article)

        response = self.client_for(self.bob).get(API)

        self.assertEqual(response.status_code, 200)
        results = response.json()["results"]
        self.assertEqual([r["id"] for r in results], [second.pk, first.pk])
        self.assertEqual(results[1]["actor"]["name"], "Anna de Vries")
        self.assertEqual(results[1]["model"], "testapp.article")
        self.assertEqual(results[1]["object_id"], str(self.article.pk))
        self.assertTrue(results[1]["exists"])
        self.assertFalse(results[1]["read"])
        self.assertIsNone(response.json()["next"])

    def test_all_includes_read(self):
        self.notification(self.bob, self.article, read_at=timezone.now())

        response = self.client_for(self.bob).get(API, {"filter": "all"})

        self.assertEqual(len(response.json()["results"]), 1)
        self.assertTrue(response.json()["results"][0]["read"])

    def test_pages(self):
        for _ in range(3):
            self.notification(self.bob, self.article)

        response = self.client_for(self.bob).get(API, {"limit": 2})

        self.assertEqual(len(response.json()["results"]), 2)
        self.assertEqual(response.json()["next"], 2)

        response = self.client_for(self.bob).get(API, {"limit": 2, "offset": 2})

        self.assertEqual(len(response.json()["results"]), 1)
        self.assertIsNone(response.json()["next"])

    def test_since_leaves_out_older_ones(self):
        old = self.notification(self.bob, self.article)
        Notification.objects.filter(pk=old.pk).update(
            updated_at=timezone.now() - timedelta(minutes=5)
        )
        new = self.notification(self.bob, self.article)
        since = (timezone.now() - timedelta(minutes=1)).isoformat()

        response = self.client_for(self.bob).get(API, {"since": since})

        self.assertEqual([r["id"] for r in response.json()["results"]], [new.pk])

    def test_deleted_target_is_plain_text(self):
        notification = self.notification(self.bob, self.article)
        self.article.delete()

        response = self.client_for(self.bob).get(API)

        result = response.json()["results"][0]
        self.assertEqual(result["id"], notification.pk)
        self.assertFalse(result["exists"])
        self.assertEqual(result["object_repr"], "Spring menu")

    def test_hides_models_the_user_may_not_view(self):
        carol = self.staff("carol", "view_page")
        self.notification(carol, self.article)

        self.assertEqual(self.client_for(carol).get(API).json()["results"], [])
        self.assertEqual(
            self.client_for(carol).get(f"{API}/status").json()["unread"], 0
        )

    def test_custom_event_renders_its_title(self):
        self.notification(
            self.bob,
            event="blog.review",
            title="%(title)s awaits review",
            params={"title": "Spring menu"},
            url="/content/testapp.article",
        )

        result = self.client_for(self.bob).get(API).json()["results"][0]

        self.assertEqual(result["title"], "Spring menu awaits review")
        self.assertEqual(result["url"], "/content/testapp.article")
        self.assertIsNone(result["model"])

    def test_requires_staff(self):
        self.assertEqual(APIClient().get(API).status_code, 401)


class StatusTests(AdminTestCase):
    def test_counts_unread_and_reports_the_latest_change(self):
        self.notification(self.bob, self.article)
        latest = self.notification(self.bob, self.article, read_at=timezone.now())

        data = self.client_for(self.bob).get(f"{API}/status").json()

        self.assertEqual(data["unread"], 1)
        self.assertEqual(
            data["latest"].replace("Z", "+00:00"), latest.updated_at.isoformat()
        )

    def test_empty(self):
        data = self.client_for(self.bob).get(f"{API}/status").json()

        self.assertEqual(data, {"unread": 0, "latest": None})


class ReadTests(AdminTestCase):
    def test_marks_given_ids(self):
        one = self.notification(self.bob, self.article)
        two = self.notification(self.bob, self.article)
        other = self.notification(self.anna, self.article)

        response = self.client_for(self.bob).post(
            f"{API}/read", {"ids": [one.pk, other.pk]}, format="json"
        )

        self.assertEqual(response.json(), {"unread": 1})
        one.refresh_from_db()
        two.refresh_from_db()
        other.refresh_from_db()
        self.assertIsNotNone(one.read_at)
        self.assertIsNone(two.read_at)
        # Someone else's notification is not touched.
        self.assertIsNone(other.read_at)

    def test_mark_all_keeps_the_ones_that_arrived_since(self):
        seen = self.notification(self.bob, self.article)
        before = timezone.now()
        later = self.notification(self.bob, self.article)
        Notification.objects.filter(pk=later.pk).update(
            updated_at=before + timedelta(seconds=5)
        )

        response = self.client_for(self.bob).post(
            f"{API}/read", {"before": before.isoformat()}, format="json"
        )

        self.assertEqual(response.json(), {"unread": 1})
        seen.refresh_from_db()
        self.assertIsNotNone(seen.read_at)

    def test_requires_ids_or_before(self):
        response = self.client_for(self.bob).post(f"{API}/read", {}, format="json")

        self.assertEqual(response.status_code, 400)


class SettingsTests(AdminTestCase):
    def test_grid_shows_defaults_for_viewable_models(self):
        data = self.client_for(self.bob).get(f"{API}/settings").json()
        models = {row["model"]: row for row in data["models"]}

        self.assertIn("testapp.article", models)
        self.assertIn("testapp.page", models)
        # No view permission on notes.
        self.assertNotIn("testapp.note", models)
        self.assertEqual(
            models["testapp.article"],
            {
                "model": "testapp.article",
                "scope": "mine",
                "events": {
                    "created": False,
                    "updated": True,
                    "deleted": True,
                    "restored": True,
                },
                "default": True,
            },
        )
        # A singleton is only ever updated.
        self.assertEqual(models["testapp.sitesettings"]["events"], {"updated": True})

    def test_storing_a_row(self):
        client = self.client_for(self.bob)
        response = client.put(
            f"{API}/settings/models/testapp.article",
            {"scope": "all", "events": {"created": True, "updated": False}},
            format="json",
        )

        self.assertEqual(response.status_code, 204)
        rows = NotificationSubscription.objects.filter(user=self.bob)
        self.assertEqual(rows.count(), 4)
        self.assertTrue(all(row.scope == "all" for row in rows))
        self.assertEqual(
            {row.event: row.enabled for row in rows},
            {
                "content.created": True,
                "content.updated": False,
                # Not sent: the default.
                "content.deleted": True,
                "content.restored": True,
            },
        )

        row = {
            row["model"]: row for row in client.get(f"{API}/settings").json()["models"]
        }["testapp.article"]
        self.assertEqual(row["scope"], "all")
        self.assertFalse(row["default"])
        self.assertFalse(row["events"]["updated"])

    def test_rejects_bad_rows(self):
        client = self.client_for(self.bob)

        for payload in (
            {"scope": "some", "events": {}},
            {"scope": "all", "events": {"reordered": True}},
            {"scope": "all", "events": {"updated": "yes"}},
        ):
            response = client.put(
                f"{API}/settings/models/testapp.article", payload, format="json"
            )
            self.assertEqual(response.status_code, 400, payload)

        response = client.put(
            f"{API}/settings/models/testapp.note",
            {"scope": "all", "events": {}},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_events(self):
        register_event("blog.review", "Review", description="Asked for review")
        register_event("blog.failed", "Failed", required=True, level="error")
        register_event("blog.digest", "Digest", default=False)

        try:
            client = self.client_for(self.bob)
            data = {e["key"]: e for e in client.get(f"{API}/settings").json()["events"]}

            self.assertTrue(data["blog.review"]["enabled"])
            self.assertEqual(data["blog.review"]["description"], "Asked for review")
            self.assertTrue(data["blog.failed"]["required"])
            self.assertFalse(data["blog.digest"]["enabled"])

            response = client.put(
                f"{API}/settings/events/blog.review", {"enabled": False}, format="json"
            )
            self.assertEqual(response.status_code, 204)
            response = client.put(
                f"{API}/settings/events/blog.failed", {"enabled": False}, format="json"
            )
            self.assertEqual(response.status_code, 403)
            response = client.put(
                f"{API}/settings/events/blog.unknown", {"enabled": False}, format="json"
            )
            self.assertEqual(response.status_code, 404)

            data = {e["key"]: e for e in client.get(f"{API}/settings").json()["events"]}
            self.assertFalse(data["blog.review"]["enabled"])
        finally:
            for key in ("blog.review", "blog.failed", "blog.digest"):
                events._registry.pop(key, None)

    def test_follows(self):
        page = Page.objects.create(title="About us")
        Follow.objects.create(
            user=self.bob,
            content_type=ContentType.objects.get_for_model(page),
            object_id=str(page.pk),
        )
        Follow.objects.create(
            user=self.bob,
            content_type=ContentType.objects.get_for_model(Article),
            object_id="999",
        )

        follows = self.client_for(self.bob).get(f"{API}/settings").json()["follows"]

        self.assertEqual(
            [(f["model"], f["id"], f["repr"]) for f in follows],
            [("testapp.page", str(page.pk), "About us")],
        )


class FollowTests(AdminTestCase):
    def url(self, obj=None):
        obj = obj or self.article
        return f"{API}/follow?model={obj._meta.label_lower}&id={obj.pk}"

    def test_follow_and_unfollow(self):
        client = self.client_for(self.bob)

        self.assertEqual(
            client.get(self.url()).json(), {"following": False, "creator": False}
        )

        response = client.post(
            f"{API}/follow",
            {"model": "testapp.article", "id": self.article.pk},
            format="json",
        )

        self.assertEqual(response.json()["following"], True)
        self.assertTrue(
            Follow.objects.filter(
                user=self.bob, object_id=str(self.article.pk)
            ).exists()
        )

        response = client.delete(self.url())

        self.assertEqual(response.json()["following"], False)
        self.assertFalse(Follow.objects.exists())

    def test_reports_the_creator(self):
        LogEntry.objects.create(
            user=self.bob,
            action_flag=ADDITION,
            content_type=ContentType.objects.get_for_model(Article),
            object_id=str(self.article.pk),
            object_repr="Spring menu",
        )

        data = self.client_for(self.bob).get(self.url()).json()

        self.assertTrue(data["creator"])

    def test_needs_view_permission(self):
        carol = self.staff("carol", "view_page")

        self.assertEqual(self.client_for(carol).get(self.url()).status_code, 404)

    def test_unknown_object(self):
        response = self.client_for(self.bob).get(
            f"{API}/follow?model=testapp.article&id=999"
        )

        self.assertEqual(response.status_code, 404)


class FlagTests(AdminTestCase):
    def test_discover_reports_the_app(self):
        data = self.client_for(self.bob).get("/api/discover").json()

        self.assertEqual(
            data["notifications"],
            {
                "enabled": True,
                "retention": 90,
                "unread_retention": None,
                "digest": False,
            },
        )

    def test_studio_flag(self):
        studio = admin_site._registry[Article]
        request = RequestFactory().get("/")
        request.user = self.bob

        self.assertTrue(AdminSerializer(studio).serialize(request)["notifications"])

        studio.notifications = False
        try:
            self.assertFalse(
                AdminSerializer(studio).serialize(request)["notifications"]
            )
        finally:
            del studio.notifications
