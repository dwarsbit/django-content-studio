"""
Tests for the content_changed signal.

Every change made in the admin is recorded as a LogEntry and as a
Change; a request's changes are sent as one signal once they are
committed, and a rolled back change is never sent.
"""

from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.db import transaction
from django.test import RequestFactory, override_settings

from content_studio.signals import (
    DELETED,
    UPDATED,
    collect_changes,
    content_changed,
    record_change,
)
from tests.test_soft_delete import AuthenticatedTestCase
from tests.testapp.models import Article, Category, Note, Page, Track

ARTICLES = "/api/content/testapp.article"


class SignalTestCase(AuthenticatedTestCase):
    def setUp(self):
        self.user = self.create_user(superuser=True)
        self.client = self.client_for(self.user)
        self.sent = []
        content_changed.connect(self.receiver)
        self.addCleanup(content_changed.disconnect, self.receiver)

    def receiver(self, sender, changes, user, **kwargs):
        self.sent.append((changes, user))

    def request(self, method, *args, **kwargs):
        # The test case runs in a transaction: run the on-commit
        # callbacks like a real commit would.
        with self.captureOnCommitCallbacks(execute=True):
            return getattr(self.client, method)(*args, format="json", **kwargs)

    def actions(self):
        return [[change.action for change in changes] for changes, _ in self.sent]


class EndpointTests(SignalTestCase):
    def test_create_update_and_delete_each_send_one_change(self):
        response = self.request("post", ARTICLES, {"title": "one"})
        pk = response.json()["id"]
        self.request("patch", f"{ARTICLES}/{pk}", {"title": "two"})
        self.request("delete", f"{ARTICLES}/{pk}")

        self.assertEqual(self.actions(), [["created"], ["updated"], ["deleted"]])

        (change,), user = self.sent[0]
        self.assertEqual(user, self.user)
        self.assertEqual(change.model, Article)
        self.assertEqual(change.object_id, str(pk))
        self.assertEqual(change.object_repr, "one")
        self.assertEqual(change.user, self.user)
        self.assertIsNone(change.tenant_id)

    def test_changes_are_logged_with_their_action_flag(self):
        pk = self.request("post", ARTICLES, {"title": "one"}).json()["id"]
        self.request("patch", f"{ARTICLES}/{pk}", {"title": "two"})
        self.request("delete", f"{ARTICLES}/{pk}")

        self.assertEqual(
            list(LogEntry.objects.order_by("pk").values_list("action_flag", flat=True)),
            [ADDITION, CHANGE, DELETION],
        )

    def test_bulk_delete_sends_one_signal_for_the_selection(self):
        articles = [Article.objects.create(title=title) for title in "abc"]

        response = self.request(
            "post",
            f"{ARTICLES}/bulk",
            {"action": "delete", "ids": [article.pk for article in articles]},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.actions(), [["deleted"] * 3])
        self.assertEqual(
            sorted(change.object_id for change in self.sent[0][0]),
            sorted(str(article.pk) for article in articles),
        )

    def test_bulk_delete_logs_the_deleted_pks(self):
        article = Article.objects.create(title="a")

        self.request(
            "post", f"{ARTICLES}/bulk", {"action": "delete", "ids": [article.pk]}
        )

        self.assertEqual(LogEntry.objects.get().object_id, str(article.pk))

    def test_trash_and_restore(self):
        notes = "/api/content/testapp.note"
        note = Note.objects.create(title="one")

        self.request("delete", f"{notes}/{note.pk}")
        self.request("post", f"{notes}/{note.pk}/restore")

        self.assertEqual(self.actions(), [["deleted"], ["restored"]])

    def test_move_sends_reordered(self):
        tracks = "/api/content/testapp.track"
        a, b = (Track.objects.create(title=t, position=i) for i, t in enumerate("ab"))

        self.request("post", f"{tracks}/{a.pk}/move", {"after": b.pk})
        # Already in place: nothing changed, nothing is sent.
        self.request("post", f"{tracks}/{a.pk}/move", {"position": "last"})

        self.assertEqual(self.actions(), [["reordered"]])

    def test_failed_and_read_requests_send_nothing(self):
        self.request("post", ARTICLES, {})
        self.request("get", ARTICLES)

        self.assertEqual(self.sent, [])


class RecordChangeTests(SignalTestCase):
    def setUp(self):
        super().setUp()
        self.http_request = RequestFactory().post("/")
        self.http_request.user = self.user

    def test_a_change_outside_a_batch_is_sent_on_its_own(self):
        article = Article.objects.create(title="a")

        with self.captureOnCommitCallbacks(execute=True):
            record_change(self.http_request, article, UPDATED)
            record_change(self.http_request, article, UPDATED)

        self.assertEqual(self.actions(), [["updated"], ["updated"]])

    def test_a_batch_is_sent_once_after_commit(self):
        article = Article.objects.create(title="a")

        with self.captureOnCommitCallbacks(execute=True):
            with collect_changes(self.http_request):
                record_change(self.http_request, article, UPDATED)
                record_change(self.http_request, article, DELETED)

            self.assertEqual(self.sent, [])

        self.assertEqual(self.actions(), [["updated", "deleted"]])

    def test_rolled_back_changes_are_not_sent(self):
        article = Article.objects.create(title="a")

        with self.captureOnCommitCallbacks(execute=True):
            with collect_changes(self.http_request):
                record_change(self.http_request, article, UPDATED)

                try:
                    with transaction.atomic():
                        record_change(self.http_request, article, DELETED)
                        raise RuntimeError
                except RuntimeError:
                    pass

        self.assertEqual(self.actions(), [["updated"]])
        self.assertEqual(LogEntry.objects.count(), 1)

    def test_an_empty_batch_sends_nothing(self):
        with self.captureOnCommitCallbacks(execute=True):
            with collect_changes(self.http_request):
                pass

        self.assertEqual(self.sent, [])

    def test_the_change_carries_the_tenant(self):
        tenant = Category.objects.create(name="tenant")
        page = Page.objects.create(title="a", slug="a", category=tenant)

        with override_settings(
            CONTENT_STUDIO={"TENANT_MODEL": "tests.testapp.models.Category"}
        ):
            with self.captureOnCommitCallbacks(execute=True):
                record_change(self.http_request, page, UPDATED)

        self.assertEqual(self.sent[0][0][0].tenant_id, tenant.pk)


class CustomBulkActionTests(SignalTestCase):
    def test_a_custom_action_records_its_changes_in_one_batch(self):
        from content_studio.actions import bulk_action
        from tests.testapp.admin import ArticleAdmin

        @bulk_action()
        def archive(self, request, queryset):
            for article in queryset:
                record_change(request, article, "updated", "Archived.")

        articles = [Article.objects.create(title=title) for title in "ab"]
        ArticleAdmin.archive = archive
        self.addCleanup(delattr, ArticleAdmin, "archive")

        response = self.request(
            "post",
            f"{ARTICLES}/bulk",
            {"action": "archive", "ids": [article.pk for article in articles]},
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.actions(), [["updated", "updated"]])
        self.assertEqual(
            set(LogEntry.objects.values_list("change_message", flat=True)),
            {"Archived."},
        )

    def test_an_unknown_action_is_refused(self):
        request = RequestFactory().post("/")
        request.user = self.user

        with self.assertRaises(ValueError):
            record_change(request, Article.objects.create(title="a"), "published")


class FailingReceiverTests(SignalTestCase):
    def test_a_failing_receiver_does_not_fail_the_request(self):
        def broken(**kwargs):
            raise RuntimeError("broken")

        content_changed.connect(broken)
        self.addCleanup(content_changed.disconnect, broken)

        with self.assertLogs("content_studio.signals", "ERROR"):
            response = self.request("post", ARTICLES, {"title": "one"})

        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.actions(), [["created"]])
