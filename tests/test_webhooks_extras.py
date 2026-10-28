"""
Tests for the webhooks dashboard widget and the deploy button.
"""

import json
from datetime import timedelta

from django.contrib.auth.models import Permission, User
from django.test import RequestFactory, TestCase, override_settings
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.test import APIClient

from content_studio.admin import admin_site
from content_studio.token_backends.jwt import create_access_token
from content_studio.webhooks.dashboard import WebhookDeliveriesWidget
from content_studio.webhooks.extensions import DeployButton
from content_studio.webhooks.models import Webhook, WebhookDelivery
from tests.test_webhooks import ALLOW_LOCAL, ReceiverMixin
from tests.testapp.models import Category


def staff_with(*codenames, username="editor"):
    user = User.objects.create_user(username=username, password="x", is_staff=True)
    user.user_permissions.add(*Permission.objects.filter(codename__in=codenames))
    return User.objects.get(pk=user.pk)


def request_for(user, **headers):
    request = Request(RequestFactory().post("/", headers=headers))
    request.user = user
    return request


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


class WidgetTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username="admin", password="x")

    def data(self, user):
        serializer = WebhookDeliveriesWidget().get_data(request_for(user))
        serializer.is_valid(raise_exception=True)
        return serializer.data

    def test_each_webhook_shows_its_latest_delivery(self):
        never = Webhook.objects.create(name="A never", url="https://a.example.com")
        ok = Webhook.objects.create(name="B ok", url="https://b.example.com")
        failed = Webhook.objects.create(
            name="C failed", url="https://c.example.com", is_active=False
        )
        retrying = Webhook.objects.create(
            name="D retrying", url="https://d.example.com"
        )
        old = WebhookDelivery.objects.create(
            webhook=ok, payload={}, status=WebhookDelivery.Status.FAILED
        )
        WebhookDelivery.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=1)
        )
        WebhookDelivery.objects.create(
            webhook=ok, payload={}, status=WebhookDelivery.Status.SUCCESS
        )
        WebhookDelivery.objects.create(
            webhook=failed,
            payload={},
            status=WebhookDelivery.Status.FAILED,
            error="The webhook responded with 503.",
        )
        next_attempt = timezone.now() + timedelta(minutes=4)
        WebhookDelivery.objects.create(
            webhook=retrying, payload={}, attempts=2, next_attempt_at=next_attempt
        )

        data = self.data(self.admin)
        tasks = {task["title"]: task for task in data["tasks"]}

        self.assertEqual(data["title"], "Webhooks")
        self.assertEqual(list(tasks), ["A never", "B ok", "C failed", "D retrying"])
        self.assertEqual(tasks["A never"]["status"], "SCHEDULED")
        self.assertIsNone(tasks["A never"]["last_run_at"])
        self.assertEqual(tasks["B ok"]["status"], "SUCCESS")
        self.assertEqual(tasks["B ok"]["description"], "https://b.example.com")
        self.assertEqual(tasks["C failed"]["status"], "FAILURE")
        self.assertEqual(tasks["C failed"]["description"], "Paused")
        self.assertEqual(
            tasks["C failed"]["error_message"], "The webhook responded with 503."
        )
        self.assertEqual(tasks["D retrying"]["status"], "SCHEDULED")
        self.assertIsNotNone(tasks["D retrying"]["next_run_at"])

    def test_editors_who_may_not_view_webhooks_see_none(self):
        Webhook.objects.create(name="Build", url="https://example.com")

        self.assertEqual(self.data(staff_with())["tasks"], [])
        self.assertEqual(
            len(self.data(staff_with("view_webhook", username="v"))["tasks"]), 1
        )

    def test_the_title_and_description_can_be_set(self):
        widget = WebhookDeliveriesWidget(title="Builds", description="Netlify")
        serializer = widget.get_data(request_for(self.admin))
        serializer.is_valid(raise_exception=True)

        self.assertEqual(serializer.data["title"], "Builds")
        self.assertEqual(serializer.data["description"], "Netlify")


@override_settings(CONTENT_STUDIO=ALLOW_LOCAL)
class DeployButtonTests(ReceiverMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_superuser(username="admin", password="x")

    def deploy(self, button, user=None, **headers):
        with self.captureOnCommitCallbacks(execute=True):
            return button.run(request_for(user or self.admin, **headers))

    def test_deploy_triggers_every_active_webhook(self):
        Webhook.objects.create(name="Blog", url=self.url)
        Webhook.objects.create(name="Shop", url=self.url)
        Webhook.objects.create(name="Off", url=self.url, is_active=False)

        result = self.deploy(DeployButton())

        self.assertIn("Triggered 2 webhooks", result.message)
        events = {json.loads(body)["event"] for _, _, body in self.server.requests}
        self.assertEqual(len(self.server.requests), 2)
        self.assertEqual(events, {"webhook.triggered"})

    def test_deploy_can_name_its_webhooks(self):
        Webhook.objects.create(name="Blog", url=self.url)
        Webhook.objects.create(name="Shop", url=self.url)

        result = self.deploy(DeployButton(webhooks=["Shop"]))

        self.assertIn("Triggered 1 webhook.", result.message)
        self.assertEqual(
            [json.loads(body)["webhook"] for _, _, body in self.server.requests],
            ["Shop"],
        )

    def test_without_webhooks_nothing_is_sent(self):
        result = self.deploy(DeployButton())

        self.assertEqual(
            str(result.message), "There are no active webhooks to trigger."
        )
        self.assertEqual(self.server.requests, [])

    def test_with_tenants_the_current_tenants_and_global_webhooks_fire(self):
        mine, other = (Category.objects.create(name=name) for name in "ab")
        Webhook.objects.create(name="Global", url=self.url)
        Webhook.objects.create(name="Mine", url=self.url, tenant=str(mine.pk))
        Webhook.objects.create(name="Other", url=self.url, tenant=str(other.pk))

        with override_settings(
            CONTENT_STUDIO={
                **ALLOW_LOCAL,
                "TENANT_MODEL": "tests.testapp.models.Category",
            }
        ):
            self.deploy(DeployButton(), **{"x-dcs-tenant": str(mine.pk)})
            fired = sorted(
                json.loads(body)["webhook"] for _, _, body in self.server.requests
            )
            self.assertEqual(fired, ["Global", "Mine"])

            self.server.requests = []
            self.deploy(DeployButton())
            fired = [json.loads(body)["webhook"] for _, _, body in self.server.requests]
            self.assertEqual(fired, ["Global"])

    def test_only_editors_who_may_change_webhooks_see_it(self):
        button = DeployButton()

        self.assertTrue(button.is_visible(request_for(self.admin)))
        self.assertTrue(button.is_visible(request_for(staff_with("change_webhook"))))
        self.assertFalse(
            button.is_visible(request_for(staff_with("view_webhook", username="v")))
        )

    def test_it_runs_from_the_main_menu(self):
        Webhook.objects.create(name="Blog", url=self.url)
        button = DeployButton(label="Rebuild", confirm="Rebuild the blog?")
        viewer = client_for(staff_with("view_webhook"))
        original = getattr(admin_site, "extensions", None)
        admin_site.extensions = [button]
        self.addCleanup(setattr, admin_site, "extensions", original)
        run = f"/api/extensions/{button.extension_id}/run"

        self.assertEqual(viewer.post(run).status_code, 403)

        with self.captureOnCommitCallbacks(execute=True):
            response = client_for(self.admin).post(run)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.server.requests), 1)
        self.assertEqual(button.serialize()["config"]["confirm"], "Rebuild the blog?")

    def test_buttons_with_other_webhooks_get_other_ids(self):
        self.assertNotEqual(
            DeployButton(webhooks=["Blog"]).extension_id,
            DeployButton(webhooks=["Shop"]).extension_id,
        )
        self.assertEqual(DeployButton().extension_id, DeployButton().extension_id)
