"""
Tests for the form system: fields, layouts, form sets and components.
"""

import uuid

import pytest

from rest_framework.response import Response

from content_studio.form import (
    ButtonLink,
    Component,
    Field,
    FieldLayout,
    FormSet,
    FormSetGroup,
    Link,
)


class ViewSiteLink(ButtonLink):
    component_type = "LinkButton"
    label = "View site"
    icon = "external-link"
    copy = False

    def get_url(self, obj, request):
        return f"https://example.com/{obj.pk}"


def test_field_serialization():
    data = Field("title", col_span=2, label="Title", readonly=True).serialize()

    assert data == {
        "type": "field",
        "name": "title",
        "col_span": 2,
        "label": "Title",
        "readonly": True,
    }


def test_field_layout_wraps_and_normalizes():
    layout = FieldLayout(fields=["title", Field("body", col_span=3)], columns=2)

    assert layout.serialize() == {
        "type": "field-layout",
        "fields": [
            {
                "type": "field",
                "name": "title",
                "col_span": 1,
                "label": None,
                "readonly": False,
            },
            {
                "type": "field",
                "name": "body",
                "col_span": 3,
                "label": None,
                "readonly": False,
            },
        ],
        "columns": 2,
    }
    assert [f.name for f in layout.get_fields()] == ["title", "body"]


def test_form_set_normalizes_field_types():
    form_set = FormSet(
        title="Content", fields=["title", Field("body"), FieldLayout(fields=["status"])]
    )

    data = form_set.serialize()
    assert data["type"] == "form-set"
    assert data["title"] == "Content"

    names = [field.name for field in form_set.get_fields()]
    assert names == ["title", "body", "status"]


def test_form_set_rejects_invalid_fields():
    import pytest

    with pytest.raises(ValueError):
        FormSet(fields=[42])


def test_form_set_group_collects_fields():
    group = FormSetGroup(
        label="Main",
        formsets=[
            FormSet(fields=["title"]),
            FormSet(fields=[FieldLayout(fields=["body"])]),
        ],
    )

    assert group.serialize()["type"] == "form-set-group"
    assert [field.name for field in group.get_fields()] == ["title", "body"]


def test_component_serialization_includes_id():
    component = ViewSiteLink()

    data = component.serialize()

    assert data["component_type"] == "LinkButton"
    assert uuid.UUID(data["component_id"])
    assert data["label"] == "View site"
    assert data["icon"] == "external-link"
    assert data["copy"] is False


def test_link_handle_request_returns_url():
    link = ViewSiteLink()

    class Obj:
        pk = 5

    response = link.handle_request(obj=Obj(), request=None)

    assert isinstance(response, Response)
    assert response.data == {"url": "https://example.com/5"}


def test_base_link_requires_get_url():
    class BareLink(Link):
        label = "Bare"

    with pytest.raises(NotImplementedError):
        BareLink().get_url(obj=None, request=None)
