"""
oEmbed previews for EmbedWidget: the providers the admin knows, and
fetching a preview (the title and thumbnail) of a URL from its
provider. Only the providers' own endpoints are requested, never the
URL itself, so the server does not fetch arbitrary addresses.
"""

import hashlib
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from django.core.cache import cache
from django.utils.translation import gettext_lazy as _

from . import __version__
from .settings import cs_settings

# The providers EmbedWidget embeds by default: each with its oEmbed
# endpoint and the URL patterns it serves, as regular expressions
# matched against the start of the URL (case-insensitively).
PROVIDERS = [
    {
        "name": "YouTube",
        "endpoint": "https://www.youtube.com/oembed",
        "patterns": [
            r"https?://(www\.|m\.)?youtube\.com/(watch\?|shorts/|live/|playlist\?)",
            r"https?://youtu\.be/",
        ],
    },
    {
        "name": "Vimeo",
        "endpoint": "https://vimeo.com/api/oembed.json",
        "patterns": [r"https?://(www\.|player\.)?vimeo\.com/"],
    },
    {
        "name": "Spotify",
        "endpoint": "https://open.spotify.com/oembed",
        "patterns": [r"https?://open\.spotify\.com/"],
    },
    {
        "name": "SoundCloud",
        "endpoint": "https://soundcloud.com/oembed",
        "patterns": [r"https?://(www\.|on\.)?soundcloud\.com/"],
    },
    {
        "name": "Dailymotion",
        "endpoint": "https://www.dailymotion.com/services/oembed",
        "patterns": [
            r"https?://(www\.)?dailymotion\.com/video/",
            r"https?://dai\.ly/",
        ],
    },
    {
        "name": "TikTok",
        "endpoint": "https://www.tiktok.com/oembed",
        "patterns": [r"https?://(www\.)?tiktok\.com/"],
    },
    {
        "name": "Flickr",
        "endpoint": "https://www.flickr.com/services/oembed/",
        "patterns": [
            r"https?://(www\.)?flickr\.com/photos/",
            r"https?://flic\.kr/p/",
        ],
    },
    {
        "name": "Bluesky",
        "endpoint": "https://embed.bsky.app/oembed",
        "patterns": [r"https?://bsky\.app/profile/"],
    },
    {
        "name": "X",
        "endpoint": "https://publish.twitter.com/oembed",
        "patterns": [r"https?://(www\.|mobile\.)?(twitter|x)\.com/\w+/status/"],
    },
    {
        "name": "Mixcloud",
        "endpoint": "https://app.mixcloud.com/oembed/",
        "patterns": [r"https?://(www\.)?mixcloud\.com/"],
    },
    {
        "name": "CodePen",
        "endpoint": "https://codepen.io/api/oembed",
        "patterns": [r"https?://codepen\.io/"],
    },
    {
        "name": "Giphy",
        "endpoint": "https://giphy.com/services/oembed",
        "patterns": [r"https?://(www\.)?giphy\.com/gifs/", r"https?://gph\.is/"],
    },
]

# Seconds a provider may take to respond.
TIMEOUT = 5
# The most of a provider's response that is read.
MAX_BODY = 256 * 1024
# Seconds a preview is cached for; previews rarely change.
CACHE_TIMEOUT = 24 * 60 * 60


class OEmbedError(Exception):
    """
    A preview could not be made. The status is the HTTP status the
    admin API answers with: 404 when there is nothing to embed, 502
    when the provider failed.
    """

    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def get_providers() -> list[dict]:
    """The providers in use: the OEMBED_PROVIDERS setting, or the built-in list."""
    providers = cs_settings.OEMBED_PROVIDERS

    return PROVIDERS if providers is None else list(providers)


def find_provider(url: str):
    """The provider whose patterns match the URL, or None."""
    for provider in get_providers():
        for pattern in provider.get("patterns", ()):
            if re.match(pattern, url, re.IGNORECASE):
                return provider

    return None


def _text(value):
    return value if isinstance(value, str) and value else None


def _size(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None

    return int(value) if value > 0 else None


def _http_url(value):
    """The value when it is an http(s) URL, for an image source."""
    return (
        value
        if _text(value) and value.lower().startswith(("http://", "https://"))
        else None
    )


def cache_key(url: str) -> str:
    return "content_studio:oembed:" + hashlib.sha256(url.encode()).hexdigest()


def fetch(url: str) -> dict:
    """
    The preview of a URL: its provider, title, author and thumbnail.
    Raises OEmbedError when no provider embeds it, or the provider
    fails. Previews are cached for a day.
    """
    url = url.strip()
    parts = urlsplit(url)

    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise OEmbedError(_("Enter a web address, starting with http."), 404)

    provider = find_provider(url)

    if provider is None:
        raise OEmbedError(_("No known provider embeds this address."), 404)

    key = cache_key(url)
    cached = cache.get(key)

    if cached is not None:
        return cached

    endpoint = provider["endpoint"]
    query = urlencode({"url": url, "format": "json"})
    request = Request(
        f"{endpoint}{'&' if '?' in endpoint else '?'}{query}",
        headers={
            "Accept": "application/json",
            "User-Agent": f"django-content-studio/{__version__}",
        },
    )

    try:
        with urlopen(request, timeout=TIMEOUT) as response:
            body = response.read(MAX_BODY)
    except HTTPError as exc:
        if exc.code in (400, 401, 403, 404, 410):
            raise OEmbedError(_("The provider has no preview for this address."), 404)

        raise OEmbedError(_("The provider did not answer."))
    except (URLError, OSError, ValueError):
        raise OEmbedError(_("The provider did not answer."))

    try:
        data = json.loads(body)
    except ValueError:
        data = None

    if not isinstance(data, dict):
        raise OEmbedError(_("The provider did not answer."))

    preview = {
        "provider": _text(data.get("provider_name")) or provider["name"],
        "type": _text(data.get("type")),
        "title": _text(data.get("title")),
        "author": _text(data.get("author_name")),
        "author_url": _http_url(data.get("author_url")),
        "thumbnail": _http_url(data.get("thumbnail_url")),
        "thumbnail_width": _size(data.get("thumbnail_width")),
        "thumbnail_height": _size(data.get("thumbnail_height")),
        "url": url,
    }
    cache.set(key, preview, CACHE_TIMEOUT)

    return preview
