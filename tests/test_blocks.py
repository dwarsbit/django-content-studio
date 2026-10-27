"""
Tests for BlockField: block definitions, validation, saving, the admin's
field metadata and the API round trip.
"""

import datetime
from types import SimpleNamespace

import pytest
from django.core.exceptions import ValidationError
from django.db import connection, models
from django.template.loader import render_to_string
from django.test import override_settings
from django.test.utils import CaptureQueriesContext

from content_studio.blocks import Block, BlockErrors, BlockField, BlockList
from content_studio.serializers import ModelSerializer
from tests.test_e2e_crud import AuthenticatedTestCase
from tests.testapp.models import (
    Category,
    CategoryLinkBlock,
    LandingPage,
    TextBlock,
)

body_field = LandingPage._meta.get_field("body")


def text(body="<p>Hi</p>", **data):
    return {"type": "text", "data": {"body": body, **data}}


# Block definitions


def test_block_names_derive_from_the_class_name():
    assert TextBlock._meta.name == "text"
    assert TextBlock._meta.verbose_name == "Text"
    assert CategoryLinkBlock._meta.name == "category_link"
    assert CategoryLinkBlock._meta.verbose_name == "Category link"


def test_block_meta_sets_the_name_and_display():
    class QuoteBlock(Block):
        quote = models.TextField()

        class Meta:
            name = "pull_quote"
            verbose_name = "Pull quote"
            description = "A quote that stands out"
            icon = "ph-bold ph-quotes"

    assert QuoteBlock._meta.name == "pull_quote"
    assert QuoteBlock._meta.verbose_name == "Pull quote"
    assert QuoteBlock._meta.description == "A quote that stands out"
    assert QuoteBlock._meta.icon == "ph-bold ph-quotes"


def test_unknown_meta_options_raise():
    with pytest.raises(TypeError, match="template"):

        class BrokenBlock(Block):
            class Meta:
                template = "x.html"


def test_blocks_inherit_fields():
    class BaseBlock(Block):
        anchor = models.SlugField(blank=True)

    class SectionBlock(BaseBlock):
        title = models.CharField(max_length=20)

    assert list(SectionBlock.base_fields) == ["anchor", "title"]


def test_blocks_are_not_models():
    assert not issubclass(TextBlock, models.Model)
    assert not hasattr(TextBlock, "objects")


def test_blocks_are_left_out_of_migrations():
    _, _, _, kwargs = body_field.deconstruct()

    assert "blocks" not in kwargs
    assert "max_num" not in kwargs


# Validation


@pytest.mark.django_db
def test_clean_blocks_returns_the_stored_shape():
    category = Category.objects.create(name="News")

    cleaned = body_field.clean_blocks(
        [
            text(unknown="dropped"),
            {
                "id": "b2",
                "type": "category_link",
                "data": {"category": {"id": category.pk}, "published": "2026-03-01"},
            },
        ]
    )

    assert cleaned[0]["type"] == "text"
    assert cleaned[0]["id"]  # generated when missing
    assert cleaned[0]["data"] == {"heading": "", "body": "<p>Hi</p>"}
    assert cleaned[1] == {
        "id": "b2",
        "type": "category_link",
        "data": {"category": category.pk, "published": "2026-03-01"},
    }


@pytest.mark.parametrize(
    "value, message",
    [
        ({"type": "text"}, "Enter a list of blocks."),
        (["text"], "Block 1 is not a valid block."),
        ([{"type": "hero", "data": {}}], "Block 1 has an unknown type: hero."),
        (
            [{"id": "a", **text()}, {"id": "a", **text()}],
            "Block 2 has the same id as another block.",
        ),
        ([text()] * 4, "Use at most 3 blocks."),
    ],
)
def test_clean_blocks_rejects_invalid_lists(value, message):
    with pytest.raises(BlockErrors) as e:
        body_field.clean_blocks(value)

    assert e.value.errors == [message]


def test_min_num():
    field = BlockField(blocks=[TextBlock], min_num=2)

    with pytest.raises(BlockErrors) as e:
        field.clean_blocks([text()])

    assert e.value.errors == ["Add at least 2 blocks."]


@pytest.mark.django_db
def test_clean_blocks_reports_field_errors_per_block():
    with pytest.raises(BlockErrors) as e:
        body_field.clean_blocks(
            [
                text(),
                text(body="", heading="x" * 51),
                {"type": "category_link", "data": {"category": {"id": 999}}},
            ]
        )

    assert e.value.errors == {
        1: {
            "heading": ["Ensure this value has at most 50 characters (it has 51)."],
            "body": ["This field cannot be blank."],
        },
        2: {"category": ["Unknown related item."]},
    }


@pytest.mark.django_db
def test_full_clean_validates_and_cleans_blocks():
    page = LandingPage(title="Spring", body=[text(), text(body="")])

    with pytest.raises(ValidationError) as e:
        page.full_clean()

    assert e.value.message_dict == {
        "body": ["Block 2, body: This field cannot be blank."]
    }

    page.body = [text()]
    page.full_clean()

    assert page.body[0]["data"] == {"heading": "", "body": "<p>Hi</p>"}


@pytest.mark.django_db
def test_an_empty_list_is_blank():
    page = LandingPage(title="Spring", body=[])

    with pytest.raises(ValidationError) as e:
        page.full_clean()

    assert "body" in e.value.message_dict


@pytest.mark.django_db
def test_saving_sanitizes_html_in_blocks():
    page = LandingPage.objects.create(
        title="Spring",
        body=[{"id": "a", **text(body='<p onclick="x()">Hi<script>x()</script></p>')}],
    )
    page.refresh_from_db()

    assert page.body[0]["data"]["body"] == "<p>Hi</p>"


# Admin metadata


def test_field_metadata_describes_the_blocks():
    data = ModelSerializer(LandingPage).get_field(body_field)

    assert data["type"] == "BlockField"
    assert data["max_num"] == 3
    assert data["min_num"] is None

    text_block, link_block, columns_block = data["blocks"]
    assert text_block["name"] == "text"
    assert text_block["description"] == "Rich text"
    assert text_block["icon"] == "ph-bold ph-text-t"
    assert text_block["fields"]["body"]["type"] == "HTMLField"
    assert text_block["fields"]["body"]["required"] is True
    assert text_block["fields"]["heading"]["max_length"] == 50
    assert link_block["fields"]["category"]["related_model"] == "testapp.category"
    # A block field in a block describes its own blocks.
    left = columns_block["fields"]["left"]
    assert left["type"] == "BlockField"
    assert [block["name"] for block in left["blocks"]] == ["text", "category_link"]
    assert left["max_num"] == 2


# System checks


def check_ids(field):
    return [error.id for error in field._check_blocks()]


def test_valid_block_field_passes_checks():
    assert check_ids(body_field) == []


@pytest.mark.parametrize(
    "kwargs",
    [
        {"blocks": []},
        {"blocks": [object]},
        {"blocks": [TextBlock, TextBlock]},
        {"blocks": [TextBlock], "max_num": -1},
        {"blocks": [TextBlock], "min_num": 3, "max_num": 2},
    ],
)
def test_misconfigured_block_fields_fail_checks(kwargs):
    assert check_ids(BlockField(**kwargs)) == ["content_studio.E018"]


def test_unsupported_fields_in_blocks_fail_checks():
    class TaggedBlock(Block):
        categories = models.ManyToManyField(Category)

    assert check_ids(BlockField(blocks=[TaggedBlock])) == ["content_studio.E018"]


# The API


class BlockFieldApiTests(AuthenticatedTestCase):
    url = "/api/content/testapp.landingpage"

    def setUp(self):
        self.client = self.client_for(self.create_user(superuser=True))
        self.category = Category.objects.create(name="News")

    def test_relations_round_trip_in_the_admin_shape(self):
        response = self.client.post(
            self.url,
            {
                "title": "Spring",
                "body": [
                    {
                        "id": "a",
                        "type": "category_link",
                        "data": {"category": {"id": self.category.pk}},
                    }
                ],
            },
            format="json",
        )

        assert response.status_code == 201, response.json()
        page = LandingPage.objects.get()
        assert page.body[0]["data"]["category"] == self.category.pk

        response = self.client.get(f"{self.url}/{page.pk}")
        category = response.json()["body"][0]["data"]["category"]
        assert category == {"id": self.category.pk, "__str__": "News"}

    def test_deleted_related_objects_read_as_empty(self):
        page = LandingPage.objects.create(
            title="Spring",
            body=[
                {
                    "id": "a",
                    "type": "category_link",
                    "data": {"category": self.category.pk, "published": None},
                }
            ],
        )
        self.category.delete()

        response = self.client.get(f"{self.url}/{page.pk}")

        assert response.json()["body"][0]["data"]["category"] is None

    def test_block_errors_are_keyed_by_index(self):
        response = self.client.post(
            self.url,
            {"title": "Spring", "body": [text(), text(body="")]},
            format="json",
        )

        assert response.status_code == 400
        assert response.json() == {
            "body": {"1": {"data": {"body": ["This field cannot be blank."]}}}
        }

    def test_list_errors_are_a_list(self):
        response = self.client.post(
            self.url, {"title": "Spring", "body": [text()] * 4}, format="json"
        )

        assert response.status_code == 400
        assert response.json() == {"body": ["Use at most 3 blocks."]}

    def test_an_empty_body_is_rejected_when_not_blank(self):
        response = self.client.post(
            self.url, {"title": "Spring", "body": []}, format="json"
        )

        assert response.status_code == 400
        assert list(response.json()) == ["body"]

    def test_dates_are_stored_as_iso_strings(self):
        response = self.client.post(
            self.url,
            {
                "title": "Spring",
                "body": [
                    {
                        "type": "category_link",
                        "data": {
                            "category": {"id": self.category.pk},
                            "published": "2026-03-01",
                        },
                    }
                ],
            },
            format="json",
        )

        assert response.status_code == 201, response.json()
        data = LandingPage.objects.get().body[0]["data"]
        assert data["published"] == datetime.date(2026, 3, 1).isoformat()

    def test_relation_pickers_resolve_block_fields(self):
        response = self.client.post(
            f"{self.url}/relations/body.category_link.category",
            {"search": ""},
            format="json",
        )

        assert response.status_code == 200
        assert response.json() == [{"id": str(self.category.pk), "__str__": "News"}]

    def test_relation_pickers_reject_unknown_block_fields(self):
        for name in ["body.hero.image", "body.text.nope", "title.a.b", "body.text"]:
            response = self.client.post(
                f"{self.url}/relations/{name}", {"search": ""}, format="json"
            )

            assert response.status_code == 400, name


# Rendering

BLOCK_TEMPLATES = {
    "testapp/blocks/text.html": "<section>{{ value.heading }}|{{ value.body|safe }}</section>",
    "links/category.html": "<a>{{ value.category.name }} {{ value.published|date:'Y' }} {{ block.id }} {{ site }}</a>",
    "page.html": "{% load content_studio %}{% render_blocks page.body %}",
    "page_slice.html": "{% load content_studio %}{% render_blocks blocks %}",
}

TEMPLATE_SETTINGS = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "OPTIONS": {
            "loaders": [("django.template.loaders.locmem.Loader", BLOCK_TEMPLATES)],
        },
    }
]


class LinkBlock(Block):
    category = models.ForeignKey(Category, on_delete=models.CASCADE)
    published = models.DateField(null=True, blank=True)

    class Meta:
        name = "category_link"
        template_name = "links/category.html"


def test_template_names_default_to_the_app_and_block_name():
    assert TextBlock.get_template_name() == "testapp/blocks/text.html"
    assert LinkBlock.get_template_name() == "links/category.html"


@pytest.mark.django_db
def test_the_value_is_a_block_list():
    page = LandingPage(title="Spring", body=[text()])

    assert isinstance(page.body, BlockList)
    assert page.body == [text()]

    page.save()
    page.refresh_from_db()

    assert isinstance(page.body, BlockList)
    assert page.body.field is body_field


@pytest.mark.django_db
def test_blocks_have_python_values_and_related_objects():
    news, events = Category.objects.create(name="News"), Category.objects.create(
        name="Events"
    )
    gone = Category.objects.create(name="Gone")
    page = LandingPage(
        title="Spring",
        body=[
            {
                "id": "a",
                "type": "category_link",
                "data": {"category": news.pk, "published": "2026-03-01"},
            },
            {"id": "b", "type": "hero", "data": {}},
            {"id": "c", "type": "category_link", "data": {"category": events.pk}},
            {"id": "d", "type": "category_link", "data": {"category": gone.pk}},
        ],
    )
    gone.delete()

    with CaptureQueriesContext(connection) as queries:
        blocks = page.body.blocks

    assert len(queries) == 1  # one query per related model
    assert [block.id for block in blocks] == ["a", "c", "d"]  # unknown type left out
    assert blocks[0].value == {
        "category": news,
        "published": datetime.date(2026, 3, 1),
    }
    assert blocks[1].value == {"category": events, "published": None}
    assert blocks[2].value["category"] is None
    assert blocks[0].block is CategoryLinkBlock


@pytest.mark.django_db
@override_settings(TEMPLATES=TEMPLATE_SETTINGS)
def test_render_blocks_renders_each_block_with_its_template():
    news = Category.objects.create(name="News")
    field = BlockField(blocks=[TextBlock, LinkBlock])
    field.set_attributes_from_name("body")
    blocks = BlockList(
        [
            text(body="<p>Hi</p>", heading="Intro"),
            {
                "id": "x",
                "type": "category_link",
                "data": {"category": news.pk, "published": "2026-03-01"},
            },
        ],
        field,
    )

    html = render_to_string(
        "page.html", {"page": SimpleNamespace(body=blocks), "site": "Blog"}
    )

    assert html == "<section>Intro|<p>Hi</p></section><a>News 2026 x Blog</a>"


@pytest.mark.django_db
@override_settings(TEMPLATES=TEMPLATE_SETTINGS)
def test_render_blocks_takes_a_list_of_blocks():
    page = LandingPage(title="Spring", body=[text(body="One"), text(body="Two")])

    html = render_to_string("page_slice.html", {"blocks": page.body.blocks[1:]})

    assert html == "<section>|Two</section>"


@override_settings(TEMPLATES=TEMPLATE_SETTINGS)
def test_a_block_renders_on_its_own():
    page = LandingPage(title="Spring", body=[text(heading="Intro")])

    assert page.body.blocks[0].render() == "<section>Intro|<p>Hi</p></section>"


class QuoteBlock(Block):
    quote = models.TextField()

    @classmethod
    def get_context(cls, block):
        return {
            **super().get_context(block),
            "words": len(block.value["quote"].split()),
        }


def test_get_context_adds_to_the_template_context():
    field = BlockField(blocks=[QuoteBlock])
    blocks = BlockList(
        [{"id": "q", "type": "quote", "data": {"quote": "Less is more"}}], field
    )

    context = QuoteBlock.get_context(blocks.blocks[0])

    assert context["words"] == 3
    assert context["value"] == {"quote": "Less is more"}


# Blocks inside blocks


def columns(left=(), right=(), id="cols"):
    return {
        "id": id,
        "type": "columns",
        "data": {"left": list(left), "right": list(right)},
    }


@pytest.mark.django_db
def test_blocks_inside_blocks_are_cleaned():
    news = Category.objects.create(name="News")

    cleaned = body_field.clean_blocks(
        [
            columns(
                left=[text(heading="Left")],
                right=[
                    {
                        "id": "r",
                        "type": "category_link",
                        "data": {"category": {"id": news.pk}},
                    }
                ],
            )
        ]
    )

    left, right = cleaned[0]["data"]["left"], cleaned[0]["data"]["right"]
    assert left[0]["data"] == {"heading": "Left", "body": "<p>Hi</p>"}
    assert left[0]["id"]
    assert right == [
        {
            "id": "r",
            "type": "category_link",
            "data": {"category": news.pk, "published": None},
        }
    ]


def test_a_missing_block_field_in_a_block_is_empty():
    cleaned = body_field.clean_blocks([{"id": "c", "type": "columns", "data": {}}])

    assert cleaned[0]["data"] == {"left": [], "right": []}


@pytest.mark.django_db
def test_errors_inside_blocks_are_nested():
    with pytest.raises(BlockErrors) as e:
        body_field.clean_blocks(
            [
                text(),
                columns(
                    left=[text(), text(body="")],
                    right=[text(), text(), text()],
                ),
            ]
        )

    assert e.value.errors == {
        1: {
            "left": {1: {"body": ["This field cannot be blank."]}},
            "right": ["Use at most 2 blocks."],
        }
    }
    assert e.value.as_data() == {
        "1": {
            "data": {
                "left": {"1": {"data": {"body": ["This field cannot be blank."]}}},
                "right": ["Use at most 2 blocks."],
            }
        }
    }
    assert e.value.as_validation_error().messages == [
        "Block 2, left, block 2, body: This field cannot be blank.",
        "Block 2, right: Use at most 2 blocks.",
    ]


@pytest.mark.django_db
def test_saving_sanitizes_html_inside_blocks():
    page = LandingPage.objects.create(
        title="Spring",
        body=[
            columns(left=[{"id": "a", **text(body="<p>Hi<script>x()</script></p>")}])
        ],
    )
    page.refresh_from_db()

    assert page.body[0]["data"]["left"][0]["data"]["body"] == "<p>Hi</p>"


@pytest.mark.django_db
def test_blocks_inside_blocks_bind_with_one_query_per_model():
    news, events = Category.objects.create(name="News"), Category.objects.create(
        name="Events"
    )
    page = LandingPage(
        title="Spring",
        body=[
            {"id": "a", "type": "category_link", "data": {"category": news.pk}},
            columns(
                left=[
                    {
                        "id": "b",
                        "type": "category_link",
                        "data": {"category": events.pk},
                    }
                ],
                right=[text(heading="Right")],
            ),
        ],
    )

    with CaptureQueriesContext(connection) as queries:
        blocks = page.body.blocks
        left = blocks[1].value["left"]
        right = blocks[1].value["right"]
        left_blocks, right_blocks = left.blocks, right.blocks

    assert len(queries) == 1
    assert isinstance(left, BlockList)
    assert left_blocks[0].value["category"] == events
    assert right_blocks[0].value["heading"] == "Right"


@pytest.mark.django_db
@override_settings(
    TEMPLATES=[
        {
            "BACKEND": "django.template.backends.django.DjangoTemplates",
            "OPTIONS": {
                "loaders": [
                    (
                        "django.template.loaders.locmem.Loader",
                        {
                            **BLOCK_TEMPLATES,
                            "testapp/blocks/columns.html": (
                                "{% load content_studio %}"
                                "<div>{% render_blocks value.left %}</div>"
                                "<div>{% render_blocks value.right %}</div>"
                            ),
                        },
                    )
                ],
            },
        }
    ]
)
def test_blocks_inside_blocks_render_with_render_blocks():
    page = LandingPage(
        title="Spring",
        body=[columns(left=[text(body="L")], right=[text(body="R", heading="H")])],
    )

    html = render_to_string("page.html", {"page": page})

    assert html == ("<div><section>|L</section></div><div><section>H|R</section></div>")


def test_blocks_inside_blocks_go_one_level_deep():
    class InnerBlock(Block):
        items = BlockField(blocks=[TextBlock])

    class OuterBlock(Block):
        inner = BlockField(blocks=[InnerBlock])

    errors = BlockField(blocks=[OuterBlock])._check_blocks()

    assert [error.id for error in errors] == ["content_studio.E018"]
    assert "one level deep" in errors[0].msg


def test_block_fields_in_blocks_are_checked():
    class EmptyColumnsBlock(Block):
        left = BlockField(blocks=[])

    errors = BlockField(blocks=[EmptyColumnsBlock])._check_blocks()

    assert [error.msg for error in errors] == [
        "EmptyColumnsBlock.left: BlockField needs at least one block in blocks."
    ]


class NestedBlockApiTests(AuthenticatedTestCase):
    url = "/api/content/testapp.landingpage"

    def setUp(self):
        self.client = self.client_for(self.create_user(superuser=True))
        self.category = Category.objects.create(name="News")

    def test_relations_inside_blocks_round_trip(self):
        response = self.client.post(
            self.url,
            {
                "title": "Spring",
                "body": [
                    columns(
                        right=[
                            {
                                "id": "r",
                                "type": "category_link",
                                "data": {"category": {"id": self.category.pk}},
                            }
                        ]
                    )
                ],
            },
            format="json",
        )

        assert response.status_code == 201, response.json()
        page = LandingPage.objects.get()
        assert page.body[0]["data"]["right"][0]["data"]["category"] == self.category.pk

        response = self.client.get(f"{self.url}/{page.pk}")
        right = response.json()["body"][0]["data"]["right"]
        assert right[0]["data"]["category"] == {
            "id": self.category.pk,
            "__str__": "News",
        }
        # The stored value is not touched by the representation.
        page.refresh_from_db()
        assert page.body[0]["data"]["right"][0]["data"]["category"] == self.category.pk

    def test_errors_inside_blocks_are_keyed_by_path(self):
        response = self.client.post(
            self.url,
            {"title": "Spring", "body": [columns(left=[text(body="")])]},
            format="json",
        )

        assert response.status_code == 400
        assert response.json() == {
            "body": {
                "0": {
                    "data": {
                        "left": {
                            "0": {"data": {"body": ["This field cannot be blank."]}}
                        }
                    }
                }
            }
        }

    def test_relation_pickers_resolve_fields_inside_blocks(self):
        response = self.client.post(
            f"{self.url}/relations/body.columns.left.category_link.category",
            {"search": ""},
            format="json",
        )

        assert response.status_code == 200
        assert response.json() == [{"id": str(self.category.pk), "__str__": "News"}]

        for name in [
            "body.columns.left",
            "body.columns.left.category_link",
            "body.columns.middle.text.body",
            "body.text.body.text.body",
        ]:
            response = self.client.post(
                f"{self.url}/relations/{name}", {"search": ""}, format="json"
            )
            assert response.status_code == 400, name
