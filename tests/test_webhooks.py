"""
Tests for the webhooks app: matching, payloads, signed delivery, the
address checks, retries and the delivery command.

Deliveries go to a real HTTP server on 127.0.0.1, which the tests allow
through WEBHOOK_ALLOWED_HOSTS.
"""

import hashlib
import hmac
import json
import threading
from importlib.util import find_spec
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import StringIO
from unittest import skipUnless

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from content_studio.signals import Change
from content_studio.webhooks.delivery import (
    backoff,
    deliver,
    deliver_due,
    prune_deliveries,
    sign,
)
from content_studio.webhooks.models import Webhook, WebhookDelivery
from tests.test_signals import SignalTestCase
from tests.testapp.models import Article, Category, Note

ALLOW_LOCAL = {"WEBHOOK_ALLOWED_HOSTS": ["127.0.0.1"]}
DEFERRED_TASKS = {"default": {"BACKEND": "django.tasks.backends.dummy.DummyBackend"}}


class Receiver(BaseHTTPRequestHandler):
    def do_POST(self):
        server = self.server
        body = self.rfile.read(int(self.headers["Content-Length"]))
        server.requests.append((self.path, dict(self.headers), body))
        self.send_response(server.status)
        if server.location:
            self.send_header("Location", server.location)
        self.end_headers()
        self.wfile.write(b"x" * 2000)

    def log_message(self, *args):
        pass


class ReceiverMixin:
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Receiver)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/hook?site=blog"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        super().tearDownClass()

    def setUp(self):
        super().setUp()
        self.server.requests = []
        self.server.status = 200
        self.server.location = None


def change(model=Article, action="updated", tenant_id=None):
    return Change(
        action=action,
        model=model,
        object_id="1",
        object_repr="one",
        tenant_id=tenant_id,
        user=None,
        timestamp=timezone.now(),
    )


class MatchingTests(TestCase):
    def matches(self, webhook, change):
        ids = {content_type.pk for content_type in webhook.content_types.all()}
        return webhook.matches(change, ids)

    def test_an_empty_webhook_matches_everything(self):
        webhook = Webhook.objects.create(name="all", url="https://example.com")

        self.assertTrue(self.matches(webhook, change()))
        self.assertTrue(self.matches(webhook, change(Note, "deleted", 3)))

    def test_events_models_and_tenant_narrow_it_down(self):
        webhook = Webhook.objects.create(
            name="some", url="https://example.com", events=["deleted"], tenant="3"
        )
        webhook.content_types.set([ContentType.objects.get_for_model(Note)])

        self.assertTrue(self.matches(webhook, change(Note, "deleted", 3)))
        self.assertFalse(self.matches(webhook, change(Note, "updated", 3)))
        self.assertFalse(self.matches(webhook, change(Article, "deleted", 3)))
        self.assertFalse(self.matches(webhook, change(Note, "deleted", 4)))
        self.assertFalse(self.matches(webhook, change(Note, "deleted", None)))

    def test_unknown_events_and_unsafe_urls_are_invalid(self):
        webhook = Webhook(name="x", url="https://example.com", events=["published"])
        with self.assertRaises(ValidationError):
            webhook.full_clean()

        webhook = Webhook(name="x", url="http://example.com")
        with self.assertRaises(ValidationError) as error:
            webhook.full_clean()
        self.assertIn("url", error.exception.message_dict)

        with override_settings(CONTENT_STUDIO=ALLOW_LOCAL):
            Webhook(name="x", url="http://127.0.0.1/").full_clean()

    def test_a_secret_is_generated(self):
        one = Webhook.objects.create(name="one", url="https://example.com")
        two = Webhook.objects.create(name="two", url="https://example.com")

        self.assertEqual(len(one.secret), 64)
        self.assertNotEqual(one.secret, two.secret)


@override_settings(CONTENT_STUDIO=ALLOW_LOCAL)
class DeliveryTests(ReceiverMixin, SignalTestCase):
    def setUp(self):
        super().setUp()
        self.webhook = Webhook.objects.create(name="build", url=self.url)

    def test_a_change_in_the_admin_is_delivered_signed(self):
        response = self.request(
            "post", "/api/content/testapp.article", {"title": "one"}
        )

        ((path, headers, body),) = self.server.requests
        delivery = WebhookDelivery.objects.get()
        payload = json.loads(body)

        self.assertEqual(path, "/hook?site=blog")
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual(headers["X-Content-Studio-Event"], "content.changed")
        self.assertEqual(headers["X-Content-Studio-Delivery"], str(delivery.pk))
        self.assertEqual(payload["version"], 1)
        self.assertEqual(payload["delivery"], str(delivery.pk))
        self.assertEqual(payload["webhook"], "build")
        self.assertEqual(
            [
                {key: item[key] for key in ("action", "model", "id", "label")}
                for item in payload["changes"]
            ],
            [
                {
                    "action": "created",
                    "model": "testapp.article",
                    "id": str(response.json()["id"]),
                    "label": "one",
                }
            ],
        )

        timestamp, signature = (
            part.split("=", 1)[1]
            for part in headers["X-Content-Studio-Signature"].split(",")
        )
        expected = hmac.new(
            self.webhook.secret.encode(),
            timestamp.encode() + b"." + body,
            hashlib.sha256,
        ).hexdigest()
        self.assertEqual(signature, expected)

        self.assertEqual(delivery.status, WebhookDelivery.Status.SUCCESS)
        self.assertEqual(delivery.attempts, 1)
        self.assertEqual(delivery.response_status, 200)
        self.assertEqual(len(delivery.response_body), 1000)
        self.assertIsNotNone(delivery.delivered_at)

    def test_a_bulk_action_is_one_delivery(self):
        articles = [Article.objects.create(title=title) for title in "abc"]

        self.request(
            "post",
            "/api/content/testapp.article/bulk",
            {"action": "delete", "ids": [article.pk for article in articles]},
        )

        self.assertEqual(len(self.server.requests), 1)
        payload = json.loads(self.server.requests[0][2])
        self.assertEqual(len(payload["changes"]), 3)

    def test_only_matching_active_webhooks_receive_the_changes(self):
        self.webhook.events = ["deleted"]
        self.webhook.save()
        Webhook.objects.create(name="off", url=self.url, is_active=False)

        self.request("post", "/api/content/testapp.article", {"title": "one"})

        self.assertEqual(self.server.requests, [])
        self.assertFalse(WebhookDelivery.objects.exists())

    def test_a_failed_attempt_is_retried_later(self):
        self.server.status = 503

        self.request("post", "/api/content/testapp.article", {"title": "one"})

        delivery = WebhookDelivery.objects.get()
        self.assertEqual(delivery.status, WebhookDelivery.Status.PENDING)
        self.assertEqual(delivery.attempts, 1)
        self.assertEqual(delivery.response_status, 503)
        self.assertIn("503", delivery.error)
        self.assertGreater(delivery.next_attempt_at, timezone.now())

        # Not due yet: the command leaves it alone.
        self.assertEqual(deliver_due(), 0)

        WebhookDelivery.objects.update(next_attempt_at=timezone.now())
        self.server.status = 204
        self.assertEqual(deliver_due(), 1)

        delivery.refresh_from_db()
        self.assertEqual(delivery.status, WebhookDelivery.Status.SUCCESS)
        self.assertEqual(delivery.attempts, 2)
        self.assertEqual(delivery.error, "")

    def test_a_delivery_fails_after_the_last_attempt(self):
        self.server.status = 500
        delivery = WebhookDelivery.objects.create(webhook=self.webhook, payload={})

        with override_settings(
            CONTENT_STUDIO={**ALLOW_LOCAL, "WEBHOOK_MAX_ATTEMPTS": 2}
        ):
            deliver(delivery.pk)
            WebhookDelivery.objects.update(next_attempt_at=timezone.now())
            deliver(delivery.pk)

        delivery.refresh_from_db()
        self.assertEqual(delivery.status, WebhookDelivery.Status.FAILED)
        self.assertEqual(delivery.attempts, 2)
        self.assertIsNone(delivery.next_attempt_at)
        # A failed delivery is not attempted again.
        self.assertFalse(deliver(delivery.pk))
        self.assertEqual(len(self.server.requests), 2)

    def test_redirects_are_not_followed(self):
        self.server.status = 302
        self.server.location = "http://127.0.0.1:1/elsewhere"
        delivery = WebhookDelivery.objects.create(webhook=self.webhook, payload={})

        deliver(delivery.pk)

        delivery.refresh_from_db()
        self.assertEqual(delivery.response_status, 302)
        self.assertEqual(delivery.status, WebhookDelivery.Status.PENDING)
        self.assertEqual(len(self.server.requests), 1)

    def test_a_stale_attempt_is_not_sent_twice(self):
        delivery = WebhookDelivery.objects.create(webhook=self.webhook, payload={})
        # Another worker claimed the attempt in the meantime.
        WebhookDelivery.objects.update(attempts=1)

        self.assertTrue(deliver(delivery.pk))
        self.assertEqual(len(self.server.requests), 1)

        delivery.refresh_from_db()
        self.assertEqual(delivery.attempts, 2)

    @skipUnless(find_spec("django.tasks"), "Django 6.0+ runs webhooks as tasks")
    def test_the_command_sends_what_a_deferred_task_backend_left(self):
        with override_settings(TASKS=DEFERRED_TASKS):
            self.request("post", "/api/content/testapp.article", {"title": "one"})

        self.assertEqual(self.server.requests, [])

        out = StringIO()
        call_command("content_studio_deliver_webhooks", stdout=out)

        self.assertIn("Attempted 1 webhook deliveries", out.getvalue())
        self.assertEqual(len(self.server.requests), 1)
        self.assertEqual(
            WebhookDelivery.objects.get().status, WebhookDelivery.Status.SUCCESS
        )

    def test_tenant_webhooks_only_receive_their_tenant(self):
        from content_studio.signals import collect_changes, record_change
        from django.test import RequestFactory
        from tests.testapp.models import Page

        mine, other = (Category.objects.create(name=name) for name in "ab")
        self.webhook.tenant = str(mine.pk)
        self.webhook.save()
        request = RequestFactory().post("/")
        request.user = self.user

        with override_settings(
            CONTENT_STUDIO={
                **ALLOW_LOCAL,
                "TENANT_MODEL": "tests.testapp.models.Category",
            }
        ):
            with self.captureOnCommitCallbacks(execute=True):
                with collect_changes(request):
                    for tenant in (mine, other):
                        page = Page.objects.create(
                            title=tenant.name, slug=tenant.name, category=tenant
                        )
                        record_change(request, page, "created")

        payload = json.loads(self.server.requests[0][2])
        self.assertEqual(
            [(item["label"], item["tenant"]) for item in payload["changes"]],
            [("a", str(mine.pk))],
        )


class AddressTests(ReceiverMixin, TestCase):
    def attempt(self, url):
        webhook = Webhook.objects.create(name="x", url=url)
        delivery = WebhookDelivery.objects.create(webhook=webhook, payload={})
        deliver(delivery.pk)
        delivery.refresh_from_db()
        return delivery

    def test_private_addresses_are_refused(self):
        with override_settings(DEBUG=True):
            delivery = self.attempt(self.url)

        self.assertIn("non-public address", delivery.error)
        self.assertEqual(self.server.requests, [])

    def test_hostnames_are_checked_on_the_address_they_resolve_to(self):
        port = self.server.server_port

        with override_settings(DEBUG=True):
            delivery = self.attempt(f"http://localhost:{port}/")

        self.assertIn("non-public address", delivery.error)
        self.assertEqual(self.server.requests, [])

    def test_plain_http_needs_debug_or_an_allowed_host(self):
        delivery = self.attempt("http://example.com/")

        self.assertEqual(delivery.error, "The URL must use https.")


class BackoffTests(TestCase):
    def test_the_wait_grows_to_a_maximum(self):
        self.assertEqual(
            [backoff(attempt) for attempt in (1, 2, 3, 4)],
            [timedelta(minutes=minutes) for minutes in (1, 4, 16, 64)],
        )
        self.assertEqual(backoff(10), timedelta(hours=6))

    def test_the_signature_covers_the_timestamp_and_body(self):
        self.assertNotEqual(sign("s", 1, b"{}"), sign("s", 2, b"{}"))
        self.assertTrue(sign("s", 1, b"{}").startswith("t=1,v1="))


class PruneTests(TestCase):
    def test_old_finished_deliveries_are_removed(self):
        webhook = Webhook.objects.create(name="x", url="https://example.com")
        Status = WebhookDelivery.Status
        old = timezone.now() - timedelta(days=31)
        deliveries = {
            (status, age): WebhookDelivery.objects.create(
                webhook=webhook, payload={}, status=status
            )
            for status in (Status.SUCCESS, Status.FAILED, Status.PENDING)
            for age in ("old", "new")
        }
        WebhookDelivery.objects.filter(
            pk__in=[d.pk for (_, age), d in deliveries.items() if age == "old"]
        ).update(created_at=old)

        self.assertEqual(prune_deliveries(), 2)
        self.assertEqual(
            set(WebhookDelivery.objects.values_list("pk", flat=True)),
            {
                d.pk
                for (status, age), d in deliveries.items()
                if age == "new" or status == Status.PENDING
            },
        )

    def test_without_retention_everything_is_kept(self):
        webhook = Webhook.objects.create(name="x", url="https://example.com")
        WebhookDelivery.objects.create(
            webhook=webhook, payload={}, status=WebhookDelivery.Status.SUCCESS
        )
        WebhookDelivery.objects.update(created_at=timezone.now() - timedelta(days=999))

        with override_settings(CONTENT_STUDIO={"WEBHOOK_DELIVERY_RETENTION": None}):
            self.assertEqual(prune_deliveries(), 0)

        self.assertEqual(WebhookDelivery.objects.count(), 1)

    def test_the_command_prunes(self):
        out = StringIO()
        call_command("content_studio_deliver_webhooks", stdout=out)

        self.assertIn("removed 0 old deliveries", out.getvalue())
