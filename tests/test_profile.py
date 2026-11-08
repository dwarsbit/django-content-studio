"""
Tests for the profile page endpoints: the signed-in user's details and
profile fields, the activity overview, the recent content list, saving
the profile and changing the password.
"""

from datetime import timedelta
from unittest import mock

from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib.auth import models as auth_models
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from content_studio.checks import profile_field_errors
from content_studio.form import Field
from content_studio.settings import cs_settings
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.models import Article, Category


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


def log(obj, flag, user, when=None):
    entry = LogEntry.objects.create(
        user=user,
        action_flag=flag,
        content_type=ContentType.objects.get_for_model(obj),
        object_id=str(obj.pk),
        object_repr=str(obj),
        change_message="",
    )
    if when is not None:
        LogEntry.objects.filter(pk=entry.pk).update(action_time=when)
    return entry


def profile_fields(value):
    return mock.patch.object(cs_settings.ADMIN_SITE, "profile_fields", value)


class ProfileTestCase(TestCase):
    def setUp(self):
        self.user = auth_models.User.objects.create_user(
            username="maya",
            password="old-Secret-42",
            first_name="Maya",
            last_name="Lindqvist",
            email="maya@example.com",
            is_staff=True,
        )
        self.user.user_permissions.add(
            auth_models.Permission.objects.get(codename="view_article")
        )
        self.client = client_for(self.user)


class ProfileDetailsTests(ProfileTestCase):
    def test_profile_describes_the_user(self):
        group = auth_models.Group.objects.create(name="Editors")
        self.user.groups.add(group)

        data = self.client.get("/api/profile").json()

        self.assertEqual(data["user"]["username"], "maya")
        self.assertEqual(data["user"]["name"], "Maya Lindqvist")
        self.assertEqual(data["user"]["email"], "maya@example.com")
        self.assertEqual(data["user"]["groups"], ["Editors"])
        self.assertFalse(data["user"]["is_superuser"])
        self.assertTrue(data["password"])

    def test_default_fields_are_the_names_and_the_email(self):
        data = self.client.get("/api/profile").json()

        self.assertEqual(
            [field["name"] for field in data["fields"]],
            ["first_name", "last_name", "email"],
        )
        self.assertEqual(data["values"]["first_name"], "Maya")
        self.assertNotIn("password", data["values"])

    def test_requires_staff(self):
        self.user.is_staff = False
        self.user.save()

        response = APIClient().get("/api/profile")

        self.assertIn(response.status_code, (401, 403))

    def test_no_password_change_without_a_usable_password(self):
        self.user.set_unusable_password()
        self.user.save()

        data = client_for(self.user).get("/api/profile").json()

        self.assertFalse(data["password"])


class ProfileSaveTests(ProfileTestCase):
    def test_saves_the_profile_fields(self):
        response = self.client.patch(
            "/api/profile", {"first_name": "Mia"}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["values"]["first_name"], "Mia")
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Mia")

    def test_needs_no_permission_on_the_user_model(self):
        self.assertFalse(self.user.has_perm("auth.change_user"))

        response = self.client.patch("/api/profile", {"last_name": "L."}, format="json")

        self.assertEqual(response.status_code, 200)

    def test_ignores_fields_outside_the_profile(self):
        response = self.client.patch(
            "/api/profile",
            {"is_superuser": True, "is_staff": False, "username": "root"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_superuser)
        self.assertTrue(self.user.is_staff)
        self.assertEqual(self.user.username, "maya")

    def test_protected_fields_stay_read_only_even_when_configured(self):
        with profile_fields(["first_name", "is_superuser"]):
            data = self.client.get("/api/profile").json()
            response = self.client.patch(
                "/api/profile", {"is_superuser": True}, format="json"
            )

        readonly = {f["name"]: f["readonly"] for f in data["fields"]}
        self.assertEqual(readonly, {"first_name": False, "is_superuser": True})
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_superuser)

    def test_readonly_fields_are_not_saved(self):
        with profile_fields(["first_name", Field("email", readonly=True)]):
            self.client.patch(
                "/api/profile", {"email": "other@example.com"}, format="json"
            )

        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "maya@example.com")

    def test_invalid_values_are_field_errors(self):
        response = self.client.patch(
            "/api/profile", {"email": "not an address"}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json())

    def test_the_password_is_never_a_profile_field(self):
        with profile_fields(["first_name", "password"]):
            data = self.client.get("/api/profile").json()

        self.assertEqual([f["name"] for f in data["fields"]], ["first_name"])
        self.assertNotIn("password", data["values"])

    def test_saving_is_logged(self):
        self.client.patch("/api/profile", {"first_name": "Mia"}, format="json")

        entry = LogEntry.objects.get(
            content_type=ContentType.objects.get_for_model(auth_models.User)
        )
        self.assertEqual(entry.user, self.user)
        self.assertEqual(entry.action_flag, CHANGE)


class PasswordChangeTests(ProfileTestCase):
    def test_changes_the_password_and_continues_the_session(self):
        response = self.client.post(
            "/api/profile/password",
            {"current_password": "old-Secret-42", "new_password": "new-Secret-42"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json())
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("new-Secret-42"))

        # The old token is void; the new one works.
        self.assertEqual(self.client.get("/api/profile").status_code, 401)
        self.assertEqual(
            APIClient()
            .get(
                "/api/profile",
                HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}",
            )
            .status_code,
            200,
        )

    def test_wrong_current_password(self):
        response = self.client.post(
            "/api/profile/password",
            {"current_password": "wrong", "new_password": "new-Secret-42"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("current_password", response.json())
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("old-Secret-42"))

    def test_runs_the_password_validators(self):
        response = self.client.post(
            "/api/profile/password",
            {"current_password": "old-Secret-42", "new_password": "123"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response.json())

    def test_not_offered_without_a_usable_password(self):
        self.user.set_unusable_password()
        self.user.save()

        response = client_for(self.user).post(
            "/api/profile/password",
            {"current_password": "", "new_password": "new-Secret-42"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    def test_is_throttled(self):
        with mock.patch.object(cs_settings, "LOGIN_THROTTLE_RATE", "2/min"):
            statuses = [
                self.client.post(
                    "/api/profile/password",
                    {"current_password": "wrong", "new_password": "x"},
                    format="json",
                ).status_code
                for _ in range(3)
            ]

        self.assertEqual(statuses, [400, 400, 429])


class ActivityTests(ProfileTestCase):
    def test_counts_the_users_changes_against_the_period_before(self):
        article = Article.objects.create(title="One")
        now = timezone.now()
        log(article, ADDITION, self.user, now - timedelta(days=1))
        log(article, CHANGE, self.user, now - timedelta(days=2))
        log(article, CHANGE, self.user, now - timedelta(days=3))
        log(article, DELETION, self.user, now - timedelta(days=10))
        # The period before.
        log(article, CHANGE, self.user, now - timedelta(days=40))
        # Someone else's change.
        other = auth_models.User.objects.create_user(username="sam", is_staff=True)
        log(article, CHANGE, other, now - timedelta(days=1))

        data = self.client.get("/api/profile/activity?range=30d").json()
        metrics = {m["key"]: (m["value"], m["previous"]) for m in data["metrics"]}

        self.assertEqual(metrics["total"], (4, 1))
        self.assertEqual(metrics["created"], (1, 0))
        self.assertEqual(metrics["updated"], (2, 1))
        self.assertEqual(metrics["deleted"], (1, 0))
        self.assertEqual(data["range"]["interval"], "day")
        self.assertEqual(len(data["series"]["total"]), 30)
        self.assertEqual(sum(p["value"] for p in data["series"]["total"]), 4)
        self.assertEqual(
            data["models"],
            [{"key": "testapp.article", "label": "articles", "value": 4}],
        )

    def test_leaves_out_models_the_user_may_not_view(self):
        category = Category.objects.create(name="Travel")
        log(category, CHANGE, self.user)

        data = self.client.get("/api/profile/activity?range=7d").json()

        self.assertEqual(data["metrics"][0]["value"], 0)
        self.assertEqual(data["models"], [])

    def test_twelve_months_counts_per_month(self):
        data = self.client.get("/api/profile/activity?range=12mo").json()

        self.assertEqual(data["range"]["interval"], "month")
        self.assertEqual(len(data["series"]["total"]), 12)

    def test_invalid_range(self):
        response = self.client.get("/api/profile/activity?range=forever")

        self.assertEqual(response.status_code, 400)


class RecentContentTests(ProfileTestCase):
    def test_one_row_per_object_with_its_latest_change(self):
        one = Article.objects.create(title="One")
        two = Article.objects.create(title="Two")
        now = timezone.now()
        log(one, ADDITION, self.user, now - timedelta(hours=5))
        log(two, ADDITION, self.user, now - timedelta(hours=4))
        log(one, CHANGE, self.user, now - timedelta(hours=1))

        items = self.client.get("/api/profile/recent").json()["items"]

        self.assertEqual(
            [(i["id"], i["action"]) for i in items],
            [(str(one.pk), "updated"), (str(two.pk), "created")],
        )
        self.assertEqual(items[0]["model"], "testapp.article")
        self.assertEqual(items[0]["title"], "One")
        self.assertTrue(items[0]["link"])

    def test_deleted_objects_are_listed_without_a_link(self):
        article = Article.objects.create(title="Gone")
        log(article, DELETION, self.user)
        article.delete()

        items = self.client.get("/api/profile/recent").json()["items"]

        self.assertEqual(items[0]["action"], "deleted")
        self.assertEqual(items[0]["title"], "Gone")
        self.assertFalse(items[0]["link"])

    def test_only_the_users_own_changes_on_viewable_models(self):
        article = Article.objects.create(title="Mine")
        theirs = Article.objects.create(title="Theirs")
        category = Category.objects.create(name="Hidden")
        other = auth_models.User.objects.create_user(username="sam", is_staff=True)
        log(article, CHANGE, self.user)
        log(theirs, CHANGE, other)
        log(category, CHANGE, self.user)

        items = self.client.get("/api/profile/recent").json()["items"]

        self.assertEqual([i["title"] for i in items], ["Mine"])

    def test_limit(self):
        for index in range(5):
            log(Article.objects.create(title=f"A{index}"), ADDITION, self.user)

        items = self.client.get("/api/profile/recent?limit=3").json()["items"]

        self.assertEqual(len(items), 3)


def test_profile_field_check_accepts_the_defaults():
    with profile_fields(None):
        assert profile_field_errors(cs_settings.ADMIN_SITE) == []

    with profile_fields(["first_name", Field("email", col_span=2)]):
        assert profile_field_errors(cs_settings.ADMIN_SITE) == []


def test_profile_field_check_reports_bad_entries():
    from django.db.models import Q

    with profile_fields(
        [
            "nickname",
            "password",
            "is_superuser",
            Field("username", readonly=True),
            Field("email", when=Q(first_name="x")),
            42,
        ]
    ):
        errors = profile_field_errors(cs_settings.ADMIN_SITE)

    assert {check_id for check_id, _ in errors} == {"content_studio.E041"}
    messages = " ".join(message for _, message in errors)
    assert "'nickname'" in messages
    assert "'password'" in messages
    assert "'is_superuser'" in messages
    assert "when=" in messages
    assert "42" in messages
    # A read-only username is fine.
    assert "'username'" not in messages
