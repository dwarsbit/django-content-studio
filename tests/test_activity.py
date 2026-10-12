"""
Tests for the per-object activity log endpoint.

The endpoint backs the editor's history section: the activity entries
recorded for one object, most recent first, gated by view permission.
"""

from django.contrib.admin.models import ADDITION, CHANGE, LogEntry
from django.contrib.auth import models as auth_models
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from content_studio.token_backends.jwt import create_access_token
from tests.testapp.models import Article


class AuthenticatedTestCase(TestCase):
    def create_user(self, *permissions, superuser=False, **kwargs):
        if superuser:
            return auth_models.User.objects.create_superuser(
                username=kwargs.get("username", "admin"), password="x"
            )

        user = auth_models.User.objects.create_user(
            username=kwargs.get("username", "staff"), password="x", is_staff=True
        )
        for permission in permissions:
            user.user_permissions.set(
                list(user.user_permissions.all())
                + [auth_models.Permission.objects.get(codename=permission)]
            )
        return user

    def client_for(self, user):
        client = APIClient()
        token = create_access_token(user)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return client


def log_entry(article, action_flag, user, action_time=None):
    return LogEntry.objects.create(
        user=user,
        action_flag=action_flag,
        content_type=ContentType.objects.get_for_model(Article),
        object_id=article.pk,
        object_repr=article.title,
        change_message="",
        **({"action_time": action_time} if action_time else {}),
    )


class ActivityTests(AuthenticatedTestCase):
    def setUp(self):
        self.superuser = self.create_user(superuser=True)
        self.client = self.client_for(self.superuser)

    def test_activity_lists_entries_most_recent_first(self):
        article = Article.objects.create(title="one")

        log_entry(
            article,
            ADDITION,
            self.superuser,
            action_time=timezone.now() - timezone.timedelta(days=1),
        )
        log_entry(article, CHANGE, self.superuser, action_time=timezone.now())

        response = self.client.get(
            f"/api/content/testapp.article/{article.pk}/activity"
        )

        self.assertEqual(response.status_code, 200)
        entries = response.json()
        self.assertEqual(
            [entry["action_flag"] for entry in entries], [CHANGE, ADDITION]
        )
        self.assertEqual(entries[0]["object_model"], "testapp.article")
        self.assertEqual(entries[0]["user"]["__str__"], "admin")

    def test_activity_only_lists_the_object_entries(self):
        one = Article.objects.create(title="one")
        other = Article.objects.create(title="other")
        log_entry(one, ADDITION, self.superuser)
        log_entry(other, ADDITION, self.superuser)

        response = self.client.get(f"/api/content/testapp.article/{one.pk}/activity")

        self.assertEqual(response.status_code, 200)
        entries = response.json()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["object_repr"], "one")

    def test_activity_requires_view_permission(self):
        article = Article.objects.create(title="one")
        viewer = self.create_user("view_article", username="viewer")
        staff = self.create_user(username="staff")

        response = self.client_for(viewer).get(
            f"/api/content/testapp.article/{article.pk}/activity"
        )
        self.assertEqual(response.status_code, 200)

        response = self.client_for(staff).get(
            f"/api/content/testapp.article/{article.pk}/activity"
        )
        self.assertEqual(response.status_code, 403)

    def test_activity_of_unknown_object_returns_404(self):
        response = self.client.get("/api/content/testapp.article/12345/activity")

        self.assertEqual(response.status_code, 404)
