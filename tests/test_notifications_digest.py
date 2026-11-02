"""
Tests for notifications v2: the email digest (command, selection, the
editor's opt-out, the emails, system check E032) and the list's filters
and search.
"""

from datetime import timedelta
from io import StringIO
from unittest import mock

from django.contrib.auth.models import Permission, User
from django.contrib.contenttypes.models import ContentType
from django.core import mail
from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from content_studio.checks import check_content_studio
from content_studio.notifications.digest import DIGEST_EVENT, send_digests
from content_studio.notifications.models import Notification, NotificationSubscription
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.admin import ArticleAdmin
from tests.testapp.models import Article, Category, Page, SiteSettings

from tests.test_notifications import registered

API = "/api/notifications"

DIGEST = {
    "ADMIN_SITE": "content_studio.admin.admin_site",
    "NOTIFICATION_EMAIL_DIGEST": True,
    "ADMIN_URL": "https://example.com/admin/",
}


class DigestTestCase(TestCase):
    def setUp(self):
        self.anna = self.staff("anna", first_name="Anna", last_name="de Vries")
        self.bob = self.staff("bob", email="bob@example.com")
        self.article = Article.objects.create(title="Spring menu")

    def staff(self, username, *codenames, **fields):
        user = User.objects.create_user(
            username=username, password="x", is_staff=True, **fields
        )
        codenames = codenames or ("view_article", "view_page", "view_sitesettings")
        user.user_permissions.set(Permission.objects.filter(codename__in=codenames))
        return user

    def notification(self, recipient, obj=None, age=120, **fields):
        if obj is not None:
            fields.setdefault("content_type", ContentType.objects.get_for_model(obj))
            fields.setdefault("object_id", str(obj.pk))
            fields.setdefault("object_repr", str(obj))
        fields.setdefault("event", "content.updated")
        notification = Notification.objects.create(recipient=recipient, **fields)
        Notification.objects.filter(pk=notification.pk).update(
            updated_at=timezone.now() - timedelta(minutes=age)
        )
        notification.refresh_from_db()
        return notification

    def run_digest(self, **options):
        out = StringIO()

        with override_settings(CONTENT_STUDIO=DIGEST):
            call_command(
                "content_studio_send_notification_digest", stdout=out, **options
            )

        return out.getvalue()


class DigestCommandTests(DigestTestCase):
    def test_mails_unread_notifications_once(self):
        notification = self.notification(self.bob, self.article, actor=self.anna)

        out = self.run_digest()

        self.assertIn("Sent 1 emails with 1 notifications.", out)
        (message,) = mail.outbox
        self.assertEqual(message.to, ["bob@example.com"])
        self.assertEqual(message.subject, "You have 1 unread notification")
        self.assertIn("Anna de Vries updated the article Spring menu", message.body)
        self.assertIn(
            f"https://example.com/admin/content/testapp.article/{self.article.pk}",
            message.body,
        )
        self.assertIn("https://example.com/admin/notifications/settings", message.body)
        html, mimetype = message.alternatives[0]
        self.assertEqual(mimetype, "text/html")
        self.assertIn("Spring menu", html)
        notification.refresh_from_db()
        self.assertIsNotNone(notification.emailed_at)

        self.run_digest()

        self.assertEqual(len(mail.outbox), 1)

    def test_leaves_out_read_recent_and_mailed_ones(self):
        self.notification(self.bob, self.article, read_at=timezone.now())
        self.notification(self.bob, self.article, age=10)
        self.notification(self.bob, self.article, emailed_at=timezone.now())

        self.run_digest()

        self.assertEqual(mail.outbox, [])

    def test_delay_option(self):
        self.notification(self.bob, self.article, age=10)

        self.run_digest(delay=5)

        self.assertEqual(len(mail.outbox), 1)

    def test_one_email_per_user(self):
        carol = self.staff("carol", email="carol@example.com")
        self.notification(self.bob, self.article)
        self.notification(self.bob, self.article, event="content.deleted")
        self.notification(carol, self.article)

        self.run_digest()

        self.assertEqual(
            sorted(m.to[0] for m in mail.outbox),
            ["bob@example.com", "carol@example.com"],
        )
        bob = next(m for m in mail.outbox if m.to == ["bob@example.com"])
        self.assertEqual(bob.subject, "You have 2 unread notifications")

    def test_skips_users_without_email_inactive_or_not_staff(self):
        self.notification(self.anna, self.article)
        inactive = self.staff("dave", email="d@example.com", is_active=False)
        self.notification(inactive, self.article)
        visitor = User.objects.create_user("eve", email="e@example.com")
        self.notification(visitor, self.article)

        self.run_digest()

        self.assertEqual(mail.outbox, [])

    def test_skips_users_who_turned_it_off(self):
        NotificationSubscription.objects.create(
            user=self.bob, event=DIGEST_EVENT, enabled=False
        )
        self.notification(self.bob, self.article)

        self.run_digest()

        self.assertEqual(mail.outbox, [])

    def test_leaves_out_what_the_user_may_not_view(self):
        hidden = Article.objects.create(title="Secret")
        self.notification(self.bob, hidden)

        with mock.patch.object(
            ArticleAdmin,
            "has_view_permission",
            lambda studio, request, obj=None: obj is None or obj.title != "Secret",
        ):
            self.run_digest()

        self.assertEqual(mail.outbox, [])
        self.assertIsNone(Notification.objects.get().emailed_at)

    def test_per_tenant(self):
        tenant = Category.objects.create(name="a")
        page = Page.objects.create(title="Home", slug="home", category=tenant)
        self.notification(self.bob, page, tenant=str(tenant.pk))

        with override_settings(
            CONTENT_STUDIO={**DIGEST, "TENANT_MODEL": "tests.testapp.models.Category"}
        ):
            emails, mailed = send_digests()

        self.assertEqual((emails, mailed), (1, 1))
        self.assertIn("Home", mail.outbox[0].body)

    def test_deleted_object_is_not_linked(self):
        self.notification(
            self.bob,
            event="content.deleted",
            content_type=ContentType.objects.get_for_model(Article),
            object_id="999",
            object_repr="Gone",
        )

        self.run_digest()

        self.assertIn("deleted the article Gone", mail.outbox[0].body)
        self.assertNotIn("testapp.article/999", mail.outbox[0].body)

    def test_summary_names_objects_and_links_the_list(self):
        self.notification(
            self.bob,
            event="content.updated",
            content_type=ContentType.objects.get_for_model(Article),
            count=5,
            params={
                "objects": [{"id": "1", "repr": "One"}, {"id": "2", "repr": "Two"}]
            },
            actor=self.anna,
        )

        self.run_digest()

        body = mail.outbox[0].body
        self.assertIn("Anna de Vries updated 5 articles", body)
        self.assertIn("One, Two and 3 more", body)
        self.assertIn("https://example.com/admin/content/testapp.article\n", body)

    def test_singleton_links_its_page(self):
        settings_obj = SiteSettings.objects.create()
        self.notification(self.bob, settings_obj)

        self.run_digest()

        self.assertIn(
            "https://example.com/admin/content/testapp.sitesettings\n",
            mail.outbox[0].body,
        )

    def test_registered_event_text_and_url(self):
        with registered("blog.submitted", "Submitted"):
            self.notification(
                self.bob,
                event="blog.submitted",
                title="%(title)s is ready for review",
                params={"title": "Spring menu"},
                url="/dashboard",
            )

            self.run_digest()

        body = mail.outbox[0].body
        self.assertIn("Spring menu is ready for review", body)
        self.assertIn("https://example.com/admin/dashboard", body)

    def test_caps_the_named_notifications(self):
        for index in range(23):
            self.notification(self.bob, self.article)

        self.run_digest()

        self.assertIn("And 3 more.", mail.outbox[0].body)
        self.assertEqual(Notification.objects.filter(emailed_at=None).count(), 0)

    def test_failed_send_is_retried_next_run(self):
        self.notification(self.bob, self.article)

        with mock.patch(
            "django.core.mail.EmailMultiAlternatives.send", side_effect=OSError
        ):
            out = self.run_digest()

        self.assertIn("Sent 0 emails", out)
        self.assertIsNone(Notification.objects.get().emailed_at)

        self.run_digest()

        self.assertEqual(len(mail.outbox), 1)

    def test_refuses_when_off(self):
        with self.assertRaises(CommandError):
            call_command("content_studio_send_notification_digest", stdout=StringIO())

    def test_refuses_a_negative_delay(self):
        with self.assertRaises(CommandError):
            self.run_digest(delay=-1)


class DigestSettingsTests(DigestTestCase):
    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
        return client

    def test_settings_show_the_digest_when_on(self):
        with override_settings(CONTENT_STUDIO=DIGEST):
            response = self.client_for(self.bob).get(f"{API}/settings")

        self.assertEqual(
            response.json()["digest"], {"enabled": True, "email": "bob@example.com"}
        )

    def test_settings_hide_the_digest_when_off(self):
        response = self.client_for(self.bob).get(f"{API}/settings")

        self.assertIsNone(response.json()["digest"])

    def test_turn_it_off_and_on(self):
        client = self.client_for(self.bob)

        with override_settings(CONTENT_STUDIO=DIGEST):
            response = client.put(
                f"{API}/settings/digest", {"enabled": False}, format="json"
            )
            self.assertEqual(response.status_code, 204)
            self.assertFalse(client.get(f"{API}/settings").json()["digest"]["enabled"])

            client.put(f"{API}/settings/digest", {"enabled": True}, format="json")
            self.assertTrue(client.get(f"{API}/settings").json()["digest"]["enabled"])

        self.assertEqual(
            NotificationSubscription.objects.filter(event=DIGEST_EVENT).count(), 1
        )

    def test_put_validates_and_needs_the_digest(self):
        client = self.client_for(self.bob)

        response = client.put(
            f"{API}/settings/digest", {"enabled": True}, format="json"
        )
        self.assertEqual(response.status_code, 404)

        with override_settings(CONTENT_STUDIO=DIGEST):
            response = client.put(
                f"{API}/settings/digest", {"enabled": "yes"}, format="json"
            )

        self.assertEqual(response.status_code, 400)

    def test_discover_flag(self):
        client = self.client_for(self.bob)

        self.assertFalse(client.get("/api/discover").json()["notifications"]["digest"])

        with override_settings(CONTENT_STUDIO=DIGEST):
            self.assertTrue(
                client.get("/api/discover").json()["notifications"]["digest"]
            )


class DigestCheckTests(TestCase):
    def ids(self, **settings):
        with override_settings(
            CONTENT_STUDIO={"ADMIN_SITE": "content_studio.admin.admin_site", **settings}
        ):
            return [m.id for m in check_content_studio()]

    def test_e032(self):
        for settings, expected in (
            ({}, False),
            (DIGEST, False),
            ({"NOTIFICATION_EMAIL_DIGEST": "yes"}, True),
            ({"NOTIFICATION_EMAIL_DIGEST": True}, True),
            ({"ADMIN_URL": "/admin/"}, True),
            ({"ADMIN_URL": "ftp://example.com/"}, True),
            ({"ADMIN_URL": "https://example.com/admin/"}, False),
        ):
            self.assertEqual(
                "content_studio.E032" in self.ids(**settings), expected, settings
            )


class FilterTests(DigestTestCase):
    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
        return client

    def ids(self, **params):
        response = self.client_for(self.bob).get(API, {"filter": "all", **params})
        self.assertEqual(response.status_code, 200)
        return [r["id"] for r in response.json()["results"]]

    def test_model_and_event(self):
        page = Page.objects.create(title="Home", slug="home")
        article = self.notification(self.bob, self.article)
        deleted = self.notification(self.bob, self.article, event="content.deleted")
        on_page = self.notification(self.bob, page)

        self.assertEqual(self.ids(model="testapp.article"), [deleted.pk, article.pk])
        self.assertEqual(self.ids(model="testapp.page"), [on_page.pk])
        self.assertEqual(self.ids(model="nope.nope"), [])
        self.assertEqual(self.ids(event="content.deleted"), [deleted.pk])
        self.assertEqual(
            self.ids(model="testapp.article", event="content.updated"), [article.pk]
        )

    def test_search(self):
        menu = self.notification(self.bob, self.article, actor=self.anna)
        other = self.notification(
            self.bob, Article.objects.create(title="Autumn"), event="content.deleted"
        )
        summary = self.notification(
            self.bob,
            content_type=ContentType.objects.get_for_model(Article),
            count=2,
            params={"objects": [{"id": "9", "repr": "Winter soup"}]},
        )

        self.assertEqual(self.ids(q="spring"), [menu.pk])
        self.assertEqual(self.ids(q="vries"), [menu.pk])
        self.assertEqual(self.ids(q="autumn"), [other.pk])
        self.assertEqual(self.ids(q="winter"), [summary.pk])
        self.assertEqual(self.ids(q="spring anna"), [menu.pk])
        self.assertEqual(self.ids(q="spring autumn"), [])

    def test_search_keeps_the_unread_filter(self):
        self.notification(self.bob, self.article, read_at=timezone.now())

        response = self.client_for(self.bob).get(API, {"q": "spring"})

        self.assertEqual(response.json()["results"], [])

    def test_filters_endpoint(self):
        page = Page.objects.create(title="Home", slug="home")
        self.notification(self.bob, self.article)
        self.notification(self.bob, self.article)
        self.notification(self.bob, page, event="content.deleted")
        self.notification(self.anna, self.article, event="content.restored")

        with registered("blog.submitted", "Submitted"):
            self.notification(self.bob, event="blog.submitted")
            self.notification(self.bob, event="gone.event")
            response = self.client_for(self.bob).get(f"{API}/filters")

        self.assertEqual(
            response.json(),
            {
                "models": ["testapp.article", "testapp.page"],
                "events": [
                    {"key": "blog.submitted", "label": "Submitted"},
                    {"key": "content.deleted", "label": None},
                    {"key": "content.updated", "label": None},
                    {"key": "gone.event", "label": "gone.event"},
                ],
            },
        )

    def test_filters_leave_out_what_the_user_may_not_view(self):
        self.notification(self.bob, self.article)
        self.bob.user_permissions.clear()

        response = self.client_for(self.bob).get(f"{API}/filters")

        self.assertEqual(response.json(), {"models": [], "events": []})
