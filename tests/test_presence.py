"""
Tests for presence: the edit page's heartbeat records which users have
an object open, the list page asks for a page of objects at once.
Entries live in the cache, scoped to the tenant for tenant-scoped
models, and are only answered for objects the user may view.
"""

from unittest import mock

from django.contrib.auth import models as auth_models
from django.core import checks
from django.core.cache import caches
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from content_studio import presence
from content_studio.admin import AdminSerializer, admin_site
from content_studio.checks import check_content_studio, check_presence_deployment
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.models import Article, Category, Page, Review, SiteSettings

ARTICLES = "/api/content/testapp.article"
PAGES = "/api/content/testapp.page"


def studio(model=Article):
    return admin_site._registry[model]


class PresenceTestCase(TestCase):
    def setUp(self):
        caches["default"].clear()
        self.eva = self.create_user(
            "view_article", "view_page", username="eva", first_name="Eva"
        )
        self.noah = self.create_user("view_article", "view_page", username="noah")
        self.article = Article.objects.create(title="Spring sale")

    def tearDown(self):
        caches["default"].clear()

    def create_user(self, *permissions, username, first_name=""):
        user = auth_models.User.objects.create_user(
            username=username,
            password="x",
            is_staff=True,
            first_name=first_name,
            last_name="de Jong" if first_name else "",
        )
        user.user_permissions.set(
            auth_models.Permission.objects.filter(codename__in=permissions)
        )
        return user

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
        return client

    def beat(self, user, obj=None, state="viewing", session="tab", url=ARTICLES, **kw):
        obj = obj or self.article
        return self.client_for(user).post(
            f"{url}/{obj.pk}/presence",
            {"session": session, "state": state},
            format="json",
            **kw,
        )

    def listing(self, user, *ids, url=ARTICLES, **kw):
        return self.client_for(user).get(f"{url}/presence", {"id": ids}, **kw)


class HeartbeatTests(PresenceTestCase):
    def test_answers_the_other_users(self):
        response = self.beat(self.eva)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"users": []})

        response = self.beat(self.noah, state="editing")

        self.assertEqual(
            response.json(),
            {
                "users": [
                    {
                        "id": self.eva.pk,
                        "name": "Eva de Jong",
                        "initials": "",
                        "avatar": None,
                        "state": "viewing",
                    }
                ]
            },
        )

        users = self.beat(self.eva).json()["users"]

        self.assertEqual(
            [(user["name"], user["state"]) for user in users], [("noah", "editing")]
        )

    def test_editing_users_come_first(self):
        carla = self.create_user("view_article", username="carla")
        self.beat(self.noah, state="viewing")
        self.beat(carla, state="editing")

        users = self.beat(self.eva).json()["users"]

        self.assertEqual([user["name"] for user in users], ["carla", "noah"])

    def test_one_entry_per_user_editing_wins(self):
        self.beat(self.noah, session="first", state="viewing")
        self.beat(self.noah, session="second", state="editing")

        users = self.beat(self.eva).json()["users"]

        self.assertEqual(len(users), 1)
        self.assertEqual(users[0]["state"], "editing")

    def test_leaving_clears_the_session(self):
        self.beat(self.noah, session="first")
        self.beat(self.noah, session="second")
        client = self.client_for(self.noah)

        response = client.delete(f"{ARTICLES}/{self.article.pk}/presence?session=first")

        self.assertEqual(response.status_code, 204)
        # The second tab is still open.
        self.assertEqual(len(self.beat(self.eva).json()["users"]), 1)

        client.delete(f"{ARTICLES}/{self.article.pk}/presence?session=second")

        self.assertEqual(self.beat(self.eva).json()["users"], [])

    def test_entries_expire(self):
        with mock.patch("content_studio.presence.time.time", return_value=1000):
            self.beat(self.noah)

        with mock.patch(
            "content_studio.presence.time.time",
            return_value=1000 + presence.PRESENCE_TIMEOUT + 1,
        ):
            self.assertEqual(self.beat(self.eva).json()["users"], [])

    def cached_sessions(self):
        key = presence.get_cache_key("", Article, self.article.pk)
        return list(caches["default"].get(key))

    def test_sessions_per_user_are_capped(self):
        for i in range(presence.MAX_SESSIONS_PER_USER + 3):
            with mock.patch("content_studio.presence.time.time", return_value=1000 + i):
                self.beat(self.noah, session=f"tab{i}")

        with mock.patch("content_studio.presence.time.time", return_value=1010):
            self.beat(self.eva)
            sessions = self.cached_sessions()

        noah = [key for key in sessions if key.startswith(f"{self.noah.pk}:")]
        self.assertEqual(
            sorted(noah),
            sorted(
                f"{self.noah.pk}:tab{i}"
                for i in range(3, presence.MAX_SESSIONS_PER_USER + 3)
            ),
        )
        self.assertIn(f"{self.eva.pk}:tab", sessions)

    def test_entries_per_object_are_capped(self):
        users = [self.create_user("view_article", username=f"u{i}") for i in range(4)]

        with mock.patch.object(presence, "MAX_ENTRIES", 3):
            for i, user in enumerate(users):
                with mock.patch(
                    "content_studio.presence.time.time", return_value=1000 + i
                ):
                    self.beat(user)
                    sessions = self.cached_sessions()

        self.assertEqual(sorted(sessions), sorted(f"{u.pk}:tab" for u in users[1:]))

    def test_validates_the_state_and_session(self):
        self.assertEqual(self.beat(self.eva, state="locked").status_code, 400)
        self.assertEqual(self.beat(self.eva, session="").status_code, 400)
        self.assertEqual(self.beat(self.eva, session="x" * 65).status_code, 400)

        response = self.client_for(self.eva).delete(
            f"{ARTICLES}/{self.article.pk}/presence"
        )

        self.assertEqual(response.status_code, 400)

    def test_requires_view_permission(self):
        stranger = self.create_user(username="stranger")

        self.assertEqual(self.beat(stranger).status_code, 403)

    def test_requires_view_permission_on_the_object(self):
        with mock.patch.object(
            studio(),
            "has_view_permission",
            lambda request, obj=None: obj is None,
        ):
            response = self.beat(self.eva)

        self.assertEqual(response.status_code, 403)

    def test_view_permission_is_enough(self):
        # Neither add nor change permission is needed to announce.
        self.assertEqual(self.beat(self.eva).status_code, 200)

    def test_unknown_object(self):
        response = self.client_for(self.eva).post(
            f"{ARTICLES}/999/presence",
            {"session": "tab", "state": "viewing"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    def test_singleton(self):
        settings = SiteSettings.objects.create()
        admin = auth_models.User.objects.create_superuser(username="admin")

        response = self.client_for(admin).post(
            f"/api/content/testapp.sitesettings/{settings.pk}/presence",
            {"session": "tab", "state": "viewing"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)

    def test_inline_endpoints_have_no_presence(self):
        admin = auth_models.User.objects.create_superuser(username="admin")
        review = Review.objects.create(article=self.article, text="Good")

        response = self.client_for(admin).post(
            f"/api/inlines/testapp.article/testapp.review/{review.pk}/presence",
            {"session": "tab", "state": "viewing"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)


class ListTests(PresenceTestCase):
    def test_answers_the_objects_others_have_open(self):
        other = Article.objects.create(title="Summer sale")
        quiet = Article.objects.create(title="Autumn sale")
        self.beat(self.noah, state="editing")
        self.beat(self.noah, obj=other)
        # The user's own entries are left out.
        self.beat(self.eva, obj=quiet)

        response = self.listing(
            self.eva, self.article.pk, other.pk, quiet.pk, "not-a-pk"
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(set(data), {str(self.article.pk), str(other.pk)})
        self.assertEqual(data[str(self.article.pk)][0]["state"], "editing")
        self.assertEqual(data[str(other.pk)][0]["state"], "viewing")

    def test_nobody(self):
        self.assertEqual(self.listing(self.eva, self.article.pk).json(), {})
        self.assertEqual(self.listing(self.eva).json(), {})

    def test_leaves_out_objects_the_user_may_not_view(self):
        hidden = Article.objects.create(title="Hidden")
        self.beat(self.noah)
        self.beat(self.noah, obj=hidden)

        with mock.patch.object(
            studio(),
            "has_view_permission",
            lambda request, obj=None: obj is None or obj.pk != hidden.pk,
        ):
            data = self.listing(self.eva, self.article.pk, hidden.pk).json()

        self.assertEqual(set(data), {str(self.article.pk)})

    def test_requires_view_permission(self):
        stranger = self.create_user(username="stranger")

        self.assertEqual(self.listing(stranger, self.article.pk).status_code, 403)

    def test_leaves_out_trashed_objects(self):
        from django.utils import timezone

        page = Page.objects.create(title="About", slug="about")
        self.beat(self.noah, obj=page, url=PAGES)
        Page.objects.filter(pk=page.pk).update(removed_at=timezone.now())

        self.assertEqual(self.listing(self.eva, page.pk, url=PAGES).json(), {})


@override_settings(
    CONTENT_STUDIO={
        "ADMIN_SITE": "content_studio.admin.admin_site",
        "TENANT_MODEL": "tests.testapp.models.Category",
    }
)
class TenantTests(PresenceTestCase):
    def setUp(self):
        super().setUp()
        self.a = Category.objects.create(name="a")
        self.b = Category.objects.create(name="b")
        self.page = Page.objects.create(title="About", slug="about", category=self.a)

    def test_scoped_to_the_tenant(self):
        tenant_a = {"HTTP_X_DCS_TENANT": str(self.a.pk)}
        self.beat(self.noah, obj=self.page, url=PAGES, **tenant_a)

        self.assertEqual(
            len(
                self.beat(self.eva, obj=self.page, url=PAGES, **tenant_a).json()[
                    "users"
                ]
            ),
            1,
        )
        # In another tenant the page is not found at all.
        self.assertEqual(
            self.beat(
                self.eva, obj=self.page, url=PAGES, HTTP_X_DCS_TENANT=str(self.b.pk)
            ).status_code,
            404,
        )
        self.assertEqual(
            self.listing(
                self.eva, self.page.pk, url=PAGES, HTTP_X_DCS_TENANT=str(self.b.pk)
            ).json(),
            {},
        )
        self.assertEqual(
            set(self.listing(self.eva, self.page.pk, url=PAGES, **tenant_a).json()),
            {str(self.page.pk)},
        )

    def test_keys_differ_per_tenant(self):
        self.assertNotEqual(
            presence.get_cache_key("1", Page, 1), presence.get_cache_key("2", Page, 1)
        )

    def test_unauthorized_tenant_is_rejected(self):
        with mock.patch.object(
            admin_site,
            "get_tenants",
            lambda tenant_model, **kwargs: tenant_model.objects.filter(pk=self.b.pk),
        ):
            response = self.beat(
                self.eva,
                obj=self.page,
                url=PAGES,
                HTTP_X_DCS_TENANT=str(self.a.pk),
            )

        self.assertEqual(response.status_code, 403)


class OptOutTests(PresenceTestCase):
    def test_studio_opt_out(self):
        with mock.patch.object(studio(), "presence", False):
            self.assertEqual(self.beat(self.eva).status_code, 404)
            self.assertEqual(self.listing(self.eva, self.article.pk).status_code, 404)
            self.assertFalse(
                AdminSerializer(studio()).serialize(mock.Mock())["presence"]
            )

    def test_setting_off(self):
        with override_settings(
            CONTENT_STUDIO={
                "ADMIN_SITE": "content_studio.admin.admin_site",
                "PRESENCE": False,
            }
        ):
            self.assertEqual(self.beat(self.eva).status_code, 404)
            self.assertFalse(
                AdminSerializer(studio()).serialize(mock.Mock())["presence"]
            )

    def test_on_by_default(self):
        self.assertTrue(AdminSerializer(studio()).serialize(mock.Mock())["presence"])

    def test_custom_cache_alias(self):
        with override_settings(
            CACHES={
                "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
                "presence": {
                    "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
                    "LOCATION": "presence",
                },
            },
            CONTENT_STUDIO={
                "ADMIN_SITE": "content_studio.admin.admin_site",
                "PRESENCE_CACHE": "presence",
            },
        ):
            self.beat(self.noah)

            self.assertEqual(len(self.beat(self.eva).json()["users"]), 1)
            key = presence.get_cache_key("", Article, self.article.pk)
            self.assertIsNone(caches["default"].get(key))
            self.assertIsNotNone(caches["presence"].get(key))
            caches["presence"].clear()


def check_ids(messages):
    return [
        message.id for message in messages if message.id.startswith("content_studio.")
    ]


class CheckTests(TestCase):
    def test_unknown_cache_alias(self):
        with override_settings(
            CONTENT_STUDIO={
                "ADMIN_SITE": "content_studio.admin.admin_site",
                "PRESENCE_CACHE": "missing",
            }
        ):
            self.assertIn("content_studio.E023", check_ids(check_content_studio()))

    def test_dummy_cache(self):
        with override_settings(
            CACHES={
                "default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}
            }
        ):
            self.assertIn("content_studio.W016", check_ids(check_content_studio()))

        with override_settings(
            CACHES={
                "default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}
            },
            CONTENT_STUDIO={
                "ADMIN_SITE": "content_studio.admin.admin_site",
                "PRESENCE": False,
            },
        ):
            self.assertNotIn("content_studio.W016", check_ids(check_content_studio()))

    def test_local_memory_cache_is_a_deployment_warning(self):
        with override_settings(
            CACHES={
                "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
            }
        ):
            self.assertEqual(
                check_ids(check_presence_deployment()), ["content_studio.W017"]
            )
            # Not part of the regular checks.
            self.assertNotIn("content_studio.W017", check_ids(check_content_studio()))
            self.assertIn(
                "content_studio.W017",
                check_ids(checks.run_checks(include_deployment_checks=True)),
            )
            self.assertNotIn("content_studio.W017", check_ids(checks.run_checks()))

    def test_shared_cache_passes(self):
        with override_settings(
            CACHES={
                "default": {
                    "BACKEND": "django.core.cache.backends.db.DatabaseCache",
                    "LOCATION": "cache_table",
                }
            }
        ):
            self.assertEqual(check_ids(check_presence_deployment()), [])
            self.assertEqual(
                [
                    message
                    for message in check_ids(check_content_studio())
                    if message in ("content_studio.E023", "content_studio.W016")
                ],
                [],
            )
