"""
Tests for duplicate (save as new): a studio with allow_duplication
offers the create form prefilled with a copy of an object, and saving
it copies the duplicate_inlines' rows along.

Copied: regular values, foreign keys, BlockField content and plain
many-to-many fields. Not copied: the pk, read-only, excluded and
non-editable fields, one-to-one fields, files, many-to-many fields with
a through model (copied as inlines) and unique fields, except slugs and
URL paths, which get a free suffix.
"""

from unittest import mock

from django.contrib.admin.models import ADDITION, LogEntry
from django.contrib.auth import models as auth_models
from django.core import checks
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory

from content_studio.admin import AdminSerializer, InlineModelStudio, admin_site
from content_studio.checks import check_content_studio
from content_studio.duplication import get_free_value
from content_studio.signals import content_changed
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.admin import PartInline
from tests.testapp.models import (
    Article,
    Category,
    Label,
    LandingPage,
    Page,
    Part,
    Product,
    ProductComment,
    ProductSupplier,
    SiteSettings,
)

PRODUCTS = "/api/content/testapp.product"


def studio(model=Product):
    return admin_site._registry[model]


class DuplicationTestCase(TestCase):
    def create_user(self, *permissions, username="staff"):
        user = auth_models.User.objects.create_user(
            username=username, password="x", is_staff=True
        )
        user.user_permissions.set(
            auth_models.Permission.objects.filter(codename__in=permissions)
        )
        return user

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
        return client

    def setUp(self):
        self.superuser = auth_models.User.objects.create_superuser(
            username="admin", password="x"
        )
        self.client = self.client_for(self.superuser)
        self.category = Category.objects.create(name="Tools")
        self.tag = Category.objects.create(name="Sale")
        self.label = Label.objects.create(code="acme", name="Acme")
        self.product = Product.objects.create(
            title="Hammer",
            slug="hammer",
            path="/tools/hammer",
            sku="H-1",
            details={"weight": 2},
            category=self.category,
            featured=self.tag,
            manual="manuals/hammer.pdf",
            internal_note="Internal",
            secret="Secret",
            imported_at=timezone.now(),
        )
        self.product.tags.set([self.tag])

    def duplicate(self, product=None, client=None):
        product = product or self.product
        return (client or self.client).get(f"{PRODUCTS}/{product.pk}/duplicate")

    def create_copy(self, data, source=None, client=None):
        source = source or self.product
        return (client or self.client).post(
            f"{PRODUCTS}?duplicate_of={source.pk}", data, format="json"
        )


class DuplicateInitialTests(DuplicationTestCase):
    def test_copies_regular_values_relations_and_plain_many_to_many(self):
        response = self.duplicate()

        self.assertEqual(response.status_code, 200)
        initial = response.json()["initial"]
        self.assertEqual(initial["title"], "Hammer")
        self.assertEqual(initial["details"], {"weight": 2})
        self.assertEqual(
            initial["category"], {"id": self.category.pk, "__str__": "Tools"}
        )
        self.assertEqual(initial["tags"], [{"id": self.tag.pk, "__str__": "Sale"}])

    def test_describes_the_source(self):
        self.assertEqual(
            self.duplicate().json()["source"],
            {"id": self.product.pk, "__str__": "Hammer"},
        )

    def test_leaves_out_what_is_never_copied(self):
        initial = self.duplicate().json()["initial"]

        for name in (
            "id",
            # Unique without a suffix.
            "sku",
            # One-to-one and files.
            "featured",
            "manual",
            # Read-only, excluded and non-editable.
            "internal_note",
            "secret",
            "imported_at",
            "removed_at",
            # Many-to-many with a through model: an inline.
            "suppliers",
        ):
            self.assertNotIn(name, initial)

    def test_slugs_and_url_paths_get_a_free_suffix(self):
        initial = self.duplicate().json()["initial"]

        self.assertEqual(initial["slug"], "hammer-2")
        self.assertEqual(initial["path"], "/tools/hammer-2")

    def test_suffix_skips_taken_values(self):
        Product.objects.create(title="Copy", slug="hammer-2")
        Product.objects.create(title="Copy", slug="hammer-3")

        self.assertEqual(self.duplicate().json()["initial"]["slug"], "hammer-4")

    def test_trashed_objects_occupy_their_values(self):
        Product.objects.create(
            title="Trashed", slug="hammer-2", removed_at=timezone.now()
        )

        self.assertEqual(self.duplicate().json()["initial"]["slug"], "hammer-3")

    def test_a_suffixed_copy_continues_the_count(self):
        copy = Product.objects.create(title="Copy", slug="hammer-2")

        self.assertEqual(
            self.duplicate(copy).json()["initial"]["slug"],
            "hammer-3",
        )

    def test_a_number_that_is_part_of_the_value_is_kept(self):
        product = Product.objects.create(title="Model", slug="model-2024")

        self.assertEqual(
            self.duplicate(product).json()["initial"]["slug"],
            "model-2024-2",
        )

    def test_suffix_respects_max_length(self):
        product = Product.objects.create(title="Long", slug="a" * 20)

        slug = self.duplicate(product).json()["initial"]["slug"]

        self.assertEqual(slug, "a" * 18 + "-2")

    def test_empty_slug_stays_empty(self):
        Product.objects.filter(pk=self.product.pk).update(path=None)

        self.assertIsNone(self.duplicate().json()["initial"].get("path"))

    def test_block_field_content_is_copied(self):
        page = LandingPage.objects.create(
            title="Home",
            body=[
                {"type": "category_link", "data": {"category": self.tag.pk}},
            ],
        )

        with mock.patch.object(studio(LandingPage), "allow_duplication", True):
            response = self.client.get(
                f"/api/content/testapp.landingpage/{page.pk}/duplicate"
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()["initial"]["body"]
        self.assertEqual(body[0]["type"], "category_link")
        self.assertEqual(
            body[0]["data"]["category"], {"id": self.tag.pk, "__str__": "Sale"}
        )

    def test_only_fields_of_the_create_form_are_copied(self):
        article = Article.objects.create(title="News", views=12)

        with mock.patch.object(studio(Article), "allow_duplication", True):
            response = self.client.get(
                f"/api/content/testapp.article/{article.pk}/duplicate"
            )

        initial = response.json()["initial"]
        self.assertEqual(initial["title"], "News")
        # Not on the article's edit page.
        self.assertNotIn("views", initial)

    def test_the_source_is_not_changed(self):
        self.duplicate()

        self.product.refresh_from_db()
        self.assertEqual(self.product.slug, "hammer")
        self.assertEqual(Product.objects.count(), 1)


class DuplicateHookTests(DuplicationTestCase):
    def test_get_duplicate_initial_adjusts_the_values(self):
        def get_duplicate_initial(request, obj):
            initial = type(studio()).get_duplicate_initial(studio(), request, obj)
            initial["title"] = f"Copy of {obj.title}"
            initial["category"] = None
            # Fields the create form does not write are dropped.
            initial["internal_note"] = "Ignored"
            return initial

        with mock.patch.object(
            studio(), "get_duplicate_initial", get_duplicate_initial
        ):
            initial = self.duplicate().json()["initial"]

        self.assertEqual(initial["title"], "Copy of Hammer")
        self.assertIsNone(initial["category"])
        self.assertNotIn("internal_note", initial)
        self.assertEqual(initial["slug"], "hammer-2")

    def test_hook_receives_the_request_and_object(self):
        calls = []

        def get_duplicate_initial(request, obj):
            calls.append((request.user, obj))
            return {}

        with mock.patch.object(
            studio(), "get_duplicate_initial", get_duplicate_initial
        ):
            self.assertEqual(self.duplicate().json()["initial"], {})

        self.assertEqual(calls, [(self.superuser, self.product)])


class DuplicateAvailabilityTests(DuplicationTestCase):
    def test_off_by_default(self):
        article = Article.objects.create(title="News")

        response = self.client.get(
            f"/api/content/testapp.article/{article.pk}/duplicate"
        )

        self.assertEqual(response.status_code, 404)

    def test_not_available_for_singletons(self):
        settings = SiteSettings.objects.create()

        with mock.patch.object(studio(SiteSettings), "allow_duplication", True):
            response = self.client.get(
                f"/api/content/testapp.sitesettings/{settings.pk}/duplicate"
            )
            self.assertEqual(response.status_code, 404)

            serialized = AdminSerializer(studio(SiteSettings)).serialize(self.request())

        self.assertFalse(serialized["edit"]["duplicate"])

    def request(self):
        request = APIRequestFactory().get("/")
        request.user = self.superuser
        return request

    def test_serialized_for_the_edit_page(self):
        serialized = AdminSerializer(studio()).serialize(self.request())
        self.assertTrue(serialized["edit"]["duplicate"])

        serialized = AdminSerializer(studio(Article)).serialize(self.request())
        self.assertFalse(serialized["edit"]["duplicate"])

    def test_inline_endpoints_have_no_duplicate(self):
        part = Part.objects.create(product=self.product, name="Head", code="head")

        response = self.client.get(
            f"/api/inlines/testapp.product/testapp.part/{part.pk}/duplicate"
        )

        self.assertEqual(response.status_code, 404)

    def test_trashed_objects_cannot_be_duplicated(self):
        Product.objects.filter(pk=self.product.pk).update(removed_at=timezone.now())

        self.assertEqual(self.duplicate().status_code, 404)


class DuplicatePermissionTests(DuplicationTestCase):
    def test_requires_add_permission(self):
        viewer = self.client_for(self.create_user("view_product"))

        self.assertEqual(self.duplicate(client=viewer).status_code, 403)

    def test_requires_view_permission(self):
        adder = self.client_for(self.create_user("add_product"))

        self.assertEqual(self.duplicate(client=adder).status_code, 403)

    def test_add_and_view_permission_suffice(self):
        editor = self.client_for(self.create_user("add_product", "view_product"))

        self.assertEqual(self.duplicate(client=editor).status_code, 200)

    def test_per_object_view_permission_applies(self):
        with mock.patch.object(
            studio(),
            "has_view_permission",
            lambda request, obj=None: obj is None,
        ):
            self.assertEqual(self.duplicate().status_code, 403)

    def test_saving_needs_view_permission_on_the_source(self):
        with mock.patch.object(
            studio(),
            "has_view_permission",
            lambda request, obj=None: obj is None,
        ):
            response = self.create_copy({"title": "Copy", "slug": "copy"})

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Product.objects.filter(slug="copy").exists())

    def test_saving_needs_add_permission(self):
        viewer = self.client_for(self.create_user("view_product"))

        response = self.create_copy({"title": "Copy", "slug": "copy"}, client=viewer)

        self.assertEqual(response.status_code, 403)


class DuplicateSaveTests(DuplicationTestCase):
    def setUp(self):
        super().setUp()
        Part.objects.create(product=self.product, name="Head", code="head")
        Part.objects.create(product=self.product, name="Handle", code="handle")
        ProductSupplier.objects.create(
            product=self.product, label=self.label, note="Main"
        )
        ProductComment.objects.create(product=self.product, text="Nice")

    def test_saving_copies_the_duplicate_inlines(self):
        response = self.create_copy({"title": "Hammer 2", "slug": "hammer-2"})

        self.assertEqual(response.status_code, 201, response.content)
        copy = Product.objects.get(pk=response.json()["id"])

        self.assertEqual(
            sorted(copy.part_set.values_list("name", "code")),
            [("Handle", "handle-2"), ("Head", "head-2")],
        )
        self.assertEqual(list(copy.suppliers.all()), [self.label])
        self.assertEqual(copy.productsupplier_set.get().note, "Main")
        # Not in duplicate_inlines.
        self.assertFalse(copy.productcomment_set.exists())
        # The source keeps its rows.
        self.assertEqual(self.product.part_set.count(), 2)

    def test_values_come_from_the_form(self):
        response = self.create_copy(
            {
                "title": "Mallet",
                "slug": "mallet",
                "tags": [],
                "category": {"id": self.tag.pk},
            }
        )

        copy = Product.objects.get(pk=response.json()["id"])
        self.assertEqual(copy.title, "Mallet")
        self.assertEqual(copy.category, self.tag)
        self.assertFalse(copy.tags.exists())
        self.assertEqual(copy.manual.name, "")

    def test_normal_validation_runs(self):
        response = self.create_copy({"title": "Copy", "slug": "hammer"})

        self.assertEqual(response.status_code, 400)
        self.assertIn("slug", response.json())
        self.assertEqual(Part.objects.count(), 2)

    def test_inline_rows_only_copied_with_add_permission_on_the_inline(self):
        with mock.patch.object(
            PartInline, "has_add_permission", lambda self, request, obj=None: False
        ):
            response = self.create_copy({"title": "Copy", "slug": "copy"})

        copy = Product.objects.get(pk=response.json()["id"])
        self.assertFalse(copy.part_set.exists())
        self.assertTrue(copy.productsupplier_set.exists())

    def test_a_failing_inline_copy_saves_nothing(self):
        # Every free code is taken by the time the row is saved.
        with mock.patch(
            "content_studio.duplication.get_free_value", return_value="head"
        ):
            response = self.create_copy({"title": "Copy", "slug": "copy"})

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Product.objects.filter(slug="copy").exists())
        self.assertEqual(Part.objects.count(), 2)

    def test_creation_is_recorded_and_signaled(self):
        received = []

        def receiver(sender, changes, **kwargs):
            received.extend(changes)

        content_changed.connect(receiver)
        try:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.create_copy({"title": "Copy", "slug": "copy"})
        finally:
            content_changed.disconnect(receiver)

        copy = Product.objects.get(pk=response.json()["id"])
        entry = LogEntry.objects.get(
            object_id=str(copy.pk), content_type__model="product"
        )
        self.assertEqual(entry.action_flag, ADDITION)
        self.assertEqual(entry.change_message, "Duplicated from Hammer.")

        self.assertEqual(
            [(change.action, change.model) for change in received],
            [("created", Product)]
            + [("created", Part)] * 2
            + [("created", ProductSupplier)],
        )

    def test_unknown_source_is_rejected(self):
        response = self.client.post(
            f"{PRODUCTS}?duplicate_of=999999",
            {"title": "Copy", "slug": "copy"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Product.objects.filter(slug="copy").exists())

    def test_invalid_source_is_rejected(self):
        response = self.client.post(
            f"{PRODUCTS}?duplicate_of=nope",
            {"title": "Copy", "slug": "copy"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_models_without_duplication_reject_a_source(self):
        article = Article.objects.create(title="News")

        response = self.client.post(
            f"/api/content/testapp.article?duplicate_of={article.pk}",
            {"title": "Copy"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Article.objects.count(), 1)

    def test_a_regular_create_is_unaffected(self):
        response = self.client.post(
            PRODUCTS, {"title": "Saw", "slug": "saw"}, format="json"
        )

        self.assertEqual(response.status_code, 201)
        copy = Product.objects.get(slug="saw")
        self.assertFalse(copy.part_set.exists())
        self.assertEqual(
            LogEntry.objects.get(object_id=str(copy.pk)).change_message, ""
        )


@override_settings(
    CONTENT_STUDIO={
        "ADMIN_SITE": "content_studio.admin.admin_site",
        "TENANT_MODEL": "tests.testapp.models.Category",
    }
)
class DuplicateTenantTests(DuplicationTestCase):
    def test_free_suffix_is_scoped_to_the_tenant(self):
        a = Category.objects.create(name="a")
        b = Category.objects.create(name="b")
        Page.objects.create(title="Hello", slug="hello", category=a)
        Page.objects.create(title="Elsewhere", slug="hello-2", category=b)

        request = APIRequestFactory().get("/", HTTP_X_DCS_TENANT=str(a.pk))
        request.user = self.superuser
        field = Page._meta.get_field("slug")

        self.assertEqual(get_free_value(request, Page, field, "hello"), "hello-2")

        request = APIRequestFactory().get("/", HTTP_X_DCS_TENANT=str(b.pk))
        request.user = self.superuser
        self.assertEqual(get_free_value(request, Page, field, "hello"), "hello-3")


class DuplicationCheckTests(TestCase):
    def messages(self, check_id):
        return [m for m in check_content_studio() if m.id == check_id]

    def test_valid_configuration_passes(self):
        self.assertEqual(self.messages("content_studio.E021"), [])
        self.assertEqual(self.messages("content_studio.W014"), [])

    def test_duplicate_inlines_must_be_inlines_of_the_studio(self):
        class OtherInline(InlineModelStudio):
            model = Part

        with mock.patch.object(
            studio(), "duplicate_inlines", [PartInline, OtherInline]
        ):
            messages = self.messages("content_studio.E021")

        self.assertEqual(len(messages), 1)
        self.assertIsInstance(messages[0], checks.Error)
        self.assertIn("OtherInline", messages[0].msg)

    def test_duplicate_inlines_must_be_a_list(self):
        with mock.patch.object(studio(), "duplicate_inlines", PartInline):
            self.assertEqual(len(self.messages("content_studio.E021")), 1)

    def test_duplicate_inlines_without_allow_duplication(self):
        with mock.patch.object(studio(), "allow_duplication", False):
            messages = self.messages("content_studio.W014")

        self.assertEqual(len(messages), 1)
        self.assertIn("allow_duplication", messages[0].msg)

    def test_allow_duplication_on_a_singleton(self):
        with mock.patch.object(studio(SiteSettings), "allow_duplication", True):
            messages = self.messages("content_studio.W014")

        self.assertEqual(len(messages), 1)
        self.assertIn("singletons", messages[0].msg)
