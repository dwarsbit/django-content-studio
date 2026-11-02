"""
Tests for the notifications additions after v1: the site's
get_default_subscriptions hook, the webhooks.delivery_failed event and
the dashboard widget.
"""

from contextlib import contextmanager
from unittest import mock

from django.contrib.auth.models import Group, Permission, User
from django.test import TestCase

from content_studio.admin import admin_site
from content_studio.checks import (
    BUILT_IN_WIDGET_TYPES,
    dashboard_widget_warnings,
)
from content_studio.dashboard import Dashboard
from content_studio.notifications.dashboard import NotificationsWidget
from content_studio.notifications.defaults import (
    ContentDefault,
    parse,
    site_overrides_defaults,
)
from content_studio.notifications.events import get_event
from content_studio.notifications.models import (
    Notification,
    NotificationSubscription,
)
from content_studio.webhooks.delivery import deliver
from content_studio.webhooks.failures import EVENT_KEY, notify_failure
from content_studio.webhooks.models import Webhook, WebhookDelivery
from tests.test_notifications import NotificationTestCase, registered
from tests.test_notifications_admin import API, AdminTestCase
from tests.testapp.models import Article, Page


@contextmanager
def site_defaults(hook):
    """Override the site's get_default_subscriptions for a test."""
    with mock.patch.object(admin_site, "get_default_subscriptions", hook, create=True):
        yield


def editors_get_everything_on_articles(user):
    if any(group.name == "editors" for group in user.groups.all()):
        return {Article: {"events": ["created", "updated"], "scope": "all"}}

    return {}


class ParseTests(TestCase):
    def test_not_overridden_by_default(self):
        self.assertFalse(site_overrides_defaults())

        with site_defaults(lambda user: {}):
            self.assertTrue(site_overrides_defaults())

    def test_parses_models_and_events(self):
        defaults = parse(
            {
                Article: {"events": ["deleted"]},
                Page: {"events": ["created"], "scope": "all"},
                "blog.digest": False,
            }
        )

        self.assertEqual(
            defaults.for_model(Article),
            ContentDefault(scope="mine", actions=frozenset({"deleted"})),
        )
        self.assertEqual(defaults.for_model(Page).scope, "all")
        self.assertEqual(defaults.events, {"blog.digest": False})

    def test_none_is_no_defaults(self):
        self.assertEqual(parse(None).models, {})

    def test_rejects_malformed_values(self):
        for value in (
            [],
            {Article: ["updated"]},
            {Article: {"events": ["reordered"]}},
            {Article: {"events": "updated"}},
            {Article: {"events": [], "scope": "some"}},
            {Article: {"events": [], "extra": 1}},
            {"blog.digest": "yes"},
            {1: True},
        ):
            with self.subTest(value=value), self.assertRaises((TypeError, ValueError)):
                parse(value)

    def test_includes(self):
        mine = ContentDefault(scope="mine", actions=frozenset({"created", "updated"}))
        everything = ContentDefault(scope="all", actions=frozenset({"created"}))

        self.assertTrue(mine.includes("updated", creator=True))
        self.assertFalse(mine.includes("updated"))
        # Creating an object never notifies its creator.
        self.assertFalse(mine.includes("created", creator=True))
        self.assertTrue(everything.includes("created"))
        self.assertFalse(everything.includes("deleted"))


class DefaultHookFanOutTests(NotificationTestCase):
    def setUp(self):
        super().setUp()
        self.editors = Group.objects.create(name="editors")
        self.carol.groups.add(self.editors)

    def test_group_default_notifies_about_every_object(self):
        article = self.article(creator=self.anna)

        with site_defaults(editors_get_everything_on_articles):
            self.send(self.change(article, "created", user=self.bob))
            self.send(self.change(article, "deleted", user=self.bob))

        # Carol gets created through her group; deleted is not in it.
        (notification,) = self.inbox(self.carol)
        self.assertEqual(notification.event, "content.created")
        # Anna is outside the group: the hook's {} keeps her built-in
        # default, which covers deletions of what she created.
        self.assertEqual([n.event for n in self.inbox(self.anna)], ["content.deleted"])

    def test_a_stored_choice_wins(self):
        self.subscribe(self.carol, Article, "created", scope="all", enabled=False)
        article = self.article()

        with site_defaults(editors_get_everything_on_articles):
            self.send(self.change(article, "created", user=self.bob))

        self.assertEqual(self.recipients(), [])

    def test_a_default_can_quiet_creators(self):
        article = self.article(creator=self.anna)

        with site_defaults(lambda user: {Article: {"events": []}}):
            self.send(self.change(article, user=self.bob))

        self.assertEqual(self.recipients(), [])

    def test_own_changes_and_permissions_still_apply(self):
        self.carol.user_permissions.clear()
        dave = self.staff("dave")
        dave.groups.add(self.editors)
        article = self.article()

        with site_defaults(editors_get_everything_on_articles):
            self.send(self.change(article, "created", user=dave))

        # Carol may not view articles, Dave made the change.
        self.assertEqual(self.recipients(), [])

    def test_follow_only_changes_ignore_defaults(self):
        article = self.article()

        with site_defaults(
            lambda user: {Article: {"events": ["updated"], "scope": "all"}}
        ):
            self.send(self.change(article, "reordered", user=self.bob))

        self.assertEqual(self.recipients(), [])

    def test_custom_event_default_per_user(self):
        NotificationSubscription.objects.create(
            user=self.anna, event="blog.rare", enabled=False
        )

        def hook(user):
            return {"blog.rare": True} if user.username in ("anna", "carol") else {}

        with registered("blog.rare", "Rare", default=False), site_defaults(hook):
            self.notify("blog.rare", title="Rare")

        # Anna opted out; Bob keeps the event's own default (off).
        self.assertEqual(self.recipients(), ["carol"])


class DefaultHookSettingsTests(AdminTestCase):
    def test_the_grid_shows_the_users_defaults(self):
        with site_defaults(
            lambda user: {Article: {"events": ["created"], "scope": "all"}}
        ):
            data = self.client_for(self.bob).get(f"{API}/settings").json()

        models = {row["model"]: row for row in data["models"]}
        self.assertEqual(
            models["testapp.article"],
            {
                "model": "testapp.article",
                "scope": "all",
                "events": {
                    "created": True,
                    "updated": False,
                    "deleted": False,
                    "restored": False,
                },
                "default": True,
            },
        )
        # Other models keep the built-in default.
        self.assertTrue(models["testapp.page"]["events"]["updated"])

    def test_events_show_the_users_defaults(self):
        with (
            registered("blog.quiet", "Quiet", default=False),
            site_defaults(lambda user: {"blog.quiet": True}),
        ):
            data = self.client_for(self.bob).get(f"{API}/settings").json()

        events = {event["key"]: event for event in data["events"]}
        self.assertTrue(events["blog.quiet"]["enabled"])

    def test_storing_a_row_fills_missing_actions_from_the_defaults(self):
        with site_defaults(lambda user: {Article: {"events": ["created"]}}):
            response = self.client_for(self.bob).put(
                f"{API}/settings/models/testapp.article",
                {"scope": "all", "events": {"updated": True}},
                format="json",
            )

        self.assertEqual(response.status_code, 204)
        stored = dict(
            NotificationSubscription.objects.filter(user=self.bob).values_list(
                "event", "enabled"
            )
        )
        self.assertEqual(
            stored,
            {
                "content.created": True,
                "content.updated": True,
                "content.deleted": False,
                "content.restored": False,
            },
        )


class WebhookFailureTests(NotificationTestCase):
    def setUp(self):
        super().setUp()
        self.webhook = Webhook.objects.create(
            name="build", url="https://example.com/hook", is_active=False
        )
        # Anna may change webhooks; Bob may only view them.
        self.anna.user_permissions.add(
            *Permission.objects.filter(codename__in=["view_webhook", "change_webhook"])
        )
        self.bob.user_permissions.add(Permission.objects.get(codename="view_webhook"))

    def fail(self):
        delivery = WebhookDelivery.objects.create(webhook=self.webhook, payload={})

        with self.captureOnCommitCallbacks(execute=True):
            deliver(delivery.pk)

        delivery.refresh_from_db()
        self.assertEqual(delivery.status, WebhookDelivery.Status.FAILED)
        return delivery

    def test_the_event_is_registered(self):
        event = get_event(EVENT_KEY)

        self.assertEqual(event.level, "error")
        self.assertTrue(event.default)
        self.assertFalse(event.required)

    def test_a_failed_delivery_notifies_who_may_change_the_webhook(self):
        self.fail()

        (notification,) = self.inbox(self.anna)
        self.assertEqual(self.recipients(), ["anna"])
        self.assertEqual(notification.event, EVENT_KEY)
        self.assertEqual(notification.level, "error")
        self.assertEqual(notification.object_id, str(self.webhook.pk))
        self.assertEqual(notification.get_title(), "Webhook build failed")
        self.assertEqual(
            notification.get_body(),
            "The last attempt failed: The webhook is not active.",
        )

    def test_superusers_are_notified(self):
        User.objects.create_superuser("root", password="x")

        self.fail()

        self.assertEqual(self.recipients(), ["anna", "root"])

    def test_a_second_failure_bumps_the_unread_one(self):
        self.fail()
        self.fail()

        (notification,) = self.inbox(self.anna)
        self.assertEqual(notification.count, 2)

    def test_opting_out_is_respected(self):
        NotificationSubscription.objects.create(
            user=self.anna, event=EVENT_KEY, enabled=False
        )

        self.fail()

        self.assertEqual(self.recipients(), [])

    def test_a_retried_attempt_notifies_nobody(self):
        self.webhook.is_active = True
        self.webhook.save()
        delivery = WebhookDelivery.objects.create(webhook=self.webhook, payload={})

        with (
            mock.patch("content_studio.webhooks.delivery.send", return_value=(503, "")),
            self.captureOnCommitCallbacks(execute=True),
        ):
            deliver(delivery.pk)

        delivery.refresh_from_db()
        self.assertEqual(delivery.status, WebhookDelivery.Status.PENDING)
        self.assertEqual(self.recipients(), [])

    def test_nothing_without_the_notifications_app(self):
        delivery = WebhookDelivery.objects.create(webhook=self.webhook, payload={})

        with mock.patch(
            "content_studio.webhooks.failures.apps.is_installed", return_value=False
        ):
            self.assertEqual(notify_failure(delivery), 0)

    def test_a_failing_notification_does_not_break_the_delivery(self):
        delivery = WebhookDelivery.objects.create(webhook=self.webhook, payload={})

        with (
            mock.patch(
                "content_studio.webhooks.delivery.notify_failure",
                side_effect=RuntimeError("boom"),
            ),
            self.assertLogs("content_studio.webhooks", "ERROR"),
        ):
            self.assertTrue(deliver(delivery.pk))

        delivery.refresh_from_db()
        self.assertEqual(delivery.status, WebhookDelivery.Status.FAILED)


class WidgetTests(NotificationTestCase):
    def test_the_latest_notifications_and_the_unread_count(self):
        for title in "abcdef":
            Notification.objects.create(
                recipient=self.anna, event="content.updated", object_repr=title
            )
        Notification.objects.filter(object_repr="f").update(read_at="2026-01-01T00:00Z")
        Notification.objects.create(recipient=self.bob, event="content.updated")

        data = NotificationsWidget(limit=3).get_data(self.request(self.anna))

        self.assertEqual(data["title"], "Notifications")
        self.assertEqual(data["unread"], 5)
        self.assertEqual(len(data["results"]), 3)
        # Newest first, only Anna's.
        newest = Notification.objects.filter(recipient=self.anna).order_by(
            "-updated_at", "-pk"
        )
        self.assertEqual(
            [row["id"] for row in data["results"]],
            list(newest.values_list("pk", flat=True)[:3]),
        )

    def test_limit_must_be_positive(self):
        for limit in (0, -1, "5", True):
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                NotificationsWidget(limit=limit)

    def test_is_a_built_in_widget_type(self):
        self.assertIn(NotificationsWidget.widget_type, BUILT_IN_WIDGET_TYPES)

    def test_warns_without_the_notifications_app(self):
        site = mock.Mock(dashboard=Dashboard(widgets=[NotificationsWidget()]))
        site.extensions = []

        self.assertEqual(dashboard_widget_warnings(site), [])

        with mock.patch("content_studio.checks.apps.is_installed", return_value=False):
            ((check_id, _),) = dashboard_widget_warnings(site)

        self.assertEqual(check_id, "content_studio.W021")
