"""
Tests for the webhooks admin: the registered studio, the secret shown
once, the Trigger now, Regenerate secret and Retry buttons, and the
read-only delivery log.
"""

import json

from django.contrib.admin.models import LogEntry
from django.contrib.auth.models import Permission, User
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from content_studio.admin import admin_site
from content_studio.signals import ACTION_FLAGS
from content_studio.token_backends.jwt import create_access_token
from content_studio.webhooks.admin import (
    RegenerateSecretButton,
    RetryButton,
    TriggerButton,
    WebhookStudio,
)
from content_studio.webhooks.models import EVENT_OPTIONS, Webhook, WebhookDelivery
from tests.test_webhooks import ALLOW_LOCAL, ReceiverMixin
from tests.testapp.models import Article

WEBHOOKS = "/api/content/content_studio_webhooks.webhook"
DELIVERIES = (
    "/api/inlines/content_studio_webhooks.webhook/"
    "content_studio_webhooks.webhookdelivery"
)


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


def staff_with(*codenames, username="editor"):
    user = User.objects.create_user(username=username, password="x", is_staff=True)
    user.user_permissions.add(*Permission.objects.filter(codename__in=codenames))
    return User.objects.get(pk=user.pk)


def run(client, path, button):
    return client.post(f"{path}/components/{button.component_id}/run")


@override_settings(CONTENT_STUDIO=ALLOW_LOCAL)
class WebhookStudioTests(ReceiverMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_superuser(username="admin", password="x")
        self.client = client_for(self.admin)

    def test_the_app_registers_its_studio(self):
        self.assertIsInstance(admin_site._registry[Webhook], WebhookStudio)

    def test_the_events_are_the_change_actions(self):
        self.assertEqual([event for event, _ in EVENT_OPTIONS], list(ACTION_FLAGS))

    def test_the_secret_is_shown_once_after_creating(self):
        response = self.client.post(
            WEBHOOKS, {"name": "Build", "url": self.url}, format="json"
        )

        self.assertEqual(response.status_code, 201, response.content)
        webhook = Webhook.objects.get()
        data = response.json()
        self.assertEqual(data["__result__"]["value"], webhook.secret)
        self.assertNotIn("secret", data)

        detail = self.client.get(f"{WEBHOOKS}/{webhook.pk}").json()
        self.assertNotIn("secret", detail)
        self.assertNotIn("secret", json.dumps(self.client.get(WEBHOOKS).json()))

    def test_the_secret_cannot_be_written(self):
        webhook = Webhook.objects.create(name="Build", url=self.url)
        secret = webhook.secret

        self.client.patch(f"{WEBHOOKS}/{webhook.pk}", {"secret": "mine"}, format="json")

        webhook.refresh_from_db()
        self.assertEqual(webhook.secret, secret)

    def test_unsafe_urls_are_refused_on_save(self):
        with override_settings(CONTENT_STUDIO={}):
            response = self.client.post(
                WEBHOOKS, {"name": "Build", "url": "http://example.com"}, format="json"
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("url", response.json())

    def test_the_tenant_field_only_shows_with_multi_tenancy(self):
        studio = admin_site._registry[Webhook]

        self.assertNotIn("tenant", studio.get_fields(None))
        self.assertNotIn("secret", studio.get_fields(None))

        with override_settings(
            CONTENT_STUDIO={"TENANT_MODEL": "tests.testapp.models.Category"}
        ):
            self.assertIn("tenant", studio.get_fields(None))

    def test_trigger_now_sends_a_triggered_request(self):
        webhook = Webhook.objects.create(name="Build", url=self.url)

        response = run(self.client, f"{WEBHOOKS}/{webhook.pk}", TriggerButton())

        self.assertEqual(response.status_code, 200)
        self.assertIn("Delivered", response.json()["message"])
        ((_, headers, body),) = self.server.requests
        payload = json.loads(body)
        self.assertEqual(headers["X-Content-Studio-Event"], "webhook.triggered")
        self.assertEqual(payload["event"], "webhook.triggered")
        self.assertEqual(payload["changes"], [])
        self.assertEqual(
            WebhookDelivery.objects.get().status, WebhookDelivery.Status.SUCCESS
        )

    def test_a_failed_trigger_says_it_is_retried(self):
        self.server.status = 503
        webhook = Webhook.objects.create(name="Build", url=self.url)

        response = run(self.client, f"{WEBHOOKS}/{webhook.pk}", TriggerButton())

        self.assertIn("retried later", response.json()["message"])
        self.assertEqual(
            WebhookDelivery.objects.get().status, WebhookDelivery.Status.PENDING
        )

    def test_regenerating_shows_the_new_secret_once(self):
        webhook = Webhook.objects.create(name="Build", url=self.url)
        old = webhook.secret

        response = run(
            self.client, f"{WEBHOOKS}/{webhook.pk}", RegenerateSecretButton()
        )

        webhook.refresh_from_db()
        self.assertNotEqual(webhook.secret, old)
        self.assertEqual(response.json()["value"], webhook.secret)
        self.assertEqual(
            LogEntry.objects.get().change_message, "Regenerated the secret."
        )

    def test_the_buttons_need_change_permission(self):
        webhook = Webhook.objects.create(name="Build", url=self.url)
        viewer = client_for(staff_with("view_webhook"))

        for button in (TriggerButton(), RegenerateSecretButton()):
            response = run(viewer, f"{WEBHOOKS}/{webhook.pk}", button)
            self.assertEqual(response.status_code, 403)

        self.assertEqual(self.server.requests, [])

    def test_configuring_webhooks_triggers_none(self):
        Webhook.objects.create(name="Build", url=self.url)

        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(
                WEBHOOKS, {"name": "Other", "url": self.url}, format="json"
            )

        self.assertFalse(WebhookDelivery.objects.exists())

    def test_content_changes_still_trigger_webhooks(self):
        Webhook.objects.create(name="Build", url=self.url)

        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(
                "/api/content/testapp.article", {"title": "a"}, format="json"
            )

        self.assertEqual(len(self.server.requests), 1)

    def test_the_models_to_choose_are_the_registered_ones(self):
        response = self.client.post(
            f"{WEBHOOKS}/relations/content_types", {"search": ""}, format="json"
        )

        ids = {int(item["id"]) for item in response.json()}
        self.assertIn(ContentType.objects.get_for_model(Article).pk, ids)
        self.assertNotIn(ContentType.objects.get_for_model(Webhook).pk, ids)
        self.assertIn(ContentType.objects.get_for_model(User).pk, ids)
        self.assertNotIn(ContentType.objects.get_for_model(Permission).pk, ids)


@override_settings(CONTENT_STUDIO=ALLOW_LOCAL)
class DeliveryLogTests(ReceiverMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.webhook = Webhook.objects.create(name="Build", url=self.url)
        self.delivery = WebhookDelivery.objects.create(
            webhook=self.webhook,
            payload={"event": "content.changed", "changes": []},
            status=WebhookDelivery.Status.FAILED,
            attempts=5,
            error="The webhook responded with 503.",
        )
        self.client = client_for(
            User.objects.create_superuser(username="admin", password="x")
        )

    def test_the_log_is_read_only(self):
        response = self.client.get(DELIVERIES, {"webhook_id": self.webhook.pk})

        self.assertEqual(response.json()["pagination"]["count"], 1)
        self.assertEqual(
            self.client.post(
                DELIVERIES, {"webhook": self.webhook.pk, "payload": {}}, format="json"
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.delete(f"{DELIVERIES}/{self.delivery.pk}").status_code, 403
        )

    def test_viewing_the_webhook_opens_its_log(self):
        viewer = client_for(staff_with("view_webhook"))
        stranger = client_for(staff_with(username="other"))

        self.assertEqual(
            viewer.get(DELIVERIES, {"webhook_id": self.webhook.pk}).status_code, 200
        )
        self.assertEqual(
            stranger.get(DELIVERIES, {"webhook_id": self.webhook.pk}).status_code,
            403,
        )

    def test_retry_makes_one_more_attempt(self):
        path = f"{DELIVERIES}/{self.delivery.pk}"

        self.assertEqual(
            self.client.get(f"{path}/components/{RetryButton().component_id}").json(),
            {"visible": True},
        )
        response = run(self.client, path, RetryButton())

        self.assertIn("Delivered", response.json()["message"])
        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.status, WebhookDelivery.Status.SUCCESS)
        self.assertEqual(self.delivery.attempts, 6)
        self.assertEqual(
            self.client.get(f"{path}/components/{RetryButton().component_id}").json(),
            {"visible": False},
        )

    def test_a_failed_retry_fails_again(self):
        self.server.status = 500

        response = run(self.client, f"{DELIVERIES}/{self.delivery.pk}", RetryButton())

        self.assertIn("failed", response.json()["message"])
        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.status, WebhookDelivery.Status.FAILED)
        self.assertEqual(self.delivery.attempts, 6)

    def test_retry_needs_change_permission_on_the_webhook(self):
        viewer = client_for(staff_with("view_webhook"))

        response = run(viewer, f"{DELIVERIES}/{self.delivery.pk}", RetryButton())

        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.server.requests, [])
