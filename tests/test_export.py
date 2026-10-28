"""
Tests for export: a studio with export_fields or allow_export offers the
list as a CSV or Excel download, from the list (every object matching
the search and filters, in the list's order) and as a bulk action on the
selected rows.

Cells hold the displayed values (choice labels, the string of related
objects, ISO dates), headers the capitalized verbose names. Excluded
fields, trashed objects and other tenants' objects are never exported,
and text a spreadsheet would read as a formula is prefixed.
"""

import csv
import datetime
import io
from decimal import Decimal
from unittest import mock

import pytest
from django.contrib.auth import models as auth_models
from django.core import checks
from django.test import TestCase, override_settings
from django.utils import timezone

from content_studio import export
from content_studio.actions import get_bulk_actions
from content_studio.admin import AdminSerializer, admin_site
from content_studio.checks import check_content_studio
from content_studio.form import TableColumn
from content_studio.token_backends.jwt import create_access_token
from rest_framework.test import APIClient, APIRequestFactory
from tests.testapp.models import Article, Category, Event, SiteSettings

EVENTS = "/api/content/testapp.event"

TENANT_SETTINGS = {
    "ADMIN_SITE": "content_studio.admin.admin_site",
    "TENANT_MODEL": "tests.testapp.models.Category",
}


def studio(model=Event):
    return admin_site._registry[model]


def read_csv(response):
    content = b"".join(response.streaming_content).decode("utf-8")
    assert content.startswith("﻿")
    return list(csv.reader(io.StringIO(content[1:])))


class ExportTestCase(TestCase):
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
        self.music = Category.objects.create(name="Music")
        self.outdoor = Category.objects.create(name="Outdoor")

    def create_event(self, title, **kwargs):
        return Event.objects.create(title=title, **kwargs)


class ValueTests(ExportTestCase):
    @override_settings(TIME_ZONE="Europe/Amsterdam")
    def test_cells_hold_the_displayed_values(self):
        event = self.create_event(
            "Spring concert",
            status=Event.Status.CANCELED,
            category=self.music,
            starts_at=datetime.datetime(2026, 4, 1, 18, 30, tzinfo=datetime.UTC),
            day=datetime.date(2026, 4, 1),
            price=Decimal("12.50"),
            attendees=120,
            is_public=False,
            notes="<p>Doors open at <strong>18:00</strong> &amp; bar</p>",
            keywords=["jazz", "live"],
            details={"stage": "main"},
        )
        event.tags.set([self.music, self.outdoor])

        response = self.client.get(EVENTS + "/export")

        self.assertEqual(response.status_code, 200)
        header, row = read_csv(response)
        self.assertEqual(
            header,
            [
                "Title",
                "Status",
                "Category",
                "Tags",
                "Starts at",
                "Day",
                "Price",
                "Attendees",
                "Is public",
                "Notes",
                "Keywords",
                "Details",
                "Summary",
            ],
        )
        self.assertEqual(
            row,
            [
                "Spring concert",
                "Canceled",
                "Music",
                "Music, Outdoor",
                "2026-04-01T20:30:00+02:00",
                "2026-04-01",
                "12.50",
                "120",
                "No",
                "Doors open at 18:00 & bar",
                "jazz, live",
                '{"stage": "main"}',
                "Spring concert (120)",
            ],
        )

    def test_empty_values_are_empty_cells(self):
        self.create_event("Unplanned")

        _, row = read_csv(self.client.get(EVENTS + "/export"))

        self.assertEqual(row[2:7], ["", "", "", "", ""])
        self.assertEqual(row[8], "Yes")

    def test_formulas_are_prefixed(self):
        for title in ("=1+1", "+31 20", "-2", "@SUM(A1)", "plain"):
            self.create_event(title)

        rows = read_csv(self.client.get(EVENTS + "/export"))

        self.assertEqual(
            [row[0] for row in rows[1:]],
            ["'=1+1", "'+31 20", "'-2", "'@SUM(A1)", "plain"],
        )

    def test_numbers_are_not_prefixed(self):
        self.create_event("Cold", attendees=-3)

        _, row = read_csv(self.client.get(EVENTS + "/export"))

        self.assertEqual(row[7], "-3")

    def test_to_cell(self):
        self.assertEqual(export.to_cell(None), "")
        self.assertEqual(export.to_cell(True), "Yes")
        self.assertEqual(export.to_cell(3), "3")
        self.assertEqual(export.to_cell(3, native=True), 3)
        self.assertEqual(export.to_cell(["a", 1]), "a, 1")
        self.assertEqual(export.to_cell([{"a": 1}]), '[{"a": 1}]')
        self.assertEqual(export.to_cell("=cmd"), "'=cmd")
        self.assertEqual(
            export.to_cell(datetime.date(2026, 1, 2), native=True),
            datetime.date(2026, 1, 2),
        )


class ColumnTests(ExportTestCase):
    def test_allow_export_writes_the_table_display_columns(self):
        with (
            mock.patch.object(studio(), "export_fields", None),
            mock.patch.object(studio(), "allow_export", True),
        ):
            self.create_event("Fair", status=Event.Status.PLANNED)
            rows = read_csv(self.client.get(EVENTS + "/export"))

        self.assertEqual(
            rows, [["Title", "Status", "Starts at"], ["Fair", "Planned", ""]]
        )

    def test_excluded_fields_are_left_out(self):
        self.create_event("Fair", secret="s3cret")

        with mock.patch.object(studio(), "export_fields", ["title", "secret"]):
            rows = read_csv(self.client.get(EVENTS + "/export"))

        self.assertEqual(rows, [["Title"], ["Fair"]])

    def test_headers(self):
        with mock.patch.object(
            studio(),
            "export_fields",
            [
                "__str__",
                TableColumn(field="title", header="Name"),
                "get_summary",
            ],
        ):
            header = read_csv(self.client.get(EVENTS + "/export"))[0]

        self.assertEqual(header, ["Event", "Name", "Get summary"])


class ListExportTests(ExportTestCase):
    def test_exports_every_page_in_the_list_order(self):
        for index in range(25):
            self.create_event(f"Event {index:02}")

        rows = read_csv(self.client.get(EVENTS + "/export?ordering=-title"))

        self.assertEqual(len(rows), 26)
        self.assertEqual(rows[1][0], "Event 24")
        self.assertEqual(rows[-1][0], "Event 00")

    def test_applies_search_and_filters(self):
        self.create_event("Jazz night", status=Event.Status.PLANNED)
        self.create_event("Jazz brunch", status=Event.Status.CANCELED)
        self.create_event("Rock night", status=Event.Status.PLANNED)

        rows = read_csv(
            self.client.get(EVENTS + "/export", {"search": "jazz", "status": "planned"})
        )

        self.assertEqual([row[0] for row in rows[1:]], ["Jazz night"])

    def test_excludes_the_trash(self):
        self.create_event("Kept")
        self.create_event("Trashed", removed_at=timezone.now())

        rows = read_csv(self.client.get(EVENTS + "/export"))

        self.assertEqual([row[0] for row in rows[1:]], ["Kept"])

    def test_trash_scope_exports_only_the_trash(self):
        self.create_event("Kept")
        self.create_event("Trashed", removed_at=timezone.now())

        rows = read_csv(self.client.get(EVENTS + "/export?export_scope=trash"))

        self.assertEqual([row[0] for row in rows[1:]], ["Trashed"])

    def test_download_name(self):
        response = self.client.get(EVENTS + "/export")

        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        self.assertEqual(
            response["Content-Disposition"],
            f'attachment; filename="events-{timezone.localdate().isoformat()}.csv"',
        )

    def test_unknown_format_is_rejected(self):
        response = self.client.get(EVENTS + "/export?export_format=pdf")

        self.assertEqual(response.status_code, 400)

    def test_not_offered_without_opting_in(self):
        response = self.client.get("/api/content/testapp.article/export")

        self.assertEqual(response.status_code, 404)

    def test_trash_scope_needs_a_trash(self):
        with mock.patch.object(studio(), "soft_delete", ""):
            response = self.client.get(EVENTS + "/export?export_scope=trash")

        self.assertEqual(response.status_code, 404)

    def test_requires_view_permission(self):
        self.create_event("Fair")
        nobody = self.client_for(self.create_user(username="nobody"))
        viewer = self.client_for(self.create_user("view_event", username="viewer"))

        self.assertEqual(nobody.get(EVENTS + "/export").status_code, 403)
        self.assertEqual(viewer.get(EVENTS + "/export").status_code, 200)

    def test_is_scoped_to_the_tenant(self):
        self.create_event("Ours", category=self.music)
        self.create_event("Theirs", category=self.outdoor)

        with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
            response = self.client.get(
                EVENTS + "/export", HTTP_X_DCS_TENANT=str(self.music.pk)
            )
            rows = read_csv(response)
            no_tenant = read_csv(self.client.get(EVENTS + "/export"))

        self.assertEqual([row[0] for row in rows[1:]], ["Ours"])
        self.assertEqual(no_tenant[1:], [])


class ExcelTests(ExportTestCase):
    def setUp(self):
        super().setUp()
        self.openpyxl = pytest.importorskip("openpyxl")

    def load(self, response):
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        workbook = self.openpyxl.load_workbook(io.BytesIO(response.content))
        return workbook.active

    @override_settings(TIME_ZONE="Europe/Amsterdam")
    def test_writes_a_workbook_with_native_numbers_and_dates(self):
        self.create_event(
            "=HYPERLINK(1)",
            starts_at=datetime.datetime(2026, 4, 1, 18, 30, tzinfo=datetime.UTC),
            day=datetime.date(2026, 4, 1),
            price=Decimal("12.50"),
            attendees=120,
        )

        sheet = self.load(self.client.get(EVENTS + "/export?export_format=xlsx"))
        header, row = list(sheet.iter_rows(values_only=True))

        self.assertEqual(sheet.title, "Events")
        self.assertEqual(header[:3], ("Title", "Status", "Category"))
        self.assertEqual(row[0], "'=HYPERLINK(1)")
        self.assertEqual(row[4], datetime.datetime(2026, 4, 1, 20, 30))
        self.assertEqual(row[5], datetime.datetime(2026, 4, 1))
        self.assertEqual(row[6], 12.5)
        self.assertEqual(row[7], 120)
        self.assertEqual(sheet.cell(2, 1).data_type, "s")
        self.assertEqual(sheet.cell(2, 6).number_format, "yyyy-mm-dd")

    def test_offered_when_openpyxl_is_installed(self):
        self.assertEqual(export.get_export_formats(), ["csv", "xlsx"])


class ExcelUnavailableTests(ExportTestCase):
    def setUp(self):
        super().setUp()
        patcher = mock.patch.object(export, "is_excel_available", return_value=False)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_only_csv_is_offered(self):
        self.assertEqual(export.get_export_formats(), ["csv"])

    def test_excel_is_rejected(self):
        response = self.client.get(EVENTS + "/export?export_format=xlsx")

        self.assertEqual(response.status_code, 400)

    def test_csv_still_works(self):
        response = self.client.get(EVENTS + "/export?export_format=csv")

        self.assertEqual(response.status_code, 200)


class PayloadTests(ExportTestCase):
    def serialize(self, model):
        request = APIRequestFactory().get("/")
        request.user = self.superuser
        return AdminSerializer(studio(model)).serialize(request)["list"]

    def test_lists_the_formats(self):
        with mock.patch.object(export, "is_excel_available", return_value=True):
            self.assertEqual(
                self.serialize(Event)["export"], {"formats": ["csv", "xlsx"]}
            )

    def test_none_without_opting_in(self):
        self.assertIsNone(self.serialize(Article)["export"])

    def test_never_for_singletons(self):
        with mock.patch.object(studio(SiteSettings), "allow_export", True):
            self.assertIsNone(self.serialize(SiteSettings)["export"])


class BulkExportTests(ExportTestCase):
    def bulk(self, client=None, **data):
        return (client or self.client).post(
            EVENTS + "/bulk" + data.pop("query", ""),
            {"action": "export", **data},
            format="json",
        )

    def test_is_offered_next_to_delete(self):
        with mock.patch.object(export, "is_excel_available", return_value=False):
            actions = get_bulk_actions(studio())

        self.assertEqual([action.id for action in actions], ["delete", "export"])
        self.assertEqual(actions[1].serialize()["formats"], ["csv"])
        self.assertNotIn("formats", actions[0].serialize())

    def test_not_offered_without_opting_in(self):
        self.assertNotIn(
            "export", [action.id for action in get_bulk_actions(studio(Article))]
        )

    def test_exports_only_the_selected_rows_in_order(self):
        first = self.create_event("Alpha")
        self.create_event("Beta")
        third = self.create_event("Gamma")

        response = self.bulk(ids=[first.pk, third.pk], query="?ordering=-title")

        self.assertEqual(response.status_code, 200)
        rows = read_csv(response)
        self.assertEqual([row[0] for row in rows[1:]], ["Gamma", "Alpha"])

    def test_excel(self):
        pytest.importorskip("openpyxl")
        event = self.create_event("Alpha")

        response = self.bulk(ids=[event.pk], export_format="xlsx")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b"PK"))

    def test_trashed_rows_are_left_out(self):
        trashed = self.create_event("Trashed", removed_at=timezone.now())

        rows = read_csv(self.bulk(ids=[trashed.pk]))

        self.assertEqual(rows[1:], [])

    def test_unknown_format_is_rejected(self):
        event = self.create_event("Alpha")

        response = self.bulk(ids=[event.pk], export_format="pdf")

        self.assertEqual(response.status_code, 400)

    def test_view_permission_is_enough(self):
        event = self.create_event("Alpha")
        viewer = self.client_for(self.create_user("view_event", username="viewer"))

        response = self.bulk(client=viewer, ids=[event.pk])

        self.assertEqual(response.status_code, 200)

    def test_is_scoped_to_the_tenant(self):
        theirs = self.create_event("Theirs", category=self.outdoor)

        with override_settings(CONTENT_STUDIO=TENANT_SETTINGS):
            response = self.client.post(
                EVENTS + "/bulk",
                {"action": "export", "ids": [theirs.pk]},
                format="json",
                HTTP_X_DCS_TENANT=str(self.music.pk),
            )
            rows = read_csv(response)

        self.assertEqual(rows[1:], [])


class ExportCheckTests(TestCase):
    def messages(self, check_id):
        return [m for m in check_content_studio() if m.id == check_id]

    def test_valid_configuration_passes(self):
        self.assertEqual(self.messages("content_studio.E022"), [])
        self.assertEqual(self.messages("content_studio.W015"), [])

    def test_export_fields_must_be_a_list(self):
        with mock.patch.object(studio(), "export_fields", "title"):
            messages = self.messages("content_studio.E022")

        self.assertEqual(len(messages), 1)
        self.assertIsInstance(messages[0], checks.Error)

    def test_export_fields_must_resolve(self):
        with mock.patch.object(
            studio(), "export_fields", ["title", "nope", "title", 42]
        ):
            messages = [m.msg for m in self.messages("content_studio.E022")]

        self.assertEqual(len(messages), 3)
        self.assertIn("'nope'", messages[0])
        self.assertIn("more than once", messages[1])
        self.assertIn("42", messages[2])

    def test_reverse_relations_do_not_resolve(self):
        with mock.patch.object(studio(Category), "export_fields", ["events"]):
            messages = self.messages("content_studio.E022")

        self.assertEqual(len(messages), 1)

    def test_excluded_columns_warn(self):
        with mock.patch.object(studio(), "export_fields", ["title", "secret"]):
            messages = self.messages("content_studio.W015")

        self.assertEqual(len(messages), 1)
        self.assertIn("'secret'", messages[0].msg)

    def test_empty_export_fields_warn(self):
        with mock.patch.object(studio(), "export_fields", []):
            messages = self.messages("content_studio.W015")

        self.assertEqual(len(messages), 1)
        self.assertIn("allow_export", messages[0].msg)

    def test_singletons_warn(self):
        with mock.patch.object(studio(SiteSettings), "allow_export", True):
            messages = self.messages("content_studio.W015")

        self.assertEqual(len(messages), 1)
        self.assertIn("singletons", messages[0].msg)

    def test_export_action_without_export_is_an_error(self):
        with mock.patch.object(studio(Article), "actions", ["delete", "export"]):
            messages = self.messages("content_studio.E007")

        self.assertEqual(len(messages), 1)
        self.assertIn("offers no export", messages[0].msg)

    def test_export_action_with_export_passes(self):
        with mock.patch.object(studio(), "actions", ["export"]):
            self.assertEqual(self.messages("content_studio.E007"), [])
