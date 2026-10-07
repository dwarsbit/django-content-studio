"""
Tests for the deterministic IDs of extensions, dashboard widgets and
form components.

IDs are derived from stable parts (class + label/url/name) so every
process agrees on them; explicit UUIDs take precedence, and duplicates
are rejected at setup.
"""

import subprocess
import sys
import uuid

import pytest
from django.contrib import admin as django_admin
from django.core.exceptions import ImproperlyConfigured
from django.db import models

from content_studio.dashboard import BaseWidget, Dashboard, SpacingWidget
from content_studio.extensions import IFramePage, MainMenuLink
from content_studio.form import ButtonLink, Component
from content_studio.utils import derive_uuid


class MyComponent(Component):
    component_type = "MyComponent"


class MyLink(ButtonLink):
    component_type = "LinkButton"
    label = "View site"


class MyWidget(BaseWidget):
    name = "MyWidget"


class ScratchModel(models.Model):
    class Meta:
        app_label = "content_studio"


def test_component_id_is_deterministic():
    expected = derive_uuid(MyComponent.__module__, MyComponent.__qualname__)
    assert MyComponent().component_id == expected


def test_link_component_id_includes_label():
    expected = derive_uuid(MyLink.__module__, MyLink.__qualname__, "View site")
    assert MyLink().component_id == expected


def test_custom_id_parts_override():
    class IdentityComponent(MyComponent):
        def get_id_parts(self):
            return ("identity",)

    expected = derive_uuid(
        IdentityComponent.__module__, IdentityComponent.__qualname__, "identity"
    )
    assert IdentityComponent().component_id == expected


def test_explicit_component_id_takes_precedence():
    explicit = uuid.uuid4()
    assert MyComponent(component_id=explicit).component_id == explicit


def test_explicit_component_id_must_be_a_uuid():
    with pytest.raises(ValueError):
        MyComponent(component_id="not-a-uuid")


def test_widget_id_is_deterministic():
    expected = derive_uuid(MyWidget.__module__, MyWidget.__qualname__, "MyWidget")
    assert MyWidget().widget_id == expected


def test_explicit_widget_id_takes_precedence():
    explicit = uuid.uuid4()
    assert MyWidget(widget_id=explicit).widget_id == explicit


def test_widget_id_class_attribute_still_takes_precedence():
    fixed = uuid.uuid4()

    class FixedWidget(BaseWidget):
        name = "FixedWidget"
        widget_id = fixed

    assert FixedWidget().widget_id == fixed


def test_spacing_widget_forwards_widget_id():
    explicit = uuid.uuid4()
    assert SpacingWidget(col_span=2, widget_id=explicit).widget_id == explicit


def test_extension_id_is_deterministic():
    link = MainMenuLink(url="/docs/", label="Docs")
    expected = derive_uuid(
        MainMenuLink.__module__, MainMenuLink.__qualname__, "/docs/", "Docs"
    )
    assert link.extension_id == expected


def test_iframe_page_id_is_deterministic():
    page = IFramePage(path="/reports/", iframe_url="https://example.com")
    expected = derive_uuid(
        IFramePage.__module__,
        IFramePage.__qualname__,
        "/reports/",
        "https://example.com",
    )
    assert page.extension_id == expected


def test_explicit_extension_id_takes_precedence():
    explicit = uuid.uuid4()
    link = MainMenuLink(url="/docs/", label="Docs", extension_id=explicit)
    assert link.extension_id == explicit


def test_ids_stable_across_processes():
    """Derived IDs are identical in separate processes (multi-worker)."""
    code = (
        "from content_studio.form import ButtonLink, Component;"
        "print(Component().component_id)"
    )
    outputs = [
        subprocess.run(
            [sys.executable, "-c", code], capture_output=True, text=True
        ).stdout.strip()
        for _ in range(2)
    ]
    assert outputs[0] == outputs[1]


def test_get_component_finds_by_id():
    from content_studio.admin import ModelAdmin, admin_site

    explicit = uuid.uuid4()
    component = MyComponent(component_id=explicit)
    model_admin = ModelAdmin(ScratchModel, admin_site)
    model_admin.edit_main = [component]

    assert model_admin.get_component(explicit) is component
    assert model_admin.get_component(uuid.uuid4()) is None


def _validate(extensions=None, dashboard=None, model_admins=None):
    from content_studio.admin import admin_site

    admin_site.extensions = extensions
    admin_site.dashboard = dashboard

    for model, model_admin in (model_admins or {}).items():
        django_admin.site.register(model, model_admin)

    try:
        admin_site._validate_config_ids()
    finally:
        for model in model_admins or {}:
            django_admin.site.unregister(model)
        admin_site.extensions = None
        admin_site.dashboard = None


def test_duplicate_component_ids_raise():
    from content_studio.admin import ModelAdmin, admin_site

    class DuplicateAdmin(ModelAdmin):
        edit_main = [MyComponent(), MyComponent()]

    with pytest.raises(ImproperlyConfigured) as exc_info:
        _validate(model_admins={ScratchModel: DuplicateAdmin})

    assert "Duplicate component ID" in str(exc_info.value)


def test_distinct_component_ids_pass_validation():
    class DistinctAdmin(
        __import__("content_studio.admin", fromlist=["ModelAdmin"]).ModelAdmin
    ):
        edit_main = [
            MyComponent(component_id=uuid.uuid4()),
            MyComponent(component_id=uuid.uuid4()),
        ]

    _validate(model_admins={ScratchModel: DistinctAdmin})


def test_duplicate_widget_ids_raise():
    with pytest.raises(ImproperlyConfigured) as exc_info:
        _validate(dashboard=Dashboard(widgets=[MyWidget(), MyWidget()]))

    assert "Duplicate dashboard widget ID" in str(exc_info.value)


def test_duplicate_extension_ids_raise():
    with pytest.raises(ImproperlyConfigured) as exc_info:
        _validate(
            extensions=[
                MainMenuLink(url="/docs/", label="Docs"),
                MainMenuLink(url="/docs/", label="Docs"),
            ]
        )

    assert "Duplicate extension ID" in str(exc_info.value)


def test_component_endpoint_rejects_malformed_uuid():
    from rest_framework.exceptions import NotFound
    from rest_framework.parsers import JSONParser
    from rest_framework.request import Request
    from rest_framework.test import APIRequestFactory

    from content_studio.viewsets import BaseModelViewSet

    viewset = BaseModelViewSet()
    viewset.queryset = ScratchModel.objects.none()
    viewset._admin_model = None

    request = Request(
        APIRequestFactory().get("/api/content/m/1/components/not-a-uuid"),
        parsers=[JSONParser()],
    )

    with pytest.raises(NotFound):
        viewset.get_component(request, "1", "not-a-uuid")
