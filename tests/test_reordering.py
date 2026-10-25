"""
Tests for reordering: moving objects to another position in their list.

A studio that configures `reorder_field` offers a move endpoint; the
built-in implementation rewrites the numeric field within the object's
scope (reorder_scope, the inline's parent, the tenant), and studios
that override reorder() bring their own implementation.
"""

from types import SimpleNamespace
from unittest import mock

from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings
from django.utils import timezone

from content_studio.admin import AdminSerializer, InlineModelStudio, admin_site
from content_studio.checks import reorder_errors, reorder_ordering_warnings
from content_studio.reordering import get_reorder_scope, move, renumber
from tests.test_soft_delete import AuthenticatedTestCase
from tests.testapp.admin import StepInline, TrackAdmin
from tests.testapp.models import Article, Category, Page, Step, Track

TRACKS = "/api/content/testapp.track"
STEPS = "/api/inlines/testapp.article/testapp.step"


def titles(queryset):
    return [str(obj) for obj in queryset.order_by("position", "pk")]


class MoveTests(TestCase):
    """The built-in implementation, without the API."""

    def setUp(self):
        self.tracks = [
            Track.objects.create(title=title, position=index * 10)
            for index, title in enumerate("abcde", start=1)
        ]

    def test_move_down_reuses_the_keys(self):
        a, b, c, d, e = self.tracks

        self.assertTrue(move(Track.objects.all(), a, "position", after=d))

        self.assertEqual(titles(Track.objects.all()), list("bcdae"))
        # Unique keys are reused: e keeps its position, the gaps survive.
        self.assertEqual(
            list(Track.objects.order_by("position").values_list("position", flat=True)),
            [10, 20, 30, 40, 50],
        )
        e.refresh_from_db()
        self.assertEqual(e.position, 50)

    def test_move_up(self):
        a, b, c, d, e = self.tracks

        move(Track.objects.all(), e, "position", before=b)

        self.assertEqual(titles(Track.objects.all()), list("aebcd"))

    def test_move_onto_itself_or_into_place_changes_nothing(self):
        a, b, *_ = self.tracks

        self.assertFalse(move(Track.objects.all(), a, "position", after=a))
        self.assertFalse(move(Track.objects.all(), b, "position", after=a))
        self.assertEqual(titles(Track.objects.all()), list("abcde"))

    def test_duplicate_keys_are_renumbered(self):
        Track.objects.update(position=0)
        a, b, c, d, e = self.tracks

        move(Track.objects.all(), a, "position", after=c)

        self.assertEqual(titles(Track.objects.all()), list("bcade"))
        self.assertEqual(
            list(Track.objects.order_by("position").values_list("position", flat=True)),
            [1, 2, 3, 4, 5],
        )

    def test_target_outside_the_queryset_is_refused(self):
        a, b, *_ = self.tracks

        with self.assertRaises(ValueError):
            move(Track.objects.exclude(pk=b.pk), a, "position", after=b)

    def test_renumber_keeps_the_order(self):
        Track.objects.filter(pk=self.tracks[0].pk).update(position=99)

        renumber(Track.objects.all(), "position")

        self.assertEqual(titles(Track.objects.all()), list("bcdea"))
        self.assertEqual(
            list(Track.objects.order_by("position").values_list("position", flat=True)),
            [1, 2, 3, 4, 5],
        )


class ManualOrderModelTests(TestCase):
    def test_reorder_renumbers_only_its_scope_in_one_query(self):
        first = Article.objects.create(title="first")
        second = Article.objects.create(title="second")
        steps = [Step.objects.create(article=first, text=t) for t in "abc"]
        other = Step.objects.create(article=second, text="other", order_key=7)

        # One select (locking) and one bulk update, in a savepoint.
        with self.assertNumQueries(4):
            steps[0].reorder()

        self.assertEqual(
            list(
                Step.objects.filter(article=first)
                .order_by("order_key")
                .values_list("text", "order_key")
            ),
            [("a", 1), ("b", 2), ("c", 3)],
        )
        other.refresh_from_db()
        self.assertEqual(other.order_key, 7)


class ScopeTests(TestCase):
    def test_scope_of_a_model_studio(self):
        self.assertEqual(
            get_reorder_scope(admin_site._registry[Track]), ["category_id"]
        )

    def test_inlines_are_ordered_per_parent(self):
        self.assertEqual(
            get_reorder_scope(StepInline(Article, admin_site)), ["article_id"]
        )

    def test_tenant_scoped_models_are_ordered_per_tenant(self):
        studio = SimpleNamespace(model=Page, reorder_scope=[])

        with override_settings(
            CONTENT_STUDIO={
                "ADMIN_SITE": "content_studio.admin.admin_site",
                "TENANT_MODEL": "tests.testapp.models.Category",
            }
        ):
            self.assertEqual(get_reorder_scope(studio), ["category_id"])


class MoveEndpointTests(AuthenticatedTestCase):
    def setUp(self):
        self.client = self.client_for(self.create_user(superuser=True))
        self.music = Category.objects.create(name="music")
        self.tracks = [
            Track.objects.create(title=title, position=index, category=self.music)
            for index, title in enumerate("abcd", start=1)
        ]

    def move(self, obj, **data):
        return self.client.post(f"{TRACKS}/{obj.pk}/move", data, format="json")

    def list_titles(self, **params):
        response = self.client.get(TRACKS, params)
        return [row["__str__"] for row in response.json()["results"]]

    def test_list_follows_the_manual_order(self):
        Track.objects.filter(pk=self.tracks[0].pk).update(position=9)

        self.assertEqual(self.list_titles(), list("bcda"))

    def test_move_after_and_before(self):
        a, b, c, d = self.tracks

        response = self.move(a, after=c.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.list_titles(), list("bcad"))

        self.move(d, before=b.pk)
        self.assertEqual(self.list_titles(), list("dbca"))

    def test_move_to_first_and_last(self):
        a, b, c, d = self.tracks

        self.move(c, position="first")
        self.assertEqual(self.list_titles(), list("cabd"))

        self.move(c, position="last")
        self.assertEqual(self.list_titles(), list("abdc"))

    def test_move_is_logged_as_a_change(self):
        a, b, *_ = self.tracks

        self.move(a, after=b.pk)

        entry = LogEntry.objects.get(
            content_type=ContentType.objects.get_for_model(Track), object_id=a.pk
        )
        self.assertEqual(entry.action_flag, CHANGE)
        self.assertEqual(entry.change_message, "Moved.")

    def test_a_move_into_place_is_not_logged(self):
        a, *_ = self.tracks

        self.move(a, position="first")

        self.assertFalse(LogEntry.objects.exists())

    def test_targets_outside_the_scope_are_refused(self):
        a, *_ = self.tracks
        stranger = Track.objects.create(title="x", position=1)

        response = self.move(a, after=stranger.pk)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.list_titles(category=self.music.pk), list("abcd"))

    def test_trashed_targets_are_refused(self):
        a, b, *_ = self.tracks
        Track.objects.filter(pk=b.pk).update(removed_at=timezone.now())

        self.assertEqual(self.move(a, after=b.pk).status_code, 400)

    def test_trashed_objects_keep_their_place(self):
        a, b, c, d = self.tracks
        Track.objects.filter(pk=b.pk).update(removed_at=timezone.now())

        self.move(d, position="first")
        Track.objects.filter(pk=b.pk).update(removed_at=None)

        self.assertEqual(self.list_titles(), list("dabc"))

    def test_invalid_payloads_are_refused(self):
        a, b, *_ = self.tracks

        self.assertEqual(self.move(a).status_code, 400)
        self.assertEqual(self.move(a, after=b.pk, before=b.pk).status_code, 400)
        self.assertEqual(self.move(a, position="middle").status_code, 400)
        self.assertEqual(self.move(a, after="nope").status_code, 400)

    def test_models_without_reorder_field_have_no_move(self):
        article = Article.objects.create(title="a")

        response = self.client.post(
            f"/api/content/testapp.article/{article.pk}/move",
            {"position": "first"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    def test_change_permission_is_required(self):
        a, b, *_ = self.tracks
        viewer = self.client_for(self.create_user("view_track", username="viewer"))

        response = viewer.post(f"{TRACKS}/{a.pk}/move", {"after": b.pk}, format="json")

        self.assertEqual(response.status_code, 403)

        editor = self.client_for(self.create_user("change_track", username="editor"))
        response = editor.post(f"{TRACKS}/{a.pk}/move", {"after": b.pk}, format="json")

        self.assertEqual(response.status_code, 200)

    def test_object_level_change_permission_is_enforced(self):
        a, b, *_ = self.tracks
        studio = admin_site._registry[Track]

        with mock.patch.object(
            type(studio),
            "has_change_permission",
            lambda self, request, obj=None: obj is None,
        ):
            self.assertEqual(self.move(a, after=b.pk).status_code, 403)

    def test_an_overridden_reorder_replaces_the_built_in_move(self):
        a, b, *_ = self.tracks
        calls = []

        def reorder(self, request, obj, *, after=None, before=None):
            calls.append((obj, after, before))

        with mock.patch.object(TrackAdmin, "reorder", reorder):
            self.move(a, after=b.pk)
            self.move(b, position="first")

        self.assertEqual(calls, [(a, b, None), (b, None, a)])
        self.assertEqual(self.list_titles(), list("abcd"))

    def test_payload_reports_reorderable(self):
        request = mock.Mock(user=self.create_user("view_track", username="viewer"))
        payload = AdminSerializer(admin_site._registry[Track]).serialize(request)
        self.assertFalse(payload["list"]["reorderable"])

        request.user = self.create_user(superuser=True, username="root")
        payload = AdminSerializer(admin_site._registry[Track]).serialize(request)
        self.assertTrue(payload["list"]["reorderable"])

        inlines = AdminSerializer(admin_site._registry[Article]).serialize(request)[
            "edit"
        ]["inlines"]
        self.assertEqual(
            {inline["model"]: inline["reorderable"] for inline in inlines},
            {"testapp.review": False, "testapp.step": True},
        )


class InlineMoveTests(AuthenticatedTestCase):
    def setUp(self):
        self.client = self.client_for(self.create_user(superuser=True))
        self.article = Article.objects.create(title="article")
        self.other = Article.objects.create(title="other")
        # A fresh ManualOrderModel table: every order key is 0.
        self.steps = [Step.objects.create(article=self.article, text=t) for t in "abc"]
        self.stranger = Step.objects.create(article=self.other, text="x")

    def list_texts(self):
        response = self.client.get(STEPS, {"article_id": self.article.pk})
        return [row["__str__"] for row in response.json()["results"]]

    def test_inline_rows_move_within_their_parent(self):
        a, b, c = self.steps

        response = self.client.post(
            f"{STEPS}/{c.pk}/move", {"position": "first"}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.list_texts(), list("cab"))
        self.stranger.refresh_from_db()
        self.assertEqual(self.stranger.order_key, 0)

    def test_rows_of_another_parent_are_refused(self):
        a, *_ = self.steps

        response = self.client.post(
            f"{STEPS}/{a.pk}/move", {"after": self.stranger.pk}, format="json"
        )

        self.assertEqual(response.status_code, 400)


class ReorderCheckTests(TestCase):
    def studio(self, **attrs):
        return type("TrackStudio", (TrackAdmin,), attrs)(Track, admin_site)

    def test_valid_configuration(self):
        self.assertEqual(reorder_errors(self.studio()), [])
        self.assertEqual(reorder_ordering_warnings(self.studio()), [])
        self.assertEqual(reorder_errors(admin_site._registry[Article]), [])

    def test_unknown_field(self):
        errors = reorder_errors(self.studio(reorder_field="nope"))

        self.assertEqual([check_id for check_id, _ in errors], ["content_studio.E017"])

    def test_non_numeric_field_needs_a_reorder_override(self):
        errors = reorder_errors(self.studio(reorder_field="title"))
        self.assertEqual([check_id for check_id, _ in errors], ["content_studio.E017"])

        def reorder(self, request, obj, *, after=None, before=None):
            pass

        self.assertEqual(
            reorder_errors(self.studio(reorder_field="title", reorder=reorder)), []
        )

    def test_unknown_scope_field(self):
        errors = reorder_errors(self.studio(reorder_scope=["nope"]))

        self.assertEqual([check_id for check_id, _ in errors], ["content_studio.E017"])

    def test_inlines_are_checked(self):
        class BadInline(InlineModelStudio):
            model = Step
            reorder_field = "text"

        errors = reorder_errors(self.studio(inlines=[BadInline]))

        self.assertEqual([check_id for check_id, _ in errors], ["content_studio.E017"])

    def test_ordering_that_contradicts_the_reorder_field(self):
        warnings = reorder_ordering_warnings(self.studio(ordering=["title"]))
        self.assertEqual(
            [check_id for check_id, _ in warnings], ["content_studio.W013"]
        )

        self.assertEqual(
            reorder_ordering_warnings(
                self.studio(ordering=["category", "position", "pk"])
            ),
            [],
        )
        self.assertEqual(
            len(reorder_ordering_warnings(self.studio(ordering=["-position"]))), 1
        )
