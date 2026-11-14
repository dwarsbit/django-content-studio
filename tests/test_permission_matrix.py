"""
Tests for editing permissions: the permission matrix's options, the
guard that staff who are not superusers only grant what they have, and
the default user and group studios.
"""

from django.contrib.auth import models as auth_models
from django.test import RequestFactory, TestCase
from rest_framework.test import APIClient

from content_studio.admin import AdminSerializer, ContentStudioSite, ModelStudio
from content_studio.form import FormSetGroup
from content_studio.serializers import ModelSerializer
from content_studio.settings import cs_settings
from content_studio.token_backends.jwt import create_access_token
from content_studio.user_studios import GroupStudio, UserStudio

User = auth_models.User
Group = auth_models.Group
Permission = auth_models.Permission


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


def perm(codename, app_label="auth"):
    return Permission.objects.get(codename=codename, content_type__app_label=app_label)


def staff(username, *codenames):
    user = User.objects.create_user(
        username=username, password="Staff-Secret-42", is_staff=True
    )
    user.user_permissions.set(
        Permission.objects.filter(
            codename__in=codenames, content_type__app_label__in=["auth", "testapp"]
        )
    )
    return user


def related(*permissions):
    return [{"id": permission.pk} for permission in permissions]


class PermissionMatrixTestCase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin", password="Admin-Secret-42", email="admin@example.com"
        )
        self.editor = staff(
            "editor",
            "view_user",
            "change_user",
            "add_user",
            "view_group",
            "change_group",
            "add_group",
            "view_article",
            "change_article",
        )
        self.target = User.objects.create_user(
            username="maya", email="maya@example.com", is_staff=True
        )

    def user_url(self, user):
        return f"/api/content/auth.user/{user.pk}"


class OptionsTests(PermissionMatrixTestCase):
    def options(self, user, url="/api/content/auth.user/permissions/user_permissions"):
        return client_for(user).get(url)

    def find(self, data, codename):
        for app in data:
            for model in app["models"]:
                for permission in model["permissions"]:
                    if permission["codename"] == codename:
                        return app, model, permission

        raise AssertionError(codename)

    def test_grouped_by_app_and_model(self):
        response = self.options(self.admin)

        self.assertEqual(response.status_code, 200)
        app, model, permission = self.find(response.json(), "change_user")
        self.assertEqual(app["app_label"], "auth")
        self.assertEqual(app["name"], "Authentication and Authorization")
        self.assertEqual(model["model"], "auth.user")
        self.assertEqual(model["name"], "Users")
        self.assertEqual(permission["action"], "change")
        self.assertEqual(permission["id"], perm("change_user").pk)
        self.assertEqual(permission["name"], "Can change user")
        self.assertTrue(permission["grantable"])

    def test_default_actions_in_order(self):
        _, model, _ = self.find(self.options(self.admin).json(), "add_user")

        self.assertEqual(
            [permission["action"] for permission in model["permissions"]],
            ["add", "change", "delete", "view"],
        )

    def test_custom_permissions_have_no_action(self):
        content_type = perm("add_user").content_type
        Permission.objects.create(
            codename="invite_user", name="Can invite user", content_type=content_type
        )

        _, _, permission = self.find(self.options(self.admin).json(), "invite_user")

        self.assertIsNone(permission["action"])

    def test_apps_sorted_by_name(self):
        names = [app["name"] for app in self.options(self.admin).json()]

        self.assertEqual(names, sorted(names, key=str.lower))

    def test_grantable_only_what_the_editor_has(self):
        data = self.options(self.editor).json()

        self.assertTrue(self.find(data, "change_user")[2]["grantable"])
        self.assertTrue(self.find(data, "view_article")[2]["grantable"])
        self.assertFalse(self.find(data, "delete_user")[2]["grantable"])
        self.assertFalse(self.find(data, "delete_article")[2]["grantable"])

    def test_group_permissions_are_grantable(self):
        group = Group.objects.create(name="Publishers")
        group.permissions.add(perm("delete_article", "testapp"))
        self.editor.groups.add(group)

        data = self.options(User.objects.get(pk=self.editor.pk)).json()

        self.assertTrue(self.find(data, "delete_article")[2]["grantable"])

    def test_groups_permissions_field(self):
        response = self.options(
            self.editor, "/api/content/auth.group/permissions/permissions"
        )

        self.assertEqual(response.status_code, 200)

    def test_needs_view_permission(self):
        nobody = staff("nobody")

        self.assertEqual(self.options(nobody).status_code, 403)

    def test_other_fields_are_not_found(self):
        self.assertEqual(
            self.options(
                self.admin, "/api/content/auth.user/permissions/groups"
            ).status_code,
            404,
        )
        self.assertEqual(
            self.options(
                self.admin, "/api/content/auth.user/permissions/nope"
            ).status_code,
            404,
        )


class GrantGuardTests(PermissionMatrixTestCase):
    def patch(self, user, data, target=None):
        return client_for(user).patch(
            self.user_url(target or self.target), data, format="json"
        )

    def test_staff_grants_what_they_have(self):
        response = self.patch(
            self.editor,
            {"user_permissions": related(perm("view_article", "testapp"))},
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            list(self.target.user_permissions.all()),
            [perm("view_article", "testapp")],
        )

    def test_staff_cannot_grant_what_they_lack(self):
        response = self.patch(
            self.editor,
            {"user_permissions": related(perm("delete_user"))},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("user_permissions", response.json())
        self.assertIn("Can delete user", response.json()["user_permissions"][0])
        self.assertFalse(self.target.user_permissions.exists())

    def test_staff_cannot_revoke_what_they_lack(self):
        self.target.user_permissions.add(perm("delete_user"))

        response = self.patch(self.editor, {"user_permissions": []})

        self.assertEqual(response.status_code, 400)
        self.assertTrue(self.target.user_permissions.filter(codename="delete_user"))

    def test_permissions_they_lack_are_kept_unchanged(self):
        self.target.user_permissions.add(perm("delete_user"))

        response = self.patch(
            self.editor,
            {
                "user_permissions": related(
                    perm("delete_user"), perm("view_article", "testapp")
                )
            },
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.target.user_permissions.count(), 2)

    def test_staff_cannot_grant_themselves_more(self):
        response = self.patch(
            self.editor,
            {"user_permissions": related(perm("delete_user"))},
            target=self.editor,
        )

        self.assertEqual(response.status_code, 400)

    def test_superusers_grant_anything(self):
        response = self.patch(
            self.admin, {"user_permissions": related(perm("delete_user"))}
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.target.user_permissions.filter(codename="delete_user"))

    def test_create_is_guarded_too(self):
        response = client_for(self.editor).post(
            "/api/content/auth.user",
            {
                "username": "new",
                "email": "new@example.com",
                "is_staff": True,
                "is_active": True,
                "user_permissions": related(perm("delete_user")),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username="new").exists())

    def test_staff_adds_groups_whose_permissions_they_have(self):
        group = Group.objects.create(name="Readers")
        group.permissions.add(perm("view_article", "testapp"))

        response = self.patch(self.editor, {"groups": [{"id": group.pk}]})

        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(self.target.groups.filter(pk=group.pk).exists())

    def test_staff_cannot_add_groups_with_more(self):
        group = Group.objects.create(name="Admins")
        group.permissions.add(perm("delete_user"))

        response = self.patch(self.editor, {"groups": [{"id": group.pk}]})

        self.assertEqual(response.status_code, 400)
        self.assertIn("Admins", response.json()["groups"][0])
        self.assertFalse(self.target.groups.exists())

    def test_staff_cannot_remove_groups_with_more(self):
        group = Group.objects.create(name="Admins")
        group.permissions.add(perm("delete_user"))
        self.target.groups.add(group)

        response = self.patch(self.editor, {"groups": []})

        self.assertEqual(response.status_code, 400)
        self.assertTrue(self.target.groups.exists())

    def test_group_permissions_are_guarded(self):
        group = Group.objects.create(name="Editors")

        response = client_for(self.editor).patch(
            f"/api/content/auth.group/{group.pk}",
            {"permissions": related(perm("delete_user"))},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(group.permissions.exists())

        response = client_for(self.editor).patch(
            f"/api/content/auth.group/{group.pk}",
            {"permissions": related(perm("change_article", "testapp"))},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(group.permissions.exists())


class DefaultStudioTests(TestCase):
    def test_both_registered(self):
        registry = cs_settings.ADMIN_SITE._registry

        self.assertIsInstance(registry[User], UserStudio)
        self.assertIsInstance(registry[Group], GroupStudio)

    def test_own_studios_take_precedence(self):
        site = ContentStudioSite(name="other")
        site.register(Group, ModelStudio)
        site._register_default_user_studio()

        self.assertNotIsInstance(site._registry[Group], GroupStudio)
        self.assertIsInstance(site._registry[User], UserStudio)

    def test_permission_fields_use_the_matrix(self):
        fields = ModelSerializer(User).get_fields()

        self.assertEqual(
            fields["user_permissions"]["widget_class"], "PermissionMatrixWidget"
        )
        self.assertNotIn("widget_class", fields["groups"])
        self.assertEqual(
            ModelSerializer(Group).get_fields()["permissions"]["widget_class"],
            "PermissionMatrixWidget",
        )

    def test_user_layout(self):
        studio = cs_settings.ADMIN_SITE._registry[User]
        tabs = studio.edit_main

        self.assertEqual([str(tab.label) for tab in tabs], ["Account", "Permissions"])
        self.assertTrue(all(isinstance(tab, FormSetGroup) for tab in tabs))
        self.assertEqual(
            [field.name for field in tabs[0].get_fields()],
            ["username", "first_name", "last_name", "email"],
        )
        self.assertEqual(
            [field.name for field in tabs[1].get_fields()],
            ["is_active", "is_staff", "is_superuser", "groups", "user_permissions"],
        )
        self.assertEqual(
            [field.name for field in studio.edit_sidebar[0].get_fields()],
            ["last_login", "date_joined"],
        )
        self.assertEqual(studio.readonly_fields, ["last_login", "date_joined"])
        self.assertEqual(
            studio.search_fields, ["username", "first_name", "last_name", "email"]
        )
        self.assertEqual(
            studio.list_filter, ["is_staff", "is_superuser", "is_active", "groups"]
        )
        # The layout serializes.
        request = RequestFactory().get("/")
        request.user = User.objects.create_superuser(username="admin", password="x")
        edit = AdminSerializer(studio).serialize(request)["edit"]
        self.assertEqual(edit["readonly_fields"], ["last_login", "date_joined"])

    def test_subclasses_keep_what_they_set(self):
        class MyUserStudio(UserStudio):
            edit_main = ["username", "email"]
            search_fields = ["email"]

        studio = MyUserStudio(User, cs_settings.ADMIN_SITE)

        self.assertEqual(studio.edit_main, ["username", "email"])
        self.assertEqual(studio.edit_sidebar, [])
        self.assertEqual(studio.search_fields, ["email"])
        self.assertEqual(studio.ordering, ["username"])

    def test_list_display_wins_over_the_default_columns(self):
        class MyUserStudio(UserStudio):
            list_display = ["email"]

        studio = MyUserStudio(User, cs_settings.ADMIN_SITE)

        self.assertEqual(studio.table_display, ModelStudio.table_display)
