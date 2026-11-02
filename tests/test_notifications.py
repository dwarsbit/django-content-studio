"""
Tests for the notifications app: the content_changed fan-out
(subscriptions, scopes, follows, self-exclusion, permissions, tenants,
coalescing), register_event and notify, the read filter, the prune
command and the system checks.

Most tests send content_changed with hand-built Change objects; the
creator of an object is the user of its ADDITION LogEntry.
"""

from contextlib import contextmanager
from datetime import timedelta
from io import StringIO
from unittest import mock

from django.contrib.admin.models import ADDITION, LogEntry
from django.contrib.auth.models import Group, Permission, User
from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.db import connection, transaction
from django.test import RequestFactory, TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from django.utils.translation import gettext_lazy

from content_studio.checks import check_content_studio
from content_studio.notifications import events, notify, register_event
from content_studio.notifications.fan_out import fan_out, flatten
from content_studio.notifications.models import (
    Follow,
    Notification,
    NotificationSubscription,
)
from content_studio.notifications.reading import unread_count, visible_notifications
from content_studio.signals import Change, content_changed
from tests.testapp.admin import ArticleAdmin, PageAdmin
from tests.testapp.models import Article, Category, Note, Page

ARTICLES = "/api/content/testapp.article"
TENANTS = {
    "ADMIN_SITE": "content_studio.admin.admin_site",
    "TENANT_MODEL": "tests.testapp.models.Category",
}


@contextmanager
def registered(*args, **kwargs):
    """Register an event for the duration of a test."""
    event = register_event(*args, **kwargs)
    try:
        yield event
    finally:
        events._registry.pop(event.key, None)


class NotificationTestCase(TestCase):
    def setUp(self):
        self.anna = self.staff("anna")
        self.bob = self.staff("bob")
        self.carol = self.staff("carol")

    def staff(self, username, *codenames, **fields):
        user = User.objects.create_user(
            username=username, password="x", is_staff=True, **fields
        )
        codenames = codenames or ("view_article", "view_page", "view_note")
        user.user_permissions.set(Permission.objects.filter(codename__in=codenames))
        return user

    def article(self, title="Hello", creator=None):
        article = Article.objects.create(title=title)
        if creator:
            self.log_creation(article, creator)
        return article

    def log_creation(self, obj, user):
        LogEntry.objects.create(
            user=user,
            action_flag=ADDITION,
            content_type=ContentType.objects.get_for_model(obj),
            object_id=str(obj.pk),
            object_repr=str(obj)[:200],
        )

    def change(self, obj, action="updated", user=None, tenant_id=None):
        return Change(
            action=action,
            model=type(obj),
            object_id=str(obj.pk),
            object_repr=str(obj),
            tenant_id=tenant_id,
            user=user,
            timestamp=timezone.now(),
        )

    def send(self, *changes, user=None):
        content_changed.send(sender=None, changes=list(changes), user=user)

    def subscribe(self, user, model, action, scope="all", enabled=True, tenant=""):
        return NotificationSubscription.objects.create(
            user=user,
            content_type=ContentType.objects.get_for_model(model),
            event=f"content.{action}",
            scope=scope,
            enabled=enabled,
            tenant=tenant,
        )

    def follow(self, user, obj, tenant=""):
        return Follow.objects.create(
            user=user,
            content_type=ContentType.objects.get_for_model(obj),
            object_id=str(obj.pk),
            tenant=tenant,
        )

    def notify(self, *args, **kwargs):
        with self.captureOnCommitCallbacks(execute=True):
            return notify(*args, **kwargs)

    def inbox(self, user):
        return list(Notification.objects.filter(recipient=user))

    def recipients(self):
        return sorted(
            Notification.objects.values_list("recipient__username", flat=True)
        )

    def request(self, user, tenant=None):
        headers = {"HTTP_X_DCS_TENANT": str(tenant)} if tenant is not None else {}
        request = RequestFactory().get("/", **headers)
        request.user = user
        return request


class DefaultTests(NotificationTestCase):
    def test_creator_is_notified_about_updates_by_others(self):
        article = self.article(creator=self.anna)

        self.send(self.change(article, user=self.bob), user=self.bob)

        (notification,) = self.inbox(self.anna)
        self.assertEqual(notification.event, "content.updated")
        self.assertEqual(notification.actor, self.bob)
        self.assertEqual(notification.object_id, str(article.pk))
        self.assertEqual(notification.object_repr, "Hello")
        self.assertEqual(notification.count, 1)
        self.assertIsNone(notification.read_at)
        self.assertEqual(self.recipients(), ["anna"])

    def test_default_covers_updated_deleted_and_restored(self):
        article = self.article(creator=self.anna)

        for action in ("created", "updated", "deleted", "restored", "reordered"):
            self.send(self.change(article, action, user=self.bob))

        self.assertEqual(
            sorted(n.event for n in self.inbox(self.anna)),
            ["content.deleted", "content.restored", "content.updated"],
        )

    def test_own_changes_never_notify(self):
        article = self.article(creator=self.anna)
        self.follow(self.anna, article)
        self.subscribe(self.anna, Article, "updated")

        self.send(self.change(article, user=self.anna))

        self.assertEqual(self.recipients(), [])

    def test_creator_can_opt_out(self):
        article = self.article(creator=self.anna)
        self.subscribe(self.anna, Article, "updated", scope="mine", enabled=False)

        self.send(self.change(article, user=self.bob))

        self.assertEqual(self.recipients(), [])

    def test_creator_can_opt_in_to_more_events(self):
        article = self.article(creator=self.anna)
        self.subscribe(self.anna, Article, "created", scope="mine")
        self.subscribe(self.anna, Article, "updated", scope="mine")

        self.send(self.change(article, user=self.bob))

        self.assertEqual(self.recipients(), ["anna"])

    def test_objects_without_a_creator_notify_nobody_by_default(self):
        article = self.article()

        self.send(self.change(article, user=self.bob))

        self.assertEqual(self.recipients(), [])


class SubscriptionTests(NotificationTestCase):
    def test_scope_all_notifies_about_every_object(self):
        self.subscribe(self.carol, Article, "created")
        article = self.article(creator=self.anna)

        self.send(self.change(article, "created", user=self.anna))

        (notification,) = self.inbox(self.carol)
        self.assertEqual(notification.event, "content.created")
        self.assertEqual(self.recipients(), ["carol"])

    def test_subscriptions_are_per_model_and_event(self):
        self.subscribe(self.carol, Article, "deleted")
        self.subscribe(self.carol, Note, "updated")
        article = self.article()

        self.send(self.change(article, user=self.anna))

        self.assertEqual(self.recipients(), [])

    def test_disabled_subscription_matches_nothing(self):
        self.subscribe(self.carol, Article, "updated", enabled=False)

        self.send(self.change(self.article(), user=self.anna))

        self.assertEqual(self.recipients(), [])

    def test_reorders_only_notify_followers(self):
        article = self.article(creator=self.anna)
        self.subscribe(self.carol, Article, "reordered")
        self.follow(self.bob, article)

        self.send(self.change(article, "reordered", user=self.carol))

        self.assertEqual(self.recipients(), ["bob"])

    def test_studio_can_opt_a_model_out(self):
        self.subscribe(self.carol, Article, "updated")

        with mock.patch.object(ArticleAdmin, "notifications", False):
            self.send(self.change(self.article(), user=self.anna))

        self.assertEqual(self.recipients(), [])

    def test_changes_to_notifications_are_ignored(self):
        notification = Notification.objects.create(
            recipient=self.anna, event="content.updated"
        )

        self.assertEqual(flatten([self.change(notification, user=self.bob)]), [])


class FollowTests(NotificationTestCase):
    def test_followers_hear_about_every_change(self):
        article = self.article()
        self.follow(self.carol, article)

        for action in ("updated", "deleted", "restored"):
            self.send(self.change(article, action, user=self.anna))

        self.assertEqual(
            sorted(n.event for n in self.inbox(self.carol)),
            ["content.deleted", "content.restored", "content.updated"],
        )

    def test_follows_are_per_object(self):
        followed, other = self.article("a"), self.article("b")
        self.follow(self.carol, followed)

        self.send(self.change(other, user=self.anna))

        self.assertEqual(self.recipients(), [])


class PermissionTests(NotificationTestCase):
    def test_recipients_need_view_or_change_permission(self):
        article = self.article()
        viewer = self.staff("viewer", "view_article")
        changer = self.staff("changer", "change_article")
        neither = self.staff("neither", "view_note")
        for user in (viewer, changer, neither):
            self.follow(user, article)

        self.send(self.change(article, user=self.anna))

        self.assertEqual(self.recipients(), ["changer", "viewer"])

    def test_recipients_must_be_active_staff(self):
        article = self.article()
        self.follow(self.staff("gone", is_active=False), article)
        self.follow(
            User.objects.create_user("root", password="x", is_superuser=True),
            article,
        )

        self.send(self.change(article, user=self.anna))

        self.assertEqual(self.recipients(), [])

    def test_superusers_pass(self):
        root = User.objects.create_superuser("root", password="x")
        article = self.article()
        self.follow(root, article)

        self.send(self.change(article, user=self.anna))

        self.assertEqual(self.recipients(), ["root"])

    def test_studio_override_is_asked_with_the_recipient_and_tenant(self):
        mine, other = Category.objects.create(name="a"), Category.objects.create(
            name="b"
        )
        page = Page.objects.create(title="p", slug="p", category=mine)
        hidden = Page.objects.create(title="h", slug="h", category=mine)
        self.subscribe(self.carol, Page, "updated", tenant=str(mine.pk))
        seen = []

        def has_view_permission(studio, request, obj=None):
            seen.append(
                (request.user, request.headers.get("x-dcs-tenant"), obj and obj.pk)
            )
            return obj is None or obj.title != "h"

        with override_settings(CONTENT_STUDIO=TENANTS):
            with mock.patch.object(
                PageAdmin, "has_view_permission", has_view_permission
            ):
                self.send(
                    self.change(page, user=self.anna, tenant_id=mine.pk),
                    self.change(hidden, user=self.anna, tenant_id=mine.pk),
                )

        (notification,) = self.inbox(self.carol)
        self.assertEqual(notification.object_repr, "p")
        self.assertEqual(notification.tenant, str(mine.pk))
        self.assertIn((self.carol, str(mine.pk), page.pk), seen)

    def test_failing_studio_override_refuses(self):
        article = self.article()
        self.follow(self.carol, article)

        with mock.patch.object(
            ArticleAdmin, "has_view_permission", side_effect=RuntimeError
        ):
            self.send(self.change(article, user=self.anna))

        self.assertEqual(self.recipients(), [])


class TenantTests(NotificationTestCase):
    def test_subscriptions_are_per_tenant(self):
        mine, other = Category.objects.create(name="a"), Category.objects.create(
            name="b"
        )
        self.subscribe(self.carol, Page, "updated", tenant=str(mine.pk))
        pages = [
            Page.objects.create(title=c.name, slug=c.name, category=c)
            for c in (mine, other)
        ]

        with override_settings(CONTENT_STUDIO=TENANTS):
            self.send(
                *[
                    self.change(page, user=self.anna, tenant_id=page.category_id)
                    for page in pages
                ]
            )

        (notification,) = self.inbox(self.carol)
        self.assertEqual(notification.object_repr, "a")


class BatchTests(NotificationTestCase):
    def test_a_bulk_change_is_one_summary_per_recipient(self):
        articles = [self.article(f"a{i}", creator=self.anna) for i in range(50)]
        self.subscribe(self.carol, Article, "updated")
        self.follow(self.carol, articles[30])

        self.send(*[self.change(a, user=self.bob) for a in articles])

        (anna,) = self.inbox(self.anna)
        (carol,) = self.inbox(self.carol)
        self.assertEqual(anna.count, 50)
        self.assertEqual(anna.object_id, "")
        self.assertEqual(anna.key, "")
        self.assertEqual(
            [o["repr"] for o in anna.params["objects"]], ["a0", "a1", "a2"]
        )
        self.assertEqual(
            [(o["repr"], o["followed"]) for o in carol.params["objects"]],
            [("a0", False), ("a1", False), ("a2", False), ("a30", True)],
        )

    def test_one_summary_per_action(self):
        a, b = self.article("a", creator=self.anna), self.article("b", self.anna)

        self.send(self.change(a, user=self.bob), self.change(b, "deleted", self.bob))

        self.assertEqual(
            sorted(n.event for n in self.inbox(self.anna)),
            ["content.deleted", "content.updated"],
        )

    def test_an_object_changed_twice_in_a_batch_counts_once(self):
        article = self.article(creator=self.anna)

        self.send(
            self.change(article, user=self.bob), self.change(article, user=self.bob)
        )

        (notification,) = self.inbox(self.anna)
        self.assertEqual(notification.count, 1)

    def test_query_count_does_not_grow_with_the_batch(self):
        def queries(count):
            articles = [self.article(f"q{i}", creator=self.anna) for i in range(count)]
            self.follow(self.carol, articles[0])
            changes = flatten([self.change(a, user=self.bob) for a in articles])
            Notification.objects.all().delete()

            with CaptureQueriesContext(connection) as context:
                fan_out(changes)
            Follow.objects.all().delete()
            return len(context)

        # Two objects are a summary too, so neither bumps.
        self.assertEqual(queries(2), queries(50))


class CoalescingTests(NotificationTestCase):
    def test_unread_notification_is_bumped(self):
        article = self.article(creator=self.anna)

        self.send(self.change(article, user=self.bob))
        self.send(self.change(article, user=self.carol))

        (notification,) = self.inbox(self.anna)
        self.assertEqual(notification.count, 2)
        self.assertEqual(notification.actor, self.carol)

    def test_read_notification_is_not_bumped(self):
        article = self.article(creator=self.anna)

        self.send(self.change(article, user=self.bob))
        Notification.objects.update(read_at=timezone.now())
        self.send(self.change(article, user=self.bob))

        self.assertEqual(len(self.inbox(self.anna)), 2)

    def test_summaries_are_not_bumped(self):
        articles = [self.article(f"a{i}", creator=self.anna) for i in range(2)]

        for _ in range(2):
            self.send(*[self.change(a, user=self.bob) for a in articles])

        self.assertEqual(len(self.inbox(self.anna)), 2)


class EndToEndTests(NotificationTestCase):
    def test_editing_in_the_admin_notifies_the_creator(self):
        from content_studio.token_backends.jwt import create_access_token
        from rest_framework.test import APIClient

        self.anna.user_permissions.add(
            *Permission.objects.filter(codename__in=["add_article", "change_article"])
        )
        self.bob.user_permissions.add(Permission.objects.get(codename="change_article"))

        def client(user):
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
            return client

        with self.captureOnCommitCallbacks(execute=True):
            pk = (
                client(self.anna)
                .post(ARTICLES, {"title": "one"}, format="json")
                .json()["id"]
            )
        with self.captureOnCommitCallbacks(execute=True):
            client(self.bob).patch(f"{ARTICLES}/{pk}", {"title": "two"}, format="json")

        (notification,) = self.inbox(self.anna)
        self.assertEqual(notification.object_repr, "two")
        self.assertEqual(notification.actor, self.bob)
        self.assertEqual(self.recipients(), ["anna"])


class RegisterEventTests(TestCase):
    def test_registering_twice_alike_is_allowed(self):
        with registered("blog.alike", "Alike") as event:
            self.assertIs(register_event("blog.alike", "Alike"), event)

        self.assertEqual(events.registration_errors(), [])

    def test_problems_are_reported_by_e031(self):
        errors = list(events._errors)
        try:
            with registered("blog.twice", "One"):
                register_event("blog.twice", "Two")
                register_event("Bad Key", "Bad")
                register_event("content.updated", "Reserved")
                register_event("blog.level", "Level", level="loud")

                messages = [
                    m for m in check_content_studio() if m.id == "content_studio.E031"
                ]
        finally:
            events._errors[:] = errors

        self.assertEqual(len(messages), 4)
        self.assertNotIn("blog.level", events._registry)


class NotifyTests(NotificationTestCase):
    def test_unregistered_event_raises(self):
        with self.assertRaises(ValueError):
            notify("blog.unknown")

    def test_default_event_goes_to_everyone_who_did_not_opt_out(self):
        User.objects.create_user("visitor", password="x")
        NotificationSubscription.objects.create(
            user=self.bob, event="blog.digest", enabled=False
        )

        with registered("blog.digest", "Digest"):
            sent = self.notify("blog.digest", title="Weekly digest", actor=self.carol)

        self.assertEqual(sent, 1)
        self.assertEqual(self.recipients(), ["anna"])

    def test_opt_in_event_goes_to_subscribers(self):
        NotificationSubscription.objects.create(user=self.bob, event="blog.rare")

        with registered("blog.rare", "Rare", default=False):
            self.notify("blog.rare", title="Rare")

        self.assertEqual(self.recipients(), ["bob"])

    def test_required_event_ignores_opt_outs(self):
        NotificationSubscription.objects.create(
            user=self.bob, event="blog.must", enabled=False
        )

        with registered("blog.must", "Must", required=True, level="warning"):
            self.notify("blog.must", title="Must")

        self.assertEqual(self.recipients(), ["anna", "bob", "carol"])
        self.assertEqual(
            set(Notification.objects.values_list("level", flat=True)), {"warning"}
        )

    def test_recipients_can_be_users_groups_and_querysets(self):
        editors = Group.objects.create(name="editors")
        self.carol.groups.add(editors)
        dave = self.staff("dave")

        with registered("blog.direct", "Direct"):
            sent = self.notify(
                "blog.direct",
                recipients=[self.anna, editors, User.objects.filter(pk=dave.pk)],
            )

        self.assertEqual(sent, 3)
        self.assertEqual(self.recipients(), ["anna", "carol", "dave"])

    def test_target_limits_recipients_to_viewers(self):
        article = self.article()
        self.staff("blind", "view_note")

        with registered("blog.review", "Review"):
            self.notify(
                "blog.review",
                target=article,
                title="Review %(title)s",
                params={"title": article.title},
            )

        notification = Notification.objects.get(recipient=self.anna)
        self.assertEqual(notification.object_id, str(article.pk))
        self.assertEqual(notification.content_type.model_class(), Article)
        self.assertEqual(notification.get_title(), "Review Hello")
        self.assertNotIn("blind", self.recipients())

    def test_lazy_text_is_stored_as_the_message_id(self):
        with registered("blog.lazy", "Lazy"):
            self.notify(
                "blog.lazy",
                recipients=self.anna,
                title=gettext_lazy("%(count)s comments await moderation"),
                params={"count": 3},
            )

        notification = Notification.objects.get()
        self.assertEqual(notification.title, "%(count)s comments await moderation")
        self.assertEqual(notification.get_title(), "3 comments await moderation")

    def test_params_that_do_not_fit_render_the_text(self):
        notification = Notification(title="%(missing)s", params={"x": 1})

        self.assertEqual(notification.get_title(), "%(missing)s")

    def test_key_bumps_the_unread_notification(self):
        with registered("blog.comments", "Comments"):
            for count in (1, 2):
                self.notify(
                    "blog.comments",
                    recipients=self.anna,
                    title="%(count)s comments",
                    params={"count": count},
                    key="moderation",
                )

        (notification,) = self.inbox(self.anna)
        self.assertEqual(notification.count, 2)
        self.assertEqual(notification.get_title(), "2 comments")

    def test_written_on_commit_and_not_on_rollback(self):
        with registered("blog.tx", "Tx"):
            with self.captureOnCommitCallbacks(execute=False) as callbacks:
                with transaction.atomic():
                    notify("blog.tx", recipients=self.anna)
                self.assertEqual(self.inbox(self.anna), [])

            for callback in callbacks:
                callback()
            self.assertEqual(len(self.inbox(self.anna)), 1)

            with self.captureOnCommitCallbacks(execute=True):
                try:
                    with transaction.atomic():
                        notify("blog.tx", recipients=self.bob)
                        raise RuntimeError
                except RuntimeError:
                    pass

        self.assertEqual(self.inbox(self.bob), [])

    def test_bad_recipients_raise(self):
        with registered("blog.bad", "Bad"):
            with self.assertRaises(TypeError):
                notify("blog.bad", recipients=[self.article()])


class ReadFilterTests(NotificationTestCase):
    def notification(self, **fields):
        return Notification.objects.create(
            recipient=self.anna, event="content.updated", **fields
        )

    def test_revoked_permission_hides_and_restored_shows(self):
        content_type = ContentType.objects.get_for_model(Article)
        notification = self.notification(content_type=content_type, object_id="1")
        custom = self.notification(content_type=None)

        self.assertEqual(
            set(visible_notifications(self.request(self.anna))), {notification, custom}
        )

        self.anna.user_permissions.remove(
            Permission.objects.get(codename="view_article")
        )
        anna = User.objects.get(pk=self.anna.pk)

        self.assertEqual(list(visible_notifications(self.request(anna))), [custom])
        self.assertEqual(unread_count(self.request(anna)), 1)
        self.assertTrue(Notification.objects.filter(pk=notification.pk).exists())

    def test_only_the_users_own(self):
        Notification.objects.create(recipient=self.bob, event="blog.x")

        self.assertEqual(list(visible_notifications(self.request(self.anna))), [])

    def test_tenant_scope(self):
        mine, other = Category.objects.create(name="a"), Category.objects.create(
            name="b"
        )
        plain = self.notification()
        in_mine = self.notification(tenant=str(mine.pk))
        self.notification(tenant=str(other.pk))
        self.anna.is_superuser = True
        self.anna.save()

        with override_settings(CONTENT_STUDIO=TENANTS):
            self.assertEqual(
                list(visible_notifications(self.request(self.anna))), [plain]
            )
            self.assertEqual(
                set(visible_notifications(self.request(self.anna, mine.pk))),
                {plain, in_mine},
            )
            self.assertEqual(
                list(visible_notifications(self.request(self.anna, "nope"))), [plain]
            )

    def test_per_object_override_hides_refused_objects(self):
        content_type = ContentType.objects.get_for_model(Article)
        shown, hidden = self.article("shown"), self.article("hidden")
        deleted = self.notification(content_type=content_type, object_id="999")
        for article in (shown, hidden):
            self.notification(content_type=content_type, object_id=str(article.pk))

        def has_view_permission(studio, request, obj=None):
            return obj is None or obj.title != "hidden"

        with mock.patch.object(
            ArticleAdmin, "has_view_permission", has_view_permission
        ):
            visible = visible_notifications(self.request(self.anna))
            self.assertEqual(
                sorted(n.object_id for n in visible),
                sorted([str(shown.pk), deleted.object_id]),
            )
            self.assertEqual(unread_count(self.request(self.anna)), 2)


class PruneTests(NotificationTestCase):
    def test_prune(self):
        old = timezone.now() - timedelta(days=91)
        read_old = Notification.objects.create(recipient=self.anna, event="x.y")
        unread_old = Notification.objects.create(recipient=self.anna, event="x.y")
        read_new = Notification.objects.create(
            recipient=self.anna, event="x.y", read_at=timezone.now()
        )
        Notification.objects.filter(pk=read_old.pk).update(updated_at=old, read_at=old)
        Notification.objects.filter(pk=unread_old.pk).update(updated_at=old)

        kept, gone = self.article("kept"), self.article("gone")
        self.follow(self.anna, kept)
        self.follow(self.anna, gone)
        gone.delete()

        stale = ContentType.objects.create(app_label="removed", model="thing")
        NotificationSubscription.objects.create(
            user=self.anna, content_type=stale, event="content.updated"
        )
        self.subscribe(self.anna, Article, "updated")

        out = StringIO()
        call_command("content_studio_prune_notifications", stdout=out)

        self.assertEqual(set(Notification.objects.all()), {unread_old, read_new})
        self.assertEqual(
            list(Follow.objects.values_list("object_id", flat=True)), [str(kept.pk)]
        )
        self.assertEqual(NotificationSubscription.objects.count(), 1)
        self.assertIn(
            "Removed 1 notifications, 1 follows and 1 subscriptions", out.getvalue()
        )

    def test_unread_retention_prunes_old_unread_notifications(self):
        now = timezone.now()
        unread_old = Notification.objects.create(recipient=self.anna, event="x.y")
        unread_new = Notification.objects.create(recipient=self.anna, event="x.y")
        read_mid = Notification.objects.create(
            recipient=self.anna, event="x.y", read_at=now
        )
        Notification.objects.filter(pk=unread_old.pk).update(
            updated_at=now - timedelta(days=91)
        )
        Notification.objects.filter(pk=read_mid.pk).update(
            updated_at=now - timedelta(days=31)
        )

        with override_settings(
            CONTENT_STUDIO={
                "ADMIN_SITE": "content_studio.admin.admin_site",
                "NOTIFICATION_RETENTION": 30,
                "NOTIFICATION_UNREAD_RETENTION": 90,
            }
        ):
            call_command("content_studio_prune_notifications", stdout=StringIO())

        self.assertEqual(list(Notification.objects.all()), [unread_new])

    def test_retention_none_keeps_notifications(self):
        old = timezone.now() - timedelta(days=1000)
        Notification.objects.create(recipient=self.anna, event="x.y", read_at=old)
        Notification.objects.update(updated_at=old)

        with override_settings(
            CONTENT_STUDIO={
                "ADMIN_SITE": "content_studio.admin.admin_site",
                "NOTIFICATION_RETENTION": None,
            }
        ):
            call_command("content_studio_prune_notifications", stdout=StringIO())

        self.assertEqual(Notification.objects.count(), 1)


class CheckTests(TestCase):
    def test_e030_reports_a_malformed_retention(self):
        for value, expected in (
            (0, True),
            (2.5, True),
            ("90", True),
            (None, False),
            (30, False),
        ):
            with override_settings(
                CONTENT_STUDIO={
                    "ADMIN_SITE": "content_studio.admin.admin_site",
                    "NOTIFICATION_RETENTION": value,
                }
            ):
                ids = [m.id for m in check_content_studio()]

            self.assertEqual("content_studio.E030" in ids, expected, value)

    def test_e030_reports_a_malformed_unread_retention(self):
        for value, expected in ((0, True), ("90", True), (None, False), (90, False)):
            with override_settings(
                CONTENT_STUDIO={
                    "ADMIN_SITE": "content_studio.admin.admin_site",
                    "NOTIFICATION_UNREAD_RETENTION": value,
                }
            ):
                ids = [m.id for m in check_content_studio()]

            self.assertEqual("content_studio.E030" in ids, expected, value)
