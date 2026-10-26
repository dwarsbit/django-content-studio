"""
Tests for BlockField: block definitions, validation, saving, the admin's
field metadata and the API round trip.
"""

import datetime

import pytest
from django.core.exceptions import ValidationError
from django.db import models

from content_studio.blocks import Block, BlockErrors, BlockField
from content_studio.serializers import ModelSerializer
from tests.test_e2e_crud import AuthenticatedTestCase
from tests.testapp.models import Category, CategoryLinkBlock, LandingPage, TextBlock

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

    text_block, link_block = data["blocks"]
    assert text_block["name"] == "text"
    assert text_block["description"] == "Rich text"
    assert text_block["icon"] == "ph-bold ph-text-t"
    assert text_block["fields"]["body"]["type"] == "HTMLField"
    assert text_block["fields"]["body"]["required"] is True
    assert text_block["fields"]["heading"]["max_length"] == 50
    assert link_block["fields"]["category"]["related_model"] == "testapp.category"


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
    assert check_ids(BlockField(**kwargs)) == ["content_studio.E017"]


def test_unsupported_fields_in_blocks_fail_checks():
    class TaggedBlock(Block):
        categories = models.ManyToManyField(Category)

    assert check_ids(BlockField(blocks=[TaggedBlock])) == ["content_studio.E017"]


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
