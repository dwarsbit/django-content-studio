"""
Tests for bulk actions: the @bulk_action declaration, resolution with
permissions, the payload and the bulk endpoint.
"""

from unittest import mock

from django.contrib.admin.models import DELETION, LogEntry
from django.core.exceptions import PermissionDenied
from django.test import TestCase

from content_studio.actions import (
    bulk_action,
    check_object_permissions,
    get_bulk_actions,
)
from content_studio.admin import ModelStudio
from tests.testapp.admin import ArticleAdmin
from tests.testapp.models import Article

from tests.test_e2e_crud import AuthenticatedTestCase


# Defined at module level: class bodies resolve names through the
# module, not the enclosing function.
@bulk_action
def make_published(self, request, queryset):
    pass


class ResolutionTests(TestCase):
    def test_default_offers_delete_and_declared_actions(self):
        studio = ArticleAdmin(Article, None)

        actions = get_bulk_actions(studio)

        self.assertEqual([action.id for action in actions], ["delete", "publish"])

    def test_explicit_list_selects_and_orders(self):
        class Explicit(ArticleAdmin):
            actions = ["publish", "delete"]

        actions = get_bulk_actions(Explicit(Article, None))

        self.assertEqual([action.id for action in actions], ["publish", "delete"])

    def test_empty_list_disables_bulk_actions(self):
        class Disabled(ModelStudio):
            actions = []

        self.assertEqual(get_bulk_actions(Disabled(Article, None)), [])

    def test_unresolvable_names_are_skipped(self):
        # Configuration errors are the system checks' job; resolution
        # stays silent and offers the rest.
        class Broken(ArticleAdmin):
            actions = ["publish", "nope"]

        actions = get_bulk_actions(Broken(Article, None))

        self.assertEqual([action.id for action in actions], ["publish"])

    def test_metadata_serializes(self):
        studio = ArticleAdmin(Article, None)

        delete, publish = get_bulk_actions(studio)

        self.assertEqual(delete.serialize()["id"], "delete")
        self.assertTrue(delete.serialize()["destructive"])
        self.assertIsNotNone(delete.serialize()["confirm"])

        self.assertEqual(
            publish.serialize(),
            {
                "id": "publish",
                "label": "Publish",
                "icon": "ph-bold ph-paper-plane-tilt",
                "confirm": None,
                "destructive": False,
            },
        )

    def test_label_defaults_to_the_prettified_method_name(self):
        class Unlabeled(ModelStudio):
            make_published = make_published

        action = next(
            action
            for action in get_bulk_actions(Unlabeled(Article, None))
            if action.id == "make_published"
        )

        self.assertEqual(action.serialize()["label"], "Make published")


class PermissionTests(TestCase):
    class Request:
        def __init__(self, allowed):
            self.allowed = allowed

    class Studio(ModelStudio):
        @bulk_action(allowed_permissions=["change"])
        def gated(self, request, queryset):
            pass

        @bulk_action
        def open(self, request, queryset):
            pass

    def studio_for(self, allowed):
        studio = self.Studio(Article, None)
        studio.has_add_permission = lambda request, obj=None: False
        studio.has_change_permission = lambda request, obj=None: allowed
        studio.has_delete_permission = lambda request, obj=None: False
        studio.has_view_permission = lambda request, obj=None: True
        return studio

    def test_actions_without_permissions_are_open(self):
        request = self.Request(False)

        actions = {a.id for a in get_bulk_actions(self.studio_for(False), request)}

        self.assertIn("open", actions)

    def test_gated_actions_follow_the_listed_permissions(self):
        request = self.Request(False)
        self.assertNotIn(
            "gated", {a.id for a in get_bulk_actions(self.studio_for(False), request)}
        )

        request = self.Request(True)
        self.assertIn(
            "gated", {a.id for a in get_bulk_actions(self.studio_for(True), request)}
        )

    def test_request_none_skips_permission_filtering(self):
        # Checks resolve without a request.
        actions = {a.id for a in get_bulk_actions(self.studio_for(False))}

        self.assertEqual(actions, {"delete", "gated", "open"})

    def test_actions_without_permissions_need_view_permission_per_object(self):
        studio = self.studio_for(True)
        studio.has_view_permission = lambda request, obj=None: obj is None
        action = next(a for a in get_bulk_actions(studio) if a.id == "open")

        with self.assertRaises(PermissionDenied):
            check_object_permissions(
                studio, self.Request(True), action.meta, [Article(title="x")]
            )

    def test_gated_actions_check_the_listed_permissions_per_object(self):
        studio = self.studio_for(True)
        studio.has_change_permission = lambda request, obj=None: obj is None
        action = next(a for a in get_bulk_actions(studio) if a.id == "gated")

        with self.assertRaises(PermissionDenied):
            check_object_permissions(
                studio, self.Request(True), action.meta, [Article(title="x")]
            )


class EndpointTests(AuthenticatedTestCase):
    """The bulk endpoint through the generated API, the way the frontend
    calls it."""

    def setUp(self):
        self.superuser = self.create_user(superuser=True)
        self.articles = [
            Article.objects.create(title="one"),
            Article.objects.create(title="two"),
        ]

    def test_delete_removes_selected_and_logs(self):
        client = self.client_for(self.superuser)
        response = client.post(
            "/api/content/testapp.article/bulk",
            {"action": "delete", "ids": [str(article.pk) for article in self.articles]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"count": 2})
        self.assertFalse(Article.objects.exists())

        # One log entry per deleted object, like individual deletes.
        self.assertEqual(
            LogEntry.objects.filter(
                action_flag=DELETION,
                content_type__model="article",
            ).count(),
            2,
        )

    def test_custom_action_runs_on_the_selected_queryset(self):
        client = self.client_for(self.superuser)
        response = client.post(
            "/api/content/testapp.article/bulk",
            {"action": "publish", "ids": [str(self.articles[0].pk)]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"message": "Published 1 articles."})
        self.articles[0].refresh_from_db()
        self.assertEqual(self.articles[0].status, Article.Status.PUBLISHED)
        self.articles[1].refresh_from_db()
        self.assertEqual(self.articles[1].status, Article.Status.DRAFT)

    def test_unknown_or_unauthorized_action_is_not_found(self):
        editor = self.create_user("change_article")
        client = self.client_for(editor)

        # change_permission allows publish, but not the built-in delete.
        response = client.post(
            "/api/content/testapp.article/bulk",
            {"action": "delete", "ids": [str(self.articles[0].pk)]},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        self.assertTrue(Article.objects.filter(pk=self.articles[0].pk).exists())

    def deny_for(self, title):
        """Deny a per-object permission on the article with this title."""

        def has_permission(studio, request, obj=None):
            return obj is None or obj.title != title

        return has_permission

    def test_delete_checks_delete_permission_per_object(self):
        client = self.client_for(self.superuser)

        with mock.patch.object(
            ArticleAdmin, "has_delete_permission", self.deny_for("one")
        ):
            response = client.post(
                "/api/content/testapp.article/bulk",
                {
                    "action": "delete",
                    "ids": [str(article.pk) for article in self.articles],
                },
                format="json",
            )

        # Nothing is deleted, not even the allowed object.
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Article.objects.count(), 2)

    def test_custom_action_checks_its_permissions_per_object(self):
        client = self.client_for(self.superuser)

        with mock.patch.object(
            ArticleAdmin, "has_change_permission", self.deny_for("one")
        ):
            response = client.post(
                "/api/content/testapp.article/bulk",
                {"action": "publish", "ids": [str(self.articles[0].pk)]},
                format="json",
            )

        self.assertEqual(response.status_code, 403)
        self.articles[0].refresh_from_db()
        self.assertEqual(self.articles[0].status, Article.Status.DRAFT)

    def test_per_object_check_allows_permitted_objects(self):
        client = self.client_for(self.superuser)

        with mock.patch.object(
            ArticleAdmin, "has_delete_permission", self.deny_for("one")
        ):
            response = client.post(
                "/api/content/testapp.article/bulk",
                {"action": "delete", "ids": [str(self.articles[1].pk)]},
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"count": 1})
        self.assertEqual(list(Article.objects.values_list("title", flat=True)), ["one"])

    def test_missing_ids_is_rejected(self):
        client = self.client_for(self.superuser)
        response = client.post(
            "/api/content/testapp.article/bulk",
            {"action": "delete"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_delete_requires_ids_that_exist(self):
        """Ids that match nothing delete nothing, without error."""
        client = self.client_for(self.superuser)
        response = client.post(
            "/api/content/testapp.article/bulk",
            {"action": "delete", "ids": ["123456"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"count": 0})
        self.assertEqual(Article.objects.count(), 2)


class PayloadTests(AuthenticatedTestCase):
    def test_discover_lists_permission_filtered_actions(self):
        superuser = self.create_user(superuser=True)
        client = self.client_for(superuser)

        response = client.get("/api/discover")

        article = next(
            model
            for model in response.json()["models"]
            if model["label"] == "testapp.article"
        )
        self.assertEqual(
            [action["id"] for action in article["admin"]["list"]["actions"]],
            ["delete", "publish"],
        )

    def test_discover_hides_actions_without_permission(self):
        editor = self.create_user("view_article", "change_article")
        client = self.client_for(editor)

        response = client.get("/api/discover")

        article = next(
            model
            for model in response.json()["models"]
            if model["label"] == "testapp.article"
        )
        self.assertEqual(
            [action["id"] for action in article["admin"]["list"]["actions"]],
            ["publish"],
        )
