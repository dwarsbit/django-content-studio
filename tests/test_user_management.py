"""
Tests for managing other users: setting a user's password from their
edit page, and the guard on what staff who are not superusers may
change on users.
"""

from unittest import mock

from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.auth import models as auth_models
from django.test import RequestFactory, TestCase, override_settings
from rest_framework.test import APIClient

from content_studio.admin import AdminSerializer
from content_studio.settings import cs_settings
from content_studio.token_backends.jwt import create_access_token
from content_studio.users import guarded_field_names

User = auth_models.User


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


def staff(username="staff", *permissions):
    user = User.objects.create_user(
        username=username, password="Staff-Secret-42", is_staff=True
    )
    user.user_permissions.set(
        auth_models.Permission.objects.filter(codename__in=permissions)
    )
    return user


def user_studio():
    return cs_settings.ADMIN_SITE._registry[User]


class UserManagementTestCase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin", password="Admin-Secret-42", email="admin@example.com"
        )
        self.editor = staff("editor", "view_user", "change_user", "add_user")
        self.target = User.objects.create_user(
            username="maya",
            password="Old-Secret-42",
            email="maya@example.com",
            is_staff=True,
        )

    def url(self, user):
        return f"/api/content/auth.user/{user.pk}/password"


class SetPasswordTests(UserManagementTestCase):
    def test_superuser_sets_a_password(self):
        response = client_for(self.admin).post(
            self.url(self.target), {"password": "New-Secret-42"}, format="json"
        )

        self.assertEqual(response.status_code, 204)
        self.target.refresh_from_db()
        self.assertTrue(self.target.check_password("New-Secret-42"))

    def test_staff_with_change_permission_sets_a_password(self):
        response = client_for(self.editor).post(
            self.url(self.target), {"password": "New-Secret-42"}, format="json"
        )

        self.assertEqual(response.status_code, 204)
        self.target.refresh_from_db()
        self.assertTrue(self.target.check_password("New-Secret-42"))

    def test_a_password_without_a_previous_one(self):
        self.target.set_unusable_password()
        self.target.save()

        response = client_for(self.admin).post(
            self.url(self.target), {"password": "New-Secret-42"}, format="json"
        )

        self.assertEqual(response.status_code, 204)
        self.target.refresh_from_db()
        self.assertTrue(self.target.check_password("New-Secret-42"))

    def test_setting_it_is_logged(self):
        client_for(self.admin).post(
            self.url(self.target), {"password": "New-Secret-42"}, format="json"
        )

        entry = LogEntry.objects.get(object_id=str(self.target.pk))
        self.assertEqual(entry.action_flag, CHANGE)
        self.assertEqual(entry.user, self.admin)
        self.assertEqual(entry.change_message, "Set password.")
        self.assertNotIn("New-Secret-42", entry.change_message)

    def test_signs_the_user_out(self):
        client = client_for(self.target)
        self.assertEqual(client.get("/api/profile").status_code, 200)

        client_for(self.admin).post(
            self.url(self.target), {"password": "New-Secret-42"}, format="json"
        )

        self.assertEqual(client.get("/api/profile").status_code, 401)

    def test_password_validators_apply(self):
        response = client_for(self.admin).post(
            self.url(self.target), {"password": "maya"}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.json())
        self.target.refresh_from_db()
        self.assertTrue(self.target.check_password("Old-Secret-42"))

    def test_empty_password_is_refused(self):
        for payload in ({}, {"password": ""}, {"password": None}, {"password": 1}):
            response = client_for(self.admin).post(
                self.url(self.target), payload, format="json"
            )
            self.assertEqual(response.status_code, 400, payload)

        self.target.refresh_from_db()
        self.assertTrue(self.target.check_password("Old-Secret-42"))

    def test_overlong_password_is_refused(self):
        response = client_for(self.admin).post(
            self.url(self.target), {"password": "x" * 5000}, format="json"
        )

        self.assertEqual(response.status_code, 400)

    def test_requires_change_permission(self):
        viewer = staff("viewer", "view_user")

        response = client_for(viewer).post(
            self.url(self.target), {"password": "New-Secret-42"}, format="json"
        )

        self.assertEqual(response.status_code, 403)
        self.target.refresh_from_db()
        self.assertTrue(self.target.check_password("Old-Secret-42"))

    def test_studio_object_permission_applies(self):
        with mock.patch.object(
            user_studio(),
            "has_change_permission",
            lambda request, obj=None: obj is None,
        ):
            response = client_for(self.editor).post(
                self.url(self.target), {"password": "New-Secret-42"}, format="json"
            )

        self.assertEqual(response.status_code, 403)

    def test_staff_cannot_set_a_superusers_password(self):
        other = User.objects.create_superuser(username="root", password="Root-42-x")

        response = client_for(self.editor).post(
            self.url(other), {"password": "New-Secret-42"}, format="json"
        )

        self.assertEqual(response.status_code, 403)
        other.refresh_from_db()
        self.assertTrue(other.check_password("Root-42-x"))

    def test_superuser_sets_another_superusers_password(self):
        other = User.objects.create_superuser(username="root", password="Root-42-x")

        response = client_for(self.admin).post(
            self.url(other), {"password": "New-Secret-42"}, format="json"
        )

        self.assertEqual(response.status_code, 204)

    def test_not_for_the_own_account(self):
        response = client_for(self.admin).post(
            self.url(self.admin), {"password": "New-Secret-42"}, format="json"
        )

        self.assertEqual(response.status_code, 403)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password("Admin-Secret-42"))

    def test_only_on_the_user_model(self):
        from tests.testapp.models import Category

        category = Category.objects.create(name="News")

        response = client_for(self.admin).post(
            f"/api/content/testapp.category/{category.pk}/password",
            {"password": "New-Secret-42"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    def test_not_without_password_login(self):
        with mock.patch("content_studio.users.uses_password_login", return_value=False):
            response = client_for(self.admin).post(
                self.url(self.target), {"password": "New-Secret-42"}, format="json"
            )

        self.assertEqual(response.status_code, 403)


class UserInfoTests(UserManagementTestCase):
    def info(self, viewer, user):
        response = client_for(viewer).get(f"/api/content/auth.user/{user.pk}")
        self.assertEqual(response.status_code, 200)
        return response.json()["__user__"]

    def test_offers_setting_the_password(self):
        self.assertTrue(self.info(self.admin, self.target)["can_set_password"])
        self.assertTrue(self.info(self.editor, self.target)["can_set_password"])

    def test_not_for_the_own_account(self):
        self.assertFalse(self.info(self.admin, self.admin)["can_set_password"])

    def test_not_for_a_superuser_seen_by_staff(self):
        self.assertFalse(self.info(self.editor, self.admin)["can_set_password"])

    def test_not_without_change_permission(self):
        viewer = staff("viewer", "view_user")

        self.assertFalse(self.info(viewer, self.target)["can_set_password"])

    def test_other_models_carry_no_user_info(self):
        from tests.testapp.models import Category

        category = Category.objects.create(name="News")
        data = (
            client_for(self.admin)
            .get(f"/api/content/testapp.category/{category.pk}")
            .json()
        )

        self.assertNotIn("__user__", data)

    def test_the_password_stays_out(self):
        data = client_for(self.admin).get(f"/api/content/auth.user/{self.target.pk}")

        self.assertNotIn("password", data.json())


class SuperuserGuardTests(UserManagementTestCase):
    def detail(self, viewer, user):
        return client_for(viewer).get(f"/api/content/auth.user/{user.pk}").json()

    def test_staff_cannot_make_a_user_superuser(self):
        response = client_for(self.editor).patch(
            f"/api/content/auth.user/{self.target.pk}",
            {"is_superuser": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.target.refresh_from_db()
        self.assertFalse(self.target.is_superuser)
        self.assertIn(
            "is_superuser", self.detail(self.editor, self.target)["__readonly_fields__"]
        )

    def test_staff_cannot_make_themselves_superuser(self):
        client_for(self.editor).patch(
            f"/api/content/auth.user/{self.editor.pk}",
            {"is_superuser": True},
            format="json",
        )

        self.editor.refresh_from_db()
        self.assertFalse(self.editor.is_superuser)

    def test_staff_cannot_create_a_superuser(self):
        response = client_for(self.editor).post(
            "/api/content/auth.user",
            {
                "username": "new",
                "email": "new@example.com",
                "is_superuser": True,
                "is_staff": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertFalse(User.objects.get(username="new").is_superuser)

    def test_staff_cannot_change_a_superusers_email(self):
        client_for(self.editor).patch(
            f"/api/content/auth.user/{self.admin.pk}",
            {"email": "editor@example.com", "first_name": "Ada"},
            format="json",
        )

        self.admin.refresh_from_db()
        self.assertEqual(self.admin.email, "admin@example.com")
        # Other fields stay editable.
        self.assertEqual(self.admin.first_name, "Ada")
        self.assertIn(
            "email", self.detail(self.editor, self.admin)["__readonly_fields__"]
        )

    def test_staff_changes_other_users_email(self):
        client_for(self.editor).patch(
            f"/api/content/auth.user/{self.target.pk}",
            {"email": "maya@example.org"},
            format="json",
        )

        self.target.refresh_from_db()
        self.assertEqual(self.target.email, "maya@example.org")
        self.assertNotIn(
            "email", self.detail(self.editor, self.target)["__readonly_fields__"]
        )

    def test_superusers_change_everything(self):
        other = User.objects.create_superuser(
            username="root", password="Root-42-x", email="root@example.com"
        )

        client_for(self.admin).patch(
            f"/api/content/auth.user/{self.target.pk}",
            {"is_superuser": True},
            format="json",
        )
        client_for(self.admin).patch(
            f"/api/content/auth.user/{other.pk}",
            {"email": "root@example.org"},
            format="json",
        )

        self.target.refresh_from_db()
        other.refresh_from_db()
        self.assertTrue(self.target.is_superuser)
        self.assertEqual(other.email, "root@example.org")
        # Only the login dates, read-only for everyone.
        self.assertEqual(
            self.detail(self.admin, other)["__readonly_fields__"],
            ["last_login", "date_joined"],
        )

    def test_create_form_shows_is_superuser_read_only_to_staff(self):
        request = RequestFactory().get("/")

        request.user = self.editor
        edit = AdminSerializer(user_studio()).serialize(request)["edit"]
        self.assertIn("is_superuser", edit["readonly_fields"])

        request.user = self.admin
        edit = AdminSerializer(user_studio()).serialize(request)["edit"]
        self.assertNotIn("is_superuser", edit["readonly_fields"])

    def test_studio_readonly_fields_are_kept(self):
        with mock.patch.object(user_studio(), "readonly_fields", ["username"]):
            fields = self.detail(self.editor, self.target)["__readonly_fields__"]

        self.assertEqual(fields, ["username", "is_superuser"])

    def test_other_models_are_not_guarded(self):
        from tests.testapp.models import Category

        request = RequestFactory().get("/")
        request.user = self.editor

        self.assertEqual(guarded_field_names(Category, request), set())


@override_settings(
    AUTH_PASSWORD_VALIDATORS=[
        {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"}
    ]
)
class ValidatorSettingsTests(UserManagementTestCase):
    def test_project_validators_are_used(self):
        response = client_for(self.admin).post(
            self.url(self.target), {"password": "short"}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("8", response.json()["password"][0])


class UserEditPageTests(UserManagementTestCase):
    def test_password_is_not_a_form_field(self):
        request = RequestFactory().get("/")
        request.user = self.admin

        self.assertNotIn("password", user_studio().get_fields(request))
        self.assertIn("username", user_studio().get_fields(request))

    def test_a_user_is_created_without_a_password(self):
        response = client_for(self.admin).post(
            "/api/content/auth.user",
            {"username": "new", "email": "new@example.com", "is_staff": True},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertNotIn("password", response.json())
