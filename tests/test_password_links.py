"""
Tests for set-password links: the invite a user created in the admin
gets, the link an admin sends an existing user, and the page that sets
the password with one.
"""

import re
from unittest import mock

from django.contrib.admin.models import LogEntry
from django.contrib.auth import models as auth_models
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from content_studio.password_links import expiry_text, make_link
from content_studio.serializers import ModelSerializer
from content_studio.settings import cs_settings
from content_studio.token_backends.jwt import create_access_token

User = auth_models.User

LINK = re.compile(r"http://testserver/set-password\?uid=([^&\s]+)&token=(\S+)")


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


def staff(username, *permissions, **kwargs):
    user = User.objects.create_user(
        username=username, password="Staff-Secret-42", is_staff=True, **kwargs
    )
    user.user_permissions.set(
        auth_models.Permission.objects.filter(codename__in=permissions)
    )
    return user


def link_in(message):
    match = LINK.search(message.body)
    assert match, message.body
    return {"uid": match.group(1), "token": match.group(2)}


class LinkTestCase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin",
            password="Admin-Secret-42",
            email="admin@example.com",
            first_name="Leon",
        )
        self.client = client_for(self.admin)

    def create(self, **data):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                "/api/content/auth.user",
                {"is_staff": True, "is_active": True, **data},
                format="json",
            )

    def send(self, user, client=None):
        with self.captureOnCommitCallbacks(execute=True):
            return (client or self.client).post(
                f"/api/content/auth.user/{user.pk}/password-link"
            )


class InviteTests(LinkTestCase):
    def test_creating_a_user_sends_an_invite(self):
        response = self.create(username="maya", email="maya@example.com")

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(
            response.json()["__result__"]["message"],
            "Invite sent to maya@example.com.",
        )
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["maya@example.com"])
        self.assertIn("invited", message.subject)
        self.assertIn("Leon invited you", message.body)
        self.assertIn("Your username is maya.", message.body)
        self.assertIn("3 days", message.body)
        link_in(message)

    def test_new_user_has_no_password(self):
        self.create(username="maya", email="maya@example.com")

        user = User.objects.get(username="maya")
        self.assertFalse(user.has_usable_password())

    def test_email_is_required(self):
        response = self.create(username="maya")

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json())
        self.assertFalse(User.objects.filter(username="maya").exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_no_invite_for_users_who_cannot_log_in(self):
        response = self.create(
            username="maya", email="maya@example.com", is_staff=False
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("No invite was sent", response.json()["__result__"]["message"])
        self.assertEqual(len(mail.outbox), 0)

    def test_studio_created_result_wins(self):
        studio = cs_settings.ADMIN_SITE._registry[User]

        with mock.patch.object(
            studio, "get_created_result", lambda request, obj: "Custom."
        ):
            response = self.create(username="maya", email="maya@example.com")

        self.assertEqual(response.json()["__result__"]["message"], "Custom.")
        self.assertEqual(len(mail.outbox), 1)

    def test_no_invites_without_password_login(self):
        with mock.patch("content_studio.users.uses_password_login", return_value=False):
            response = self.create(username="maya")

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("__result__", response.json())
        self.assertEqual(len(mail.outbox), 0)

    def test_new_users_are_staff_by_default(self):
        fields = ModelSerializer(User).get_fields()

        self.assertIs(fields["is_staff"]["default"], True)
        self.assertIs(fields["is_active"]["default"], True)

    def test_other_models_keep_their_defaults(self):
        from tests.testapp.models import Category

        response = self.client.post(
            "/api/content/testapp.category", {"name": "News"}, format="json"
        )

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("__result__", response.json())

    @override_settings(PASSWORD_RESET_TIMEOUT=7200)
    def test_mail_says_when_the_link_expires(self):
        self.create(username="maya", email="maya@example.com")

        self.assertIn("2 hours", mail.outbox[0].body)

    def test_expiry_text(self):
        self.assertEqual(expiry_text(259200), "3 days")
        self.assertEqual(expiry_text(86400), "1 day")
        self.assertEqual(expiry_text(3600), "1 hour")
        self.assertEqual(expiry_text(60), "1 hour")

    @mock.patch.object(cs_settings, "ADMIN_URL", "https://example.com/studio")
    def test_links_use_admin_url(self):
        user = staff("maya", email="maya@example.com")

        self.assertTrue(
            make_link(user).startswith("https://example.com/studio/set-password?uid=")
        )


class SendLinkTests(LinkTestCase):
    def setUp(self):
        super().setUp()
        self.user = staff("maya", email="maya@example.com")

    def test_sends_a_reset_link(self):
        self.user.last_login = "2026-11-01T10:00:00Z"
        self.user.save()

        response = self.send(self.user)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {"kind": "reset", "email": "maya@example.com"}
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("new password", mail.outbox[0].subject)
        link_in(mail.outbox[0])
        entry = LogEntry.objects.get(object_id=str(self.user.pk))
        self.assertEqual(entry.change_message, "Sent a password link.")

    def test_resends_an_invite_to_who_never_logged_in(self):
        response = self.send(self.user)

        self.assertEqual(response.json()["kind"], "invite")
        self.assertIn("invited", mail.outbox[0].subject)
        self.assertEqual(
            LogEntry.objects.get(object_id=str(self.user.pk)).change_message,
            "Sent an invite.",
        )

    def test_requires_change_permission(self):
        viewer = staff("viewer", "view_user")

        response = self.send(self.user, client_for(viewer))

        self.assertEqual(response.status_code, 403)
        self.assertEqual(len(mail.outbox), 0)

    def test_staff_cannot_send_one_to_a_superuser(self):
        editor = staff("editor", "view_user", "change_user")

        response = self.send(self.admin, client_for(editor))

        self.assertEqual(response.status_code, 403)
        self.assertEqual(len(mail.outbox), 0)

    def test_not_to_the_own_account(self):
        response = self.send(self.admin)

        self.assertEqual(response.status_code, 403)

    def test_not_without_an_email_address(self):
        self.user.email = ""
        self.user.save()

        self.assertEqual(self.send(self.user).status_code, 403)

    def test_not_to_users_who_cannot_log_in(self):
        self.user.is_staff = False
        self.user.save()

        self.assertEqual(self.send(self.user).status_code, 403)

    def test_only_on_the_user_model(self):
        from tests.testapp.models import Category

        category = Category.objects.create(name="News")

        response = self.client.post(
            f"/api/content/testapp.category/{category.pk}/password-link"
        )

        self.assertEqual(response.status_code, 404)

    def test_edit_page_offers_it(self):
        info = self.client.get(f"/api/content/auth.user/{self.user.pk}").json()[
            "__user__"
        ]

        self.assertEqual(
            info,
            {
                "can_set_password": True,
                "can_send_password_link": True,
                "invited": True,
            },
        )

        self.user.email = ""
        self.user.save()
        info = self.client.get(f"/api/content/auth.user/{self.user.pk}").json()[
            "__user__"
        ]
        self.assertFalse(info["can_send_password_link"])


class SetPasswordPageTests(LinkTestCase):
    def setUp(self):
        super().setUp()
        self.user = staff("maya", email="maya@example.com", first_name="Maya")
        self.send(self.user)
        self.link = link_in(mail.outbox[0])
        self.anonymous = APIClient()

    def test_check_names_the_user(self):
        response = self.anonymous.post(
            "/api/set-password/check", self.link, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {"username": "maya", "name": "Maya", "invite": True}
        )

    def test_sets_the_password_and_logs_in(self):
        response = self.anonymous.post(
            "/api/set-password",
            {**self.link, "password": "Lantern-Secret-42"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn("access", response.json())
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Lantern-Secret-42"))
        self.assertIsNotNone(self.user.last_login)

    def test_link_works_once(self):
        self.anonymous.post(
            "/api/set-password",
            {**self.link, "password": "Lantern-Secret-42"},
            format="json",
        )

        response = self.anonymous.post(
            "/api/set-password",
            {**self.link, "password": "Other-Secret-42"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Lantern-Secret-42"))

    def test_validators_apply(self):
        response = self.anonymous.post(
            "/api/set-password", {**self.link, "password": "maya"}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.json())
        # The link still works after a refused password.
        self.assertEqual(
            self.anonymous.post(
                "/api/set-password/check", self.link, format="json"
            ).status_code,
            200,
        )

    def test_bad_links_are_refused(self):
        for data in (
            {**self.link, "token": "abc-def"},
            {**self.link, "uid": "MTIzNDU"},
            {"uid": "!!", "token": "x"},
            {"uid": None, "token": None},
            {},
        ):
            for url in ("/api/set-password/check", "/api/set-password"):
                response = self.anonymous.post(
                    url, {**data, "password": "Lantern-Secret-42"}, format="json"
                )
                self.assertEqual(response.status_code, 400, (url, data))

    def test_link_stops_working_when_the_user_cannot_log_in(self):
        self.user.is_active = False
        self.user.save()

        response = self.anonymous.post(
            "/api/set-password/check", self.link, format="json"
        )

        self.assertEqual(response.status_code, 400)

    def test_link_stops_working_when_the_email_changes(self):
        self.user.email = "maya@example.org"
        self.user.save()

        response = self.anonymous.post(
            "/api/set-password/check", self.link, format="json"
        )

        self.assertEqual(response.status_code, 400)

    @override_settings(PASSWORD_RESET_TIMEOUT=60)
    def test_expired_links_are_refused(self):
        from datetime import datetime, timedelta

        from django.contrib.auth.tokens import default_token_generator

        later = datetime.now() + timedelta(minutes=5)

        with mock.patch.object(default_token_generator, "_now", return_value=later):
            response = self.anonymous.post(
                "/api/set-password/check", self.link, format="json"
            )

        self.assertEqual(response.status_code, 400)


class TranslatedMailTests(LinkTestCase):
    def test_invite_in_the_senders_language(self):
        from django.utils import translation

        with translation.override("nl"):
            self.create(username="maya", email="maya@example.com")

        message = mail.outbox[0]
        self.assertIn("Je bent uitgenodigd", message.subject)
        self.assertIn("Leon heeft je uitgenodigd", message.body)
        self.assertIn("3 dagen", message.body)
        link_in(message)

    def test_password_link_in_the_senders_language(self):
        from django.utils import translation

        user = staff("maya", email="maya@example.com")
        user.last_login = "2026-11-01T10:00:00Z"
        user.save()

        with translation.override("nl"):
            self.send(user)

        message = mail.outbox[0]
        self.assertIn("nieuw wachtwoord", message.subject)
        self.assertIn("Verwachtte je deze e-mail niet", message.body)
