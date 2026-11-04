"""
Tests for the map and embed widgets and the SEO preview: their options,
the oEmbed previews and endpoint, the map settings in discover, and the
system checks around them.
"""

import io
import json
from contextlib import contextmanager
from urllib.error import HTTPError, URLError

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from content_studio import oembed, widgets
from content_studio.checks import check_content_studio
from content_studio.form import Field, FormSet, SEOPreview, Title
from content_studio.token_backends.jwt import create_access_token
from tests.testapp.admin import ArticleAdmin, EventAdmin, ProductAdmin


def serialized(widget):
    return widget.serialize()


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}")
    return client


def errors_with(check_id):
    return [m for m in check_content_studio() if m.id == check_id]


# Widgets


def test_map_widget_options():
    assert serialized(widgets.MapWidget()) == {"name": "MapWidget", "options": {}}
    assert serialized(
        widgets.MapWidget(lng_field="longitude", center=(52.37, 4.89), zoom=7)
    )["options"] == {"lng_field": "longitude", "center": [52.37, 4.89], "zoom": 7}


@pytest.mark.parametrize(
    "options",
    [
        {"lng_field": ""},
        {"lng_field": 3},
        {"center": (52.37,)},
        {"center": "52.37,4.89"},
        {"center": (91, 0)},
        {"center": (0, -181)},
        {"center": (True, 0)},
        {"zoom": -1},
        {"zoom": 20},
        {"zoom": 2.5},
        {"zoom": True},
    ],
)
def test_map_widget_rejects_invalid_options(options):
    with pytest.raises((TypeError, ValueError)):
        widgets.MapWidget(**options)


def test_embed_widget_takes_a_placeholder():
    assert serialized(widgets.EmbedWidget()) == {"name": "EmbedWidget", "options": {}}
    assert serialized(widgets.EmbedWidget(placeholder="https://youtube.com/..."))[
        "options"
    ] == {"placeholder": "https://youtube.com/..."}


# SEOPreview


def test_seo_preview_serializes_its_fields():
    preview = SEOPreview(
        title_field="title",
        description_field="summary",
        base_url="https://example.com/blog/",
        path_field="slug",
        site_name="Example",
    )

    assert preview.serialize() == {
        "type": "component",
        "component_type": "SEOPreview",
        "component_id": str(preview.component_id),
        "title_field": "title",
        "description_field": "summary",
        "base_url": "https://example.com/blog/",
        "path_field": "slug",
        "site_name": "Example",
    }


def test_seo_preview_needs_only_a_title_field():
    preview = SEOPreview(title_field="title")

    assert preview.serialize()["description_field"] is None
    assert preview.serialize()["base_url"] is None
    assert preview.serialize()["path_field"] is None
    assert preview.serialize()["site_name"] is None


def test_seo_preview_fields_can_be_class_attributes():
    class ArticlePreview(SEOPreview):
        title_field = "title"
        base_url = "https://example.com/"
        path_field = "slug"

    assert ArticlePreview().serialize()["path_field"] == "slug"
    assert ArticlePreview(path_field="path").serialize()["path_field"] == "path"


@pytest.mark.parametrize(
    "options",
    [
        {},
        {"title_field": ""},
        {"title_field": 1},
        {"title_field": "title", "description_field": ""},
        {"title_field": "title", "path_field": 2},
        {"title_field": "title", "base_url": 3},
    ],
)
def test_seo_preview_rejects_invalid_options(options):
    with pytest.raises((TypeError, ValueError)):
        SEOPreview(**options)


def test_seo_preview_ids_follow_the_fields():
    one = SEOPreview(title_field="title", path_field="slug", base_url="https://a/")
    same = SEOPreview(title_field="title", path_field="slug", base_url="https://a/")
    other = SEOPreview(title_field="title", path_field="path", base_url="https://a/")

    assert one.component_id == same.component_id
    assert one.component_id != other.component_id


def test_seo_preview_fits_in_form_sets():
    preview = SEOPreview(title_field="title")

    assert FormSet(fields=["title", preview]).get_fields()[1] is preview


# Checks


def test_seo_preview_fields_must_exist(monkeypatch):
    monkeypatch.setattr(
        ProductAdmin,
        "edit_sidebar",
        [
            SEOPreview(
                title_field="title",
                description_field="summary",
                path_field="slug",
                base_url="https://example.com/",
            )
        ],
    )

    errors = errors_with("content_studio.E036")

    assert len(errors) == 1
    assert "description_field 'summary'" in errors[0].msg


def test_seo_preview_with_model_fields_passes(monkeypatch):
    monkeypatch.setattr(
        ProductAdmin,
        "edit_main",
        [
            FormSet(
                fields=[
                    "title",
                    SEOPreview(title_field="title", path_field="slug"),
                ]
            )
        ],
    )

    assert errors_with("content_studio.E036") == []


def test_seo_preview_is_rejected_in_the_header(monkeypatch):
    monkeypatch.setattr(ArticleAdmin, "edit_header", [SEOPreview(title_field="title")])

    errors = errors_with("content_studio.E020")

    assert len(errors) == 1
    assert "a preview" in errors[0].msg


def test_map_widget_on_a_json_field_passes(monkeypatch):
    monkeypatch.setattr(
        EventAdmin, "edit_main", [Field("details", widget=widgets.MapWidget)]
    )

    assert errors_with("content_studio.E035") == []


def test_map_widget_on_a_json_field_takes_no_lng_field(monkeypatch):
    monkeypatch.setattr(
        EventAdmin,
        "edit_main",
        [Field("details", widget=widgets.MapWidget(lng_field="price"))],
    )

    errors = errors_with("content_studio.E035")

    assert len(errors) == 1
    assert "lng_field is for a latitude number field" in errors[0].msg


def test_map_widget_on_a_number_field_needs_lng_field(monkeypatch):
    monkeypatch.setattr(
        EventAdmin, "edit_main", [Field("price", widget=widgets.MapWidget)]
    )

    errors = errors_with("content_studio.E035")

    assert len(errors) == 1
    assert "needs lng_field" in errors[0].msg


@pytest.mark.parametrize("lng_field", ["price", "attendees", "nope"])
def test_map_widget_lng_field_must_be_another_number_field(monkeypatch, lng_field):
    monkeypatch.setattr(
        EventAdmin,
        "edit_main",
        [Field("price", widget=widgets.MapWidget(lng_field=lng_field))],
    )

    errors = errors_with("content_studio.E035")

    assert len(errors) == 1
    assert f"lng_field {lng_field!r}" in errors[0].msg


def test_map_widget_on_another_field_type_is_rejected(monkeypatch):
    monkeypatch.setattr(
        EventAdmin, "edit_main", [Field("title", widget=widgets.MapWidget)]
    )

    errors = errors_with("content_studio.E035")

    assert len(errors) == 1
    assert "is neither" in errors[0].msg


@pytest.mark.parametrize(
    "overrides",
    [
        {"MAP_TILE_URL": "https://tiles.example.com/{z}/{x}.png"},
        {"MAP_TILE_URL": None},
        {"MAP_TILE_ATTRIBUTION": None},
        {"MAP_GEOCODER_URL": "nominatim.example.com"},
        {"OEMBED_PROVIDERS": {"name": "x"}},
        {"OEMBED_PROVIDERS": ["YouTube"]},
        {"OEMBED_PROVIDERS": [{"endpoint": "https://a/oembed", "patterns": ["a"]}]},
        {
            "OEMBED_PROVIDERS": [
                {"name": "A", "endpoint": "a/oembed", "patterns": ["a"]}
            ]
        },
        {"OEMBED_PROVIDERS": [{"name": "A", "endpoint": "https://a/oembed"}]},
        {
            "OEMBED_PROVIDERS": [
                {"name": "A", "endpoint": "https://a/oembed", "patterns": ["("]}
            ]
        },
    ],
)
def test_malformed_map_settings_surface_as_system_error(overrides):
    with override_settings(CONTENT_STUDIO=overrides):
        errors = errors_with("content_studio.E034")

    assert len(errors) == 1


def test_valid_map_settings_pass():
    with override_settings(
        CONTENT_STUDIO={
            "MAP_TILE_URL": "https://tiles.example.com/{z}/{x}/{y}@2x.png",
            "MAP_TILE_ATTRIBUTION": "",
            "MAP_GEOCODER_URL": None,
            "OEMBED_PROVIDERS": [
                {
                    "name": "PeerTube",
                    "endpoint": "https://tube.example.com/services/oembed",
                    "patterns": [r"https://tube\.example\.com/w/"],
                }
            ],
        }
    ):
        assert errors_with("content_studio.E034") == []


# Discover


@pytest.mark.django_db
def test_discover_carries_the_map_settings(admin_user):
    data = client_for(admin_user).get("/api/discover").json()

    assert data["map"] == {
        "tile_url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        "tile_attribution": (
            '&copy; <a href="https://www.openstreetmap.org/copyright">'
            "OpenStreetMap</a> contributors"
        ),
        "geocoder_url": "https://nominatim.openstreetmap.org/search",
    }


# oEmbed


@pytest.mark.parametrize(
    "url,provider",
    [
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "YouTube"),
        ("https://youtu.be/dQw4w9WgXcQ", "YouTube"),
        ("https://www.youtube.com/shorts/abc", "YouTube"),
        ("https://vimeo.com/123456", "Vimeo"),
        ("https://open.spotify.com/track/abc", "Spotify"),
        ("https://soundcloud.com/artist/track", "SoundCloud"),
        ("https://www.dailymotion.com/video/x123", "Dailymotion"),
        ("https://www.tiktok.com/@user/video/1", "TikTok"),
        ("https://www.flickr.com/photos/user/1/", "Flickr"),
        ("https://bsky.app/profile/user.bsky.social/post/abc", "Bluesky"),
        ("https://x.com/user/status/1", "X"),
        ("https://twitter.com/user/status/1", "X"),
        ("https://www.mixcloud.com/user/show/", "Mixcloud"),
        ("https://codepen.io/user/pen/abc", "CodePen"),
        ("https://giphy.com/gifs/abc", "Giphy"),
        ("HTTPS://YOUTU.BE/abc", "YouTube"),
    ],
)
def test_built_in_providers_match_their_urls(url, provider):
    assert oembed.find_provider(url)["name"] == provider


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/video",
        "https://notyoutube.com/watch?v=1",
        "https://www.youtube.com/user/channel",
        "https://x.com/user",
    ],
)
def test_other_urls_have_no_provider(url):
    assert oembed.find_provider(url) is None


def test_providers_setting_replaces_the_list():
    providers = [
        {
            "name": "PeerTube",
            "endpoint": "https://tube.example.com/services/oembed",
            "patterns": [r"https://tube\.example\.com/w/"],
        }
    ]

    with override_settings(CONTENT_STUDIO={"OEMBED_PROVIDERS": providers}):
        assert oembed.find_provider("https://tube.example.com/w/abc") is providers[0]
        assert oembed.find_provider("https://youtu.be/abc") is None


@contextmanager
def provider_answering(monkeypatch, body=None, error=None):
    """urlopen answering with the JSON body, or raising the error."""
    requests = []

    class FakeResponse(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            self.close()

    def urlopen(request, timeout):
        requests.append((request, timeout))

        if error is not None:
            raise error

        return FakeResponse(
            body if isinstance(body, bytes) else json.dumps(body).encode()
        )

    monkeypatch.setattr(oembed, "urlopen", urlopen)
    yield requests


YOUTUBE = {
    "type": "video",
    "provider_name": "YouTube",
    "title": "A video",
    "author_name": "A channel",
    "author_url": "https://www.youtube.com/@channel",
    "thumbnail_url": "https://i.ytimg.com/vi/abc/hqdefault.jpg",
    "thumbnail_width": 480,
    "thumbnail_height": 360,
    "html": "<iframe></iframe>",
}


def test_fetch_asks_the_provider_and_keeps_the_preview(monkeypatch):
    with provider_answering(monkeypatch, YOUTUBE) as requests:
        preview = oembed.fetch(" https://youtu.be/abc ")

    assert preview == {
        "provider": "YouTube",
        "type": "video",
        "title": "A video",
        "author": "A channel",
        "author_url": "https://www.youtube.com/@channel",
        "thumbnail": "https://i.ytimg.com/vi/abc/hqdefault.jpg",
        "thumbnail_width": 480,
        "thumbnail_height": 360,
        "url": "https://youtu.be/abc",
    }
    # The provider's endpoint is asked, never the URL itself.
    [(request, timeout)] = requests
    assert request.full_url == (
        "https://www.youtube.com/oembed?url=https%3A%2F%2Fyoutu.be%2Fabc&format=json"
    )
    assert request.get_header("User-agent").startswith("django-content-studio/")
    assert timeout == oembed.TIMEOUT


def test_fetch_caches_the_preview(monkeypatch):
    with provider_answering(monkeypatch, YOUTUBE) as requests:
        first = oembed.fetch("https://youtu.be/abc")
        second = oembed.fetch("https://youtu.be/abc")

    assert first == second
    assert len(requests) == 1
    assert cache.get(oembed.cache_key("https://youtu.be/abc")) == first


def test_fetch_drops_unsafe_and_odd_values(monkeypatch):
    body = {
        **YOUTUBE,
        "thumbnail_url": "javascript:alert(1)",
        "author_url": "",
        "thumbnail_width": "480",
        "thumbnail_height": -1,
        "title": 7,
        "provider_name": "",
    }

    with provider_answering(monkeypatch, body):
        preview = oembed.fetch("https://youtu.be/abc")

    assert preview["thumbnail"] is None
    assert preview["author_url"] is None
    assert preview["thumbnail_width"] is None
    assert preview["thumbnail_height"] is None
    assert preview["title"] is None
    # The provider's own name is the fallback.
    assert preview["provider"] == "YouTube"


@pytest.mark.parametrize(
    "url", ["", "youtu.be/abc", "ftp://youtu.be/abc", "mailto:a@b"]
)
def test_fetch_wants_a_web_address(monkeypatch, url):
    with provider_answering(monkeypatch, YOUTUBE) as requests:
        with pytest.raises(oembed.OEmbedError) as excinfo:
            oembed.fetch(url)

    assert excinfo.value.status == 404
    assert requests == []


def test_fetch_without_a_provider_is_not_found(monkeypatch):
    with provider_answering(monkeypatch, YOUTUBE) as requests:
        with pytest.raises(oembed.OEmbedError) as excinfo:
            oembed.fetch("https://example.com/video")

    assert excinfo.value.status == 404
    assert "No known provider" in str(excinfo.value)
    assert requests == []


def http_error(code):
    return HTTPError("https://www.youtube.com/oembed", code, "", {}, io.BytesIO())


@pytest.mark.parametrize(
    "error,status",
    [
        (http_error(404), 404),
        (http_error(401), 404),
        (http_error(403), 404),
        (http_error(400), 404),
        (http_error(500), 502),
        (http_error(429), 502),
        (URLError("refused"), 502),
        (TimeoutError(), 502),
        (ValueError("bad status line"), 502),
    ],
)
def test_fetch_reports_provider_failures(monkeypatch, error, status):
    with provider_answering(monkeypatch, error=error):
        with pytest.raises(oembed.OEmbedError) as excinfo:
            oembed.fetch("https://youtu.be/abc")

    assert excinfo.value.status == status
    assert cache.get(oembed.cache_key("https://youtu.be/abc")) is None


@pytest.mark.parametrize("body", [b"not json", b"[]", b'"text"'])
def test_fetch_rejects_answers_that_are_not_objects(monkeypatch, body):
    with provider_answering(monkeypatch, body):
        with pytest.raises(oembed.OEmbedError) as excinfo:
            oembed.fetch("https://youtu.be/abc")

    assert excinfo.value.status == 502


def test_fetch_appends_to_an_endpoint_with_a_query(monkeypatch):
    providers = [
        {
            "name": "Keyed",
            "endpoint": "https://embed.example.com/oembed?key=abc",
            "patterns": [r"https://example\.com/"],
        }
    ]

    with override_settings(CONTENT_STUDIO={"OEMBED_PROVIDERS": providers}):
        with provider_answering(monkeypatch, {"title": "x"}) as requests:
            preview = oembed.fetch("https://example.com/v/1")

    assert requests[0][0].full_url.startswith(
        "https://embed.example.com/oembed?key=abc&url="
    )
    assert preview["provider"] == "Keyed"


# The endpoint


@pytest.mark.django_db
def test_oembed_endpoint_answers_with_the_preview(monkeypatch, admin_user):
    with provider_answering(monkeypatch, YOUTUBE):
        response = client_for(admin_user).get(
            "/api/oembed", {"url": "https://youtu.be/abc"}
        )

    assert response.status_code == 200
    assert response.json()["title"] == "A video"
    assert "html" not in response.json()


@pytest.mark.django_db
def test_oembed_endpoint_reports_the_error_status(monkeypatch, admin_user):
    client = client_for(admin_user)

    with provider_answering(monkeypatch, YOUTUBE):
        unknown = client.get("/api/oembed", {"url": "https://example.com/v"})

    with provider_answering(monkeypatch, error=http_error(500)):
        failed = client.get("/api/oembed", {"url": "https://youtu.be/abc"})

    assert unknown.status_code == 404
    assert "No known provider" in unknown.json()["detail"]
    assert failed.status_code == 502
    assert "did not answer" in failed.json()["detail"]


@pytest.mark.django_db
def test_oembed_endpoint_needs_a_url(admin_user):
    response = client_for(admin_user).get("/api/oembed")

    assert response.status_code == 400


@pytest.mark.django_db
def test_oembed_endpoint_needs_staff(monkeypatch, django_user_model):
    customer = django_user_model.objects.create_user(username="c", password="x")

    with provider_answering(monkeypatch, YOUTUBE) as requests:
        anonymous = APIClient().get("/api/oembed", {"url": "https://youtu.be/abc"})
        other = client_for(customer).get("/api/oembed", {"url": "https://youtu.be/abc"})

    assert anonymous.status_code == 401
    assert other.status_code == 401
    assert requests == []


def test_text_components_still_fit_next_to_the_preview():
    # A sanity check that SEOPreview is a plain component, not a text one.
    assert not isinstance(SEOPreview(title_field="title"), type(Title("x")))
