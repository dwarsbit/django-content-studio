"""
Tests for ModelStudio.get_queryset(request): the objects a studio works
with for a request. Narrowing it hides objects from the list, single
object endpoints, the export, the site search, relation pickers, saves
of relations and the parents of inlines.
"""

from unittest import mock

from django.contrib.auth import models as auth_models

from content_studio.admin import ModelStudio
from tests.test_e2e_crud import AuthenticatedTestCase
from tests.testapp.admin import ArticleAdmin, CategoryAdmin
from tests.testapp.models import Article, Category, Product, Review


def own_categories(self, request):
    """Editors see the categories whose name starts with their username."""
    return ModelStudio.get_queryset(self, request).filter(
        name__startswith=request.user.username
    )


def own_articles(self, request):
    return ModelStudio.get_queryset(self, request).filter(author=request.user)


class StudioQuerysetTests(AuthenticatedTestCase):
    def setUp(self):
        self.user = self.create_user(superuser=True, username="dana")
        self.client = self.client_for(self.user)
        self.mine = Category.objects.create(name="dana's")
        self.other = Category.objects.create(name="someone else's")
        # The viewsets hold the studio instances made at startup: patch
        # the studio classes, not the registry.
        self.patcher = mock.patch.multiple(
            CategoryAdmin, get_queryset=own_categories, allow_export=True
        )
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()

    def test_the_list_and_the_export_show_the_studios_queryset(self):
        response = self.client.get("/api/content/testapp.category")
        ids = [row["id"] for row in response.json()["results"]]

        self.assertEqual(ids, [self.mine.pk])

        export = self.client.get("/api/content/testapp.category/export")
        body = b"".join(export.streaming_content).decode("utf-8-sig")

        self.assertIn("dana's", body)
        self.assertNotIn("someone else's", body)

    def test_an_object_outside_the_queryset_is_not_found(self):
        response = self.client.get(f"/api/content/testapp.category/{self.other.pk}")
        self.assertEqual(response.status_code, 404)

        response = self.client.patch(
            f"/api/content/testapp.category/{self.other.pk}",
            {"name": "taken over"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

        response = self.client.delete(f"/api/content/testapp.category/{self.other.pk}")
        self.assertEqual(response.status_code, 404)
        self.assertTrue(Category.objects.filter(pk=self.other.pk).exists())

    def test_the_site_search_searches_the_studios_queryset(self):
        response = self.client.get("/api/search", {"search": "'s"})
        group = next(g for g in response.json() if g["model"] == "testapp.category")

        self.assertEqual([item["id"] for item in group["results"]], [self.mine.pk])

    def test_relation_pickers_and_saves_use_the_related_studios_queryset(self):
        response = self.client.post(
            "/api/content/testapp.product/relations/category", {}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [str(item["id"]) for item in response.json()], [str(self.mine.pk)]
        )

        response = self.client.post(
            "/api/content/testapp.product",
            {"title": "Lamp", "slug": "lamp", "category": {"id": self.other.pk}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("category", response.json())

        response = self.client.post(
            "/api/content/testapp.product",
            {"title": "Lamp", "slug": "lamp", "category": {"id": self.mine.pk}},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Product.objects.get(slug="lamp").category, self.mine)

    def test_an_unchanged_relation_outside_the_queryset_is_kept(self):
        """An object that already refers to a hidden object stays
        editable: the form sends the relation back unchanged."""
        hidden_too = Category.objects.create(name="also someone else's")
        product = Product.objects.create(title="Lamp", slug="lamp", category=self.other)
        product.tags.set([self.other, self.mine])
        url = f"/api/content/testapp.product/{product.pk}"

        response = self.client.patch(
            url,
            {
                "title": "Lamp 2",
                "category": {"id": self.other.pk},
                "tags": [{"id": self.other.pk}, {"id": self.mine.pk}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.json())
        product.refresh_from_db()
        self.assertEqual(product.title, "Lamp 2")
        self.assertEqual(product.category, self.other)
        self.assertEqual(set(product.tags.all()), {self.other, self.mine})

        # Another hidden object cannot be picked, for either field.
        response = self.client.patch(
            url, {"category": {"id": hidden_too.pk}}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.patch(
            url, {"tags": [{"id": hidden_too.pk}]}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_inline_parents_come_from_the_parent_studios_queryset(self):
        other_user = auth_models.User.objects.create_user(
            username="other", password="x"
        )
        mine = Article.objects.create(title="mine", author=self.user)
        theirs = Article.objects.create(title="theirs", author=other_user)
        Review.objects.create(article=theirs, text="nice")
        with mock.patch.object(ArticleAdmin, "get_queryset", own_articles):
            response = self.client.get(
                "/api/inlines/testapp.article/testapp.review",
                {"article_id": theirs.pk},
            )
            self.assertIn(response.status_code, (403, 404))

            response = self.client.get(
                "/api/inlines/testapp.article/testapp.review",
                {"article_id": mine.pk},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["pagination"]["count"], 0)
