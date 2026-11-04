"""
Tests for the analytics integration: the ranges, the extension and its
cache, the analytics page and links, the report endpoint, the Analytics
component with its path resolution and reverse lookup, the dashboard
widgets, the system checks and the Umami provider.
"""

import json
from datetime import datetime, timedelta, timezone
from unittest import mock
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth.models import Permission, User
from django.utils import timezone as dj_timezone
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from content_studio.admin import admin_site
from content_studio.analytics import (
    Analytics,
    AnalyticsError,
    AnalyticsExtension,
    AnalyticsLink,
    AnalyticsPage,
    AnalyticsProvider,
    AnalyticsStatisticWidget,
    AnalyticsTopPagesWidget,
    AnalyticsUserMenuLink,
    BreakdownRow,
    MetricValue,
    TimeseriesPoint,
)
from content_studio.analytics.providers import AnalyticsQuery
from content_studio.analytics.ranges import InvalidRange, get_query
from content_studio.analytics.umami import UmamiProvider
from content_studio.analytics.views import AnalyticsViewSet
from content_studio.checks import analytics_errors, analytics_warnings
from content_studio.dashboard import Dashboard
from content_studio.extensions import DashboardPage
from content_studio.token_backends.jwt import create_access_token
from content_studio.views import get_extensions
from tests.testapp.admin import ArticleAdmin
from tests.testapp.models import Article

NOW = datetime(2026, 11, 4, 15, 30, tzinfo=timezone.utc)


class FakeProvider(AnalyticsProvider):
    name = "Fake"
    metrics = ("visitors", "pageviews", "bounce_rate")
    timeseries_metrics = ("visitors",)
    breakdowns = ("pages", "referrers")

    def __init__(self):
        self.calls = []

    def get_summary(self, request, query):
        self.calls.append(("summary", query.path))
        return {
            "visitors": MetricValue(120, previous=100),
            "pageviews": MetricValue(300, previous=None),
            "bounce_rate": MetricValue(40, previous=50),
        }

    def get_timeseries(self, request, query, metric):
        self.calls.append(("timeseries", metric))
        return [
            TimeseriesPoint(date=bucket, value=i, previous=i + 1)
            for i, bucket in enumerate(query.buckets())
        ]

    def get_breakdown(self, request, query, dimension, limit):
        self.calls.append(("breakdown", dimension, limit))
        if dimension == "pages":
            return [BreakdownRow(key=f"/articles/{pk}/", value=10) for pk in self.pks]
        return [BreakdownRow(key="google.com", value=5)]

    pks = ()


class FailingProvider(FakeProvider):
    def get_summary(self, request, query):
        raise AnalyticsError("down")


class SummaryOnlyProvider(AnalyticsProvider):
    metrics = ("visitors",)

    def get_summary(self, request, query):
        return {"visitors": MetricValue(1)}


def request_for(user=None, path="/"):
    request = APIRequestFactory().get(path)
    request.user = user or User(is_staff=True, is_active=True, is_superuser=True)
    return request


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


@pytest.fixture
def provider():
    return FakeProvider()


@pytest.fixture
def analytics(monkeypatch, provider):
    extension = AnalyticsExtension(provider=provider)
    page = AnalyticsPage()
    monkeypatch.setattr(
        admin_site,
        "extensions",
        [extension, page, AnalyticsLink(), AnalyticsUserMenuLink()],
        raising=False,
    )
    return extension


def report(user, **params):
    request = APIRequestFactory().get("/api/analytics/", params)
    force_authenticate(request, user=user)
    return AnalyticsViewSet.as_view({"get": "list"})(request)


# Ranges.


@pytest.mark.parametrize(
    "key,days,interval",
    [("today", 1, "hour"), ("7d", 7, "day"), ("30d", 30, "day"), ("90d", 90, "day")],
)
def test_presets_count_back_from_today(key, days, interval):
    query = get_query(key, now=NOW)

    assert query.end == datetime(2026, 11, 5, tzinfo=ZoneInfo("UTC"))
    assert query.end - query.start == timedelta(days=days)
    assert query.interval == interval


def test_twelve_months_start_at_a_month():
    query = get_query("12mo", now=NOW)

    assert query.start == datetime(2025, 12, 1, tzinfo=ZoneInfo("UTC"))
    assert query.interval == "month"
    assert len(query.buckets()) == 12


def test_ranges_follow_the_current_timezone():
    with dj_timezone.override(ZoneInfo("Europe/Amsterdam")):
        query = get_query(
            "today", now=datetime(2026, 11, 4, 23, 30, tzinfo=timezone.utc)
        )

    # 23:30 UTC is already the 5th in Amsterdam.
    assert query.start.isoformat() == "2026-11-05T00:00:00+01:00"
    assert len(query.buckets()) == 24


def test_a_custom_range_includes_both_dates():
    query = get_query("custom", start="2026-10-01", end="2026-10-31")

    assert query.end - query.start == timedelta(days=31)
    assert query.interval == "day"
    assert get_query("custom", start="2026-10-01", end="2026-10-02").interval == "hour"
    assert get_query("custom", start="2026-01-01", end="2026-10-31").interval == "month"


@pytest.mark.parametrize(
    "key,start,end",
    [
        ("custom", "2026-10-31", "2026-10-01"),
        ("custom", "nope", "2026-10-01"),
        ("custom", "2020-01-01", "2026-10-01"),
        ("forever", None, None),
    ],
)
def test_bad_ranges_are_rejected(key, start, end):
    with pytest.raises(InvalidRange):
        get_query(key, start=start, end=end)


def test_the_previous_period_ends_where_the_query_starts():
    query = get_query("7d", now=NOW)

    assert query.previous.end == query.start
    assert query.previous.end - query.previous.start == timedelta(days=7)


# The extension.


def test_an_extension_needs_a_provider():
    with pytest.raises(ValueError, match="AnalyticsProvider"):
        AnalyticsExtension(provider=object())


def test_the_extension_serializes_what_the_provider_offers(analytics):
    config = analytics.serialize()["config"]

    assert config["provider"] == "Fake"
    assert [m["key"] for m in config["metrics"]] == [
        "visitors",
        "pageviews",
        "bounce_rate",
    ]
    assert config["metrics"][2] == {
        "key": "bounce_rate",
        "label": "Bounce rate",
        "kind": "percent",
        "sign": -1,
    }
    assert config["timeseries_metrics"] == ["visitors"]
    assert config["breakdowns"] == ["pages", "referrers"]
    assert config["realtime"] is False
    assert config["page_path"] == "analytics/"


def test_the_extension_leaves_out_what_the_provider_does_not_implement():
    config = AnalyticsExtension(provider=SummaryOnlyProvider()).serialize()["config"]

    assert config["timeseries_metrics"] == []
    assert config["breakdowns"] == []


def test_answers_are_cached(analytics, provider):
    query = get_query("7d")
    request = request_for()

    analytics.get_summary(request, query)
    analytics.get_summary(request, query)
    analytics.get_summary(request, get_query("30d"))

    assert provider.calls == [("summary", None), ("summary", None)]


def test_links_point_at_the_analytics_page(analytics):
    extensions = {e["extension_type"]: e for e in get_extensions(request_for())}

    assert extensions["MainMenuLink"]["config"]["url"] == "/analytics/"
    assert extensions["MainMenuLink"]["config"]["label"] == "Analytics"
    assert extensions["MainMenuLink"]["config"]["icon"] == "ph-bold ph-chart-line-up"
    assert extensions["UserMenuLink"]["config"]["url"] == "/analytics/"
    assert extensions["AnalyticsPage"]["config"]["path"] == "analytics/"
    assert "AnalyticsExtension" in extensions


def test_a_narrowed_extension_hides_the_page_and_links(monkeypatch, provider):
    class StaffAnalytics(AnalyticsExtension):
        def is_visible(self, request):
            return request.user.is_superuser

    monkeypatch.setattr(
        admin_site,
        "extensions",
        [StaffAnalytics(provider=provider), AnalyticsPage(), AnalyticsLink()],
        raising=False,
    )
    editor = User(is_staff=True, is_active=True)

    assert get_extensions(request_for(editor)) == []
    assert len(get_extensions(request_for())) == 3


def test_a_link_without_a_page_is_hidden(monkeypatch, provider):
    monkeypatch.setattr(
        admin_site,
        "extensions",
        [AnalyticsExtension(provider=provider), AnalyticsLink()],
        raising=False,
    )

    assert [e["extension_type"] for e in get_extensions(request_for())] == [
        "AnalyticsExtension"
    ]


# The report endpoint.


@pytest.mark.django_db
def test_the_summary_reports_metrics_and_the_range(analytics, admin_user):
    response = report(admin_user, range="7d")

    assert response.status_code == 200
    assert response.data["metrics"] == [
        {"key": "visitors", "value": 120, "previous": 100},
        {"key": "pageviews", "value": 300, "previous": None},
        {"key": "bounce_rate", "value": 40, "previous": 50},
    ]
    assert response.data["range"]["interval"] == "day"
    assert response.data["path"] is None


@pytest.mark.django_db
def test_the_path_filter_is_normalized(analytics, admin_user, provider):
    response = report(admin_user, path="https://example.com/blog/a/?x=1")

    assert response.data["path"] == "/blog/a/"
    assert provider.calls == [("summary", "/blog/a/")]


@pytest.mark.django_db
def test_the_timeseries_leaves_out_hours_to_come(analytics, admin_user):
    with (
        mock.patch("content_studio.analytics.report.timezone.now", return_value=NOW),
        mock.patch("content_studio.analytics.ranges.timezone.now", return_value=NOW),
    ):
        response = report(admin_user, part="timeseries", range="today")

    assert response.status_code == 200
    assert len(response.data["points"]) == 16  # 00:00 up to 15:00
    assert response.data["points"][0] == {
        "date": "2026-11-04T00:00:00+00:00",
        "value": 0,
        "previous": 1,
    }


@pytest.mark.django_db
def test_a_metric_the_provider_cannot_chart_is_not_found(analytics, admin_user):
    assert report(admin_user, part="timeseries", metric="pageviews").status_code == 404


@pytest.mark.django_db
def test_a_breakdown_caps_its_limit(analytics, admin_user, provider):
    response = report(admin_user, part="breakdown", dimension="referrers", limit=500)

    assert response.data["rows"] == [
        {"key": "google.com", "label": None, "value": 5, "object": None}
    ]
    assert provider.calls == [("breakdown", "referrers", 50)]
    assert report(admin_user, part="breakdown", dimension="cities").status_code == 404


@pytest.mark.django_db
def test_a_bad_range_is_a_bad_request(analytics, admin_user):
    response = report(admin_user, range="custom", start="2026-10-31", end="2026-10-01")

    assert response.status_code == 400


@pytest.mark.django_db
def test_a_failing_provider_is_a_bad_gateway(monkeypatch, admin_user):
    monkeypatch.setattr(
        admin_site,
        "extensions",
        [AnalyticsExtension(provider=FailingProvider())],
        raising=False,
    )

    response = report(admin_user)

    assert response.status_code == 502
    assert response.data == {"detail": "unavailable", "provider": "Fake"}


@pytest.mark.django_db
def test_realtime_needs_a_provider_that_reports_it(analytics, admin_user):
    assert report(admin_user, part="realtime").status_code == 404


@pytest.mark.django_db
def test_the_report_needs_analytics(monkeypatch, admin_user):
    monkeypatch.setattr(admin_site, "extensions", [], raising=False)

    assert report(admin_user).status_code == 404


@pytest.mark.django_db
def test_the_report_needs_active_staff(analytics):
    user = User.objects.create_user(username="reader", password="x")

    assert report(user).status_code in (401, 403)


# The Analytics component.


ARTICLES = "/api/content/testapp.article"


@pytest.fixture
def component(monkeypatch, analytics):
    component = Analytics(path_field="id", path_prefix="/articles/", path_suffix="/")
    monkeypatch.setattr(
        ArticleAdmin, "edit_sidebar", list(ArticleAdmin.edit_sidebar) + [component]
    )
    return component


def component_url(article, component):
    return f"{ARTICLES}/{article.pk}/components/{component.component_id}"


def test_the_component_serializes_its_layout():
    data = Analytics(layout="full", default_range="7d").serialize()

    assert data["component_type"] == "Analytics"
    assert data["title"] == "Analytics"
    assert data["layout"] == "full"
    assert data["default_range"] == "7d"

    with pytest.raises(ValueError, match="layout"):
        Analytics(layout="huge")


def test_the_path_comes_from_the_path_field():
    article = Article(pk=7, title="A")

    assert (
        Analytics(path_field="id", path_prefix="/a/").get_path(article, None) == "/a/7"
    )
    assert Analytics(path_field="body").get_path(article, None) is None


def test_the_path_falls_back_to_get_absolute_url(monkeypatch):
    article = Article(pk=7, title="A")

    assert Analytics().get_path(article, None) is None

    monkeypatch.setattr(
        Article,
        "get_absolute_url",
        lambda self: f"https://example.com/articles/{self.pk}/",
        raising=False,
    )
    assert Analytics().get_path(article, None) == "/articles/7/"


@pytest.mark.django_db
def test_the_component_reports_on_the_objects_page(component, admin_user, provider):
    article = Article.objects.create(title="A")

    response = client_for(admin_user).get(
        component_url(article, component), {"part": "summary", "range": "7d"}
    )

    assert response.status_code == 200
    assert response.json()["path"] == f"/articles/{article.pk}/"
    assert provider.calls == [("summary", f"/articles/{article.pk}/")]


@pytest.mark.django_db
def test_the_component_without_a_path_says_so(monkeypatch, analytics, admin_user):
    component = Analytics()
    monkeypatch.setattr(
        ArticleAdmin, "edit_sidebar", list(ArticleAdmin.edit_sidebar) + [component]
    )
    article = Article.objects.create(title="A")

    response = client_for(admin_user).get(component_url(article, component))

    assert response.json() == {"path": None}


@pytest.mark.django_db
def test_the_component_has_no_realtime_part(component, admin_user):
    article = Article.objects.create(title="A")

    response = client_for(admin_user).get(
        component_url(article, component), {"part": "realtime"}
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_the_component_needs_view_permission(component):
    article = Article.objects.create(title="A")
    user = User.objects.create_user(username="nobody", password="x", is_staff=True)

    assert client_for(user).get(component_url(article, component)).status_code in (
        403,
        404,
    )

    user.user_permissions.add(Permission.objects.get(codename="view_article"))
    user = User.objects.get(pk=user.pk)

    assert client_for(user).get(component_url(article, component)).status_code == 200


@pytest.mark.django_db
def test_top_pages_link_to_their_objects(component, admin_user, provider):
    first = Article.objects.create(title="First")
    second = Article.objects.create(title="Second")
    provider.pks = (first.pk, second.pk, 9999)

    response = report(admin_user, part="breakdown", dimension="pages")
    rows = {row["key"]: row["object"] for row in response.data["rows"]}

    assert rows[f"/articles/{first.pk}/"] == {
        "model": "testapp.article",
        "id": str(first.pk),
        "title": "First",
    }
    assert rows[f"/articles/{second.pk}/"]["title"] == "Second"
    assert rows["/articles/9999/"] is None


@pytest.mark.django_db
def test_top_pages_only_link_objects_the_editor_may_see(component, provider):
    article = Article.objects.create(title="Secret")
    provider.pks = (article.pk,)
    user = User.objects.create_user(username="ed", password="x", is_staff=True)

    response = report(user, part="breakdown", dimension="pages")

    assert response.data["rows"][0]["object"] is None


def test_get_objects_accepts_a_missing_trailing_slash():
    component = Analytics(path_field="slug", path_prefix="/blog/")

    class Queryset:
        def filter(self, slug__in):
            self.values = slug__in
            return [type("Obj", (), {"slug": value})() for value in slug__in]

    queryset = Queryset()
    found = component.get_objects(
        ["/blog/a", "/blog/b/", "/blog/c/d", "/other/e"], queryset, None
    )

    assert sorted(queryset.values) == ["a", "b"]
    assert sorted(found) == ["/blog/a", "/blog/b/"]


# The dashboard widgets.


def test_the_statistic_widget_reports_the_metric_and_trend(analytics):
    data = AnalyticsStatisticWidget("visitors", range="7d").get_data(request_for())
    data.is_valid(raise_exception=True)

    assert data.data["title"] == "Visitors"
    assert data.data["value"] == 120
    assert data.data["trend"] == "20.0"
    assert data.data["trend_sentiment"] == "positive"
    assert data.data["footnote"] == "Last 7 days"
    assert len(data.data["series"]) == 7


def test_a_falling_bounce_rate_is_positive(analytics):
    data = AnalyticsStatisticWidget("bounce_rate").get_data(request_for())
    data.is_valid(raise_exception=True)

    assert data.data["suffix"] == "%"
    assert data.data["trend"] == "-20.0"
    assert data.data["trend_sentiment"] == "positive"
    assert data.data["series"] == []


def test_the_statistic_widget_survives_a_failing_provider(monkeypatch):
    monkeypatch.setattr(
        admin_site,
        "extensions",
        [AnalyticsExtension(provider=FailingProvider())],
        raising=False,
    )

    data = AnalyticsStatisticWidget().get_data(request_for())
    data.is_valid(raise_exception=True)

    assert data.data["value"] == 0
    assert data.data["footnote"] == "Analytics are unavailable"


def test_widgets_reject_unknown_metrics_and_ranges():
    with pytest.raises(ValueError):
        AnalyticsStatisticWidget("revenue")
    with pytest.raises(ValueError):
        AnalyticsTopPagesWidget(range="custom")


@pytest.mark.django_db
def test_the_top_pages_widget_lists_pages_with_their_visitors(
    component, provider, admin_user
):
    article = Article.objects.create(title="Linked")
    provider.pks = (article.pk, 4242)

    data = AnalyticsTopPagesWidget().get_data(request_for(admin_user))
    data.is_valid(raise_exception=True)

    assert data.data["view_all"] == "/analytics/"
    assert data.data["content"][0]["model"] == "testapp.article"
    assert data.data["content"][0]["title"] == "Linked"
    assert data.data["content"][0]["description"] == f"/articles/{article.pk}/"
    assert data.data["content"][0]["value"] == 10
    assert data.data["content"][1]["model"] == ""
    assert data.data["content"][1]["title"] == "/articles/4242/"


# The checks.


def site_with(*extensions, dashboard=None, registry=None):
    class Site:
        pass

    site = Site()
    site.extensions = list(extensions)
    site.dashboard = dashboard
    site._registry = registry or {}
    return site


def test_a_complete_setup_passes_the_checks(provider):
    site = site_with(
        AnalyticsExtension(provider=provider), AnalyticsPage(), AnalyticsLink()
    )

    assert analytics_errors(site) == []


def test_analytics_without_an_extension_are_reported():
    site = site_with(
        AnalyticsPage(),
        AnalyticsLink(),
        dashboard=Dashboard(widgets=[AnalyticsStatisticWidget()]),
        registry={Article: ArticleAdmin(Article, admin_site)},
    )

    messages = [message for _id, message in analytics_errors(site)]

    assert {check_id for check_id, _ in analytics_errors(site)} == {
        "content_studio.E037"
    }
    assert len(messages) == 3
    assert "AnalyticsPage" in messages[0]


def test_two_extensions_and_taken_paths_are_reported(provider):
    site = site_with(
        AnalyticsExtension(provider=provider),
        AnalyticsExtension(
            provider=provider, extension_id="9f0f62a6-2a7f-4bd1-9a48-c4f2d6a0d5ce"
        ),
        AnalyticsPage(path="content/stats/"),
        DashboardPage(path="stats/", title="Stats", dashboard=Dashboard()),
        AnalyticsPage(path="stats/"),
    )

    messages = [message for _id, message in analytics_errors(site)]

    assert any("more than one AnalyticsExtension" in m for m in messages)
    assert any("more than one AnalyticsPage" in m for m in messages)
    assert sum("is taken" in m for m in messages) == 2


def test_unknown_provider_metrics_are_reported():
    class Odd(FakeProvider):
        metrics = ("visitors", "revenue")

    errors = analytics_errors(site_with(AnalyticsExtension(provider=Odd())))

    assert len(errors) == 1
    assert "'revenue'" in errors[0][1]


def test_provider_warnings_are_reported():
    site = site_with(AnalyticsExtension(provider=UmamiProvider()))

    assert [check_id for check_id, _ in analytics_warnings(site)] == [
        "content_studio.W023",
        "content_studio.W023",
    ]
    assert analytics_warnings(site_with()) == []


# The Umami provider.


class FakeResponse:
    def __init__(self, data):
        self.data = data

    def read(self):
        return json.dumps(self.data).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def umami_query(path=None, interval="day"):
    tz = ZoneInfo("Europe/Amsterdam")
    return AnalyticsQuery(
        start=datetime(2026, 10, 1, tzinfo=tz),
        end=datetime(2026, 10, 4, tzinfo=tz),
        interval=interval,
        timezone=tz,
        path=path,
    )


@pytest.fixture
def umami_calls():
    calls = []

    def respond(responses):
        def urlopen(request, timeout):
            calls.append(request)
            endpoint = request.full_url.split("?")[0].rsplit("/", 1)[1]
            return FakeResponse(responses[endpoint])

        return mock.patch("content_studio.analytics.umami.urlopen", side_effect=urlopen)

    respond.calls = calls
    return respond


def test_umami_cloud_sends_the_key_in_its_header(umami_calls):
    provider = UmamiProvider(website_id="site-1", api_key="key")
    stats = {"pageviews": 1, "visitors": 1, "visits": 1, "bounces": 0, "totaltime": 0}

    with umami_calls({"stats": stats}):
        provider.get_summary(None, umami_query())

    request = umami_calls.calls[0]
    assert request.full_url.startswith("https://api.umami.is/v1/websites/site-1/stats?")
    assert request.get_header("X-umami-api-key") == "key"
    assert request.get_header("Authorization") is None
    assert provider.get_dashboard_url(None, umami_query()) is None


def test_self_hosted_umami_takes_a_bearer_token(umami_calls):
    provider = UmamiProvider(
        website_id="site-1", api_key="umami_key", url="https://stats.example.com/"
    )

    with umami_calls({"active": {"visitors": 4}}):
        assert provider.get_realtime(None) == 4

    request = umami_calls.calls[0]
    assert request.full_url == "https://stats.example.com/api/websites/site-1/active"
    assert request.get_header("Authorization") == "Bearer umami_key"
    assert (
        provider.get_dashboard_url(None, umami_query())
        == "https://stats.example.com/websites/site-1"
    )


def test_umami_summary_derives_bounce_rate_and_duration(umami_calls):
    provider = UmamiProvider(website_id="s", api_key="k")
    stats = {
        "pageviews": 500,
        "visitors": 150,
        "visits": 200,
        "bounces": 80,
        "totaltime": 24000,
        "comparison": {
            "pageviews": 400,
            "visitors": 100,
            "visits": 160,
            "bounces": 80,
            "totaltime": 16000,
        },
    }

    with umami_calls({"stats": stats}):
        summary = provider.get_summary(None, umami_query(path="/blog/a/"))

    assert summary["visitors"] == MetricValue(150, previous=100)
    assert summary["bounce_rate"] == MetricValue(40, previous=50)
    assert summary["visit_duration"] == MetricValue(120, previous=100)

    params = umami_calls.calls[0].full_url.split("?")[1]
    assert "path=%2Fblog%2Fa%2F" in params
    assert "timezone=Europe%2FAmsterdam" in params
    assert f"startAt={int(umami_query().start.timestamp() * 1000)}" in params
    assert f"endAt={int(umami_query().end.timestamp() * 1000) - 1}" in params


def test_umami_summary_reads_the_older_response_shape(umami_calls):
    provider = UmamiProvider(website_id="s", api_key="k")
    stats = {
        "pageviews": {"value": 10, "prev": 5},
        "uniques": {"value": 4, "prev": 2},
    }

    with umami_calls({"stats": stats}):
        summary = provider.get_summary(None, umami_query())

    assert summary == {
        "visitors": MetricValue(4, previous=2),
        "pageviews": MetricValue(10, previous=5),
    }


def test_umami_timeseries_fills_empty_buckets(umami_calls):
    provider = UmamiProvider(website_id="s", api_key="k")
    data = {
        "pageviews": [{"x": "2026-10-01T00:00:00Z", "y": 9}],
        "sessions": [
            {"x": "2026-10-01T00:00:00Z", "y": 3},
            {"x": "2026-10-03 00:00:00", "y": 5},
        ],
        "compare": {"sessions": [{"x": "2026-09-29T00:00:00Z", "y": 2}]},
    }

    with umami_calls({"pageviews": data}):
        points = provider.get_timeseries(None, umami_query(), "visitors")

    assert [(p.date.day, p.value, p.previous) for p in points] == [
        (1, 3, 0),
        (2, 0, 2),
        (3, 5, 0),
    ]
    assert "unit=day" in umami_calls.calls[0].full_url
    assert "compare=prev" in umami_calls.calls[0].full_url


def test_umami_breakdowns_map_to_metric_types(umami_calls):
    provider = UmamiProvider(website_id="s", api_key="k")

    with umami_calls({"metrics": [{"x": "NL", "y": 7}, {"x": "DE", "y": 3}]}):
        rows = provider.get_breakdown(None, umami_query(), "countries", 1)

    assert rows == [BreakdownRow(key="NL", value=7)]
    assert "type=country" in umami_calls.calls[0].full_url
    assert "limit=1" in umami_calls.calls[0].full_url


@pytest.mark.parametrize(
    "error",
    [
        HTTPError("u", 401, "Unauthorized", {}, None),
        URLError("refused"),
        TimeoutError(),
    ],
)
def test_umami_failures_become_analytics_errors(error):
    provider = UmamiProvider(website_id="s", api_key="k")

    with mock.patch("content_studio.analytics.umami.urlopen", side_effect=error):
        with pytest.raises(AnalyticsError):
            provider.get_realtime(None)


def test_umami_needs_a_website_and_key():
    with pytest.raises(AnalyticsError, match="website_id"):
        UmamiProvider().get_realtime(None)


def test_a_website_per_tenant_keeps_its_own_cache_key():
    class TenantUmami(UmamiProvider):
        def get_website_id(self, request):
            return request.tenant

    provider = TenantUmami(api_key="k")

    assert provider.get_cache_key(
        type("R", (), {"tenant": "a"})()
    ) != provider.get_cache_key(type("R", (), {"tenant": "b"})())
    assert provider.check() == []
