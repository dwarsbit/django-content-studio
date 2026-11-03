"""
Tests for the form widgets: their options, the default widgets of the
field types they cover, temporary uploads for the FileWidget and
write-only values for the PasswordWidget.
"""

import datetime
import posixpath
from unittest import mock

import pytest
from django.contrib.auth import models as auth_models
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import models
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from content_studio import formats, widgets
from content_studio.admin import admin_site
from content_studio.form import Field, FormSet
from content_studio.settings import cs_settings
from content_studio.token_backends.jwt import create_access_token
from content_studio.uploads import clear_expired_uploads
from tests.testapp.models import Product


def options(widget):
    return widget.serialize()["options"]


# Options


def test_typed_inputs_take_a_placeholder():
    for widget in (widgets.EmailWidget, widgets.URLWidget, widgets.PhoneWidget):
        assert options(widget()) == {}
        assert options(widget(placeholder="Type here")) == {"placeholder": "Type here"}

        with pytest.raises(TypeError):
            widget(placeholder=5)


def test_password_widget():
    assert options(widgets.PasswordWidget()) == {"write_only": False}
    assert options(widgets.PasswordWidget(write_only=True)) == {"write_only": True}

    with pytest.raises(TypeError):
        widgets.PasswordWidget(write_only="yes")


def test_slider_widget():
    widget = widgets.SliderWidget(min_value=0, max_value=10, step=0.5, suffix="km")

    assert options(widget) == {
        "min_value": 0,
        "max_value": 10,
        "step": 0.5,
        "suffix": "km",
    }


@pytest.mark.parametrize(
    "kwargs",
    [
        {"min_value": 0},
        {"min_value": 10, "max_value": 10},
        {"min_value": 10, "max_value": 0},
        {"min_value": 0, "max_value": 10, "step": 0},
        {"min_value": "0", "max_value": 10},
        {"min_value": 0, "max_value": True},
        {"min_value": 0, "max_value": 10, "suffix": 5},
    ],
)
def test_slider_widget_rejects_invalid_options(kwargs):
    with pytest.raises((TypeError, ValueError)):
        widgets.SliderWidget(**kwargs)


def test_duration_widget():
    assert options(widgets.DurationWidget()) == {
        "show_days": False,
        "show_seconds": True,
    }
    assert options(widgets.DurationWidget(show_days=True, show_seconds=False)) == {
        "show_days": True,
        "show_seconds": False,
    }

    with pytest.raises(TypeError):
        widgets.DurationWidget(show_days=1)


def test_character_counter_options():
    assert options(widgets.InputWidget(show_count=True, recommended_length=60)) == {
        "show_count": True,
        "recommended_length": 60,
    }
    assert options(widgets.TextAreaWidget(show_count=False)) == {"show_count": False}
    # Unset, the counter shows near the limit.
    assert options(widgets.InputWidget()) == {}


@pytest.mark.parametrize(
    "kwargs",
    [{"show_count": "yes"}, {"recommended_length": 0}, {"recommended_length": 1.5}],
)
def test_character_counter_rejects_invalid_options(kwargs):
    with pytest.raises((TypeError, ValueError)):
        widgets.InputWidget(**kwargs)

    with pytest.raises((TypeError, ValueError)):
        widgets.TextAreaWidget(**kwargs)


def test_default_widgets_of_new_field_types():
    mapping = admin_site.default_widget_mapping

    assert mapping[models.EmailField] is widgets.EmailWidget
    assert mapping[models.URLField] is widgets.URLWidget
    assert mapping[models.DurationField] is widgets.DurationWidget
    assert mapping[models.FileField] is widgets.FileWidget
    assert mapping[models.ImageField] is widgets.FileWidget
    assert admin_site.default_format_mapping[models.FileField] is formats.FileFormat


# API


class APITestCase(TestCase):
    def setUp(self):
        self.user = auth_models.User.objects.create_superuser(
            username="admin", password="x"
        )
        self.client = self.client_for(self.user)

    def client_for(self, user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
        return client

    def upload(self, client=None, field="manual", content=b"%PDF-1.4 manual"):
        return (client or self.client).post(
            f"/api/content/testapp.product/uploads/{field}",
            {"file": SimpleUploadedFile("Hammer manual.pdf", content)},
            format="multipart",
        )


class FileWidgetTests(APITestCase):
    def test_upload_waits_until_the_object_is_saved(self):
        response = self.upload()

        assert response.status_code == 201, response.content
        data = response.json()
        assert data["name"] == "Hammer manual.pdf"
        assert data["size"] == len(b"%PDF-1.4 manual")
        assert data["upload"]

        # Nothing is attached yet: the file waits in UPLOAD_FOLDER.
        directories, _ = default_storage.listdir(cs_settings.UPLOAD_FOLDER)
        assert directories

    def test_save_attaches_the_upload_on_create(self):
        token = self.upload().json()["upload"]

        response = self.client.post(
            "/api/content/testapp.product",
            {"title": "Hammer", "slug": "hammer", "manual": {"upload": token}},
            format="json",
        )

        assert response.status_code == 201, response.content
        product = Product.objects.get(slug="hammer")
        assert product.manual.read() == b"%PDF-1.4 manual"
        assert response.json()["manual"]["name"] == posixpath.basename(
            product.manual.name
        )
        # The temporary copy is gone once attached.
        path = posixpath.join(cs_settings.UPLOAD_FOLDER)
        assert all(
            not default_storage.listdir(posixpath.join(path, directory))[1]
            for directory in default_storage.listdir(path)[0]
        )

    def test_the_value_as_sent_out_leaves_the_file_unchanged(self):
        product = Product.objects.create(title="Lamp", slug="lamp")
        product.manual.save("lamp.pdf", ContentFile(b"lamp"))
        detail = self.client.get(f"/api/content/testapp.product/{product.pk}").json()

        assert detail["manual"]["name"] == posixpath.basename(product.manual.name)
        assert detail["manual"]["url"]

        response = self.client.put(
            f"/api/content/testapp.product/{product.pk}",
            {**detail, "title": "Desk lamp"},
            format="json",
        )

        assert response.status_code == 200, response.content
        product.refresh_from_db()
        assert product.title == "Desk lamp"
        assert product.manual.read() == b"lamp"

    def test_a_path_from_the_editor_is_never_attached(self):
        product = Product.objects.create(title="Lamp", slug="lamp")

        self.client.patch(
            f"/api/content/testapp.product/{product.pk}",
            {"manual": "../../settings.py"},
            format="json",
        )

        product.refresh_from_db()
        assert not product.manual

    def test_null_clears_the_file(self):
        product = Product.objects.create(title="Lamp", slug="lamp")
        product.manual.save("lamp.pdf", ContentFile(b"lamp"))

        response = self.client.patch(
            f"/api/content/testapp.product/{product.pk}",
            {"manual": None},
            format="json",
        )

        assert response.status_code == 200, response.content
        product.refresh_from_db()
        assert not product.manual

    def test_uploads_are_for_one_user_and_one_field(self):
        token = self.upload().json()["upload"]
        other = auth_models.User.objects.create_superuser(
            username="other", password="x"
        )

        response = self.client_for(other).post(
            "/api/content/testapp.product",
            {"title": "Hammer", "slug": "hammer", "manual": {"upload": token}},
            format="json",
        )

        assert response.status_code == 400
        assert "manual" in response.json()

    def test_tampered_tokens_are_rejected(self):
        token = self.upload().json()["upload"]

        response = self.client.post(
            "/api/content/testapp.product",
            {"title": "Hammer", "slug": "hammer", "manual": {"upload": token + "x"}},
            format="json",
        )

        assert response.status_code == 400

    def test_markup_is_rejected(self):
        response = self.upload(content=b"<html><script>alert(1)</script></html>")

        assert response.status_code == 400
        assert "file" in response.json()

    @override_settings(CONTENT_STUDIO={"UPLOAD_MAX_SIZE": 4})
    def test_large_files_are_rejected(self):
        assert self.upload().status_code == 400

    def test_only_file_fields_the_form_writes_take_uploads(self):
        assert self.upload(field="title").status_code == 400
        assert self.upload(field="missing").status_code == 400

    def test_uploading_needs_add_or_change_permission(self):
        viewer = auth_models.User.objects.create_user(
            username="viewer", password="x", is_staff=True
        )
        viewer.user_permissions.add(
            auth_models.Permission.objects.get(codename="view_product")
        )

        assert self.upload(client=self.client_for(viewer)).status_code == 403

    def test_clear_command_removes_old_uploads(self):
        self.upload()

        assert clear_expired_uploads() == 0

        later = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
            days=2
        )
        with mock.patch("content_studio.uploads.timezone.now", return_value=later):
            assert clear_expired_uploads() == 1

        call_command("content_studio_clear_uploads", stdout=mock.MagicMock())


class PasswordWidgetTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.studio = admin_site._registry[Product]
        self.edit_main = mock.patch.object(
            self.studio,
            "edit_main",
            [
                FormSet(
                    fields=[
                        "title",
                        "slug",
                        Field("sku", widget=widgets.PasswordWidget(write_only=True)),
                    ]
                )
            ],
            create=True,
        )
        self.edit_main.start()
        self.addCleanup(self.edit_main.stop)
        self.product = Product.objects.create(title="Lamp", slug="lamp", sku="s3cr3t")

    def url(self):
        return f"/api/content/testapp.product/{self.product.pk}"

    def test_the_value_never_leaves_the_server(self):
        detail = self.client.get(self.url()).json()

        assert detail["sku"] == {"is_set": True}
        assert "s3cr3t" not in self.client.get(self.url()).content.decode()

    def test_the_value_as_sent_out_keeps_it(self):
        detail = self.client.get(self.url()).json()

        self.client.put(self.url(), {**detail, "title": "Desk lamp"}, format="json")

        self.product.refresh_from_db()
        assert self.product.title == "Desk lamp"
        assert self.product.sku == "s3cr3t"

    def test_a_new_value_replaces_it(self):
        self.client.patch(self.url(), {"sku": "n3w"}, format="json")

        self.product.refresh_from_db()
        assert self.product.sku == "n3w"
        assert self.client.get(self.url()).json()["sku"] == {"is_set": True}

    def test_a_masked_password_widget_sends_the_value(self):
        with mock.patch.object(
            self.studio,
            "edit_main",
            [FormSet(fields=["title", Field("sku", widget=widgets.PasswordWidget)])],
            create=True,
        ):
            assert self.client.get(self.url()).json()["sku"] == "s3cr3t"
