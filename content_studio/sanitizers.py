import nh3
from django.conf import settings
from django.utils.module_loading import import_string

DEFAULT_TAGS = {
    "a",
    "abbr",
    "audio",
    "b",
    "blockquote",
    "br",
    "cite",
    "code",
    "dd",
    "div",
    "dl",
    "dt",
    "em",
    "figcaption",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "img",
    "li",
    "mark",
    "ol",
    "p",
    "picture",
    "pre",
    "q",
    "s",
    "small",
    "source",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "time",
    "tr",
    "u",
    "ul",
    "video",
}

DEFAULT_ATTRIBUTES = {
    "*": {"class"},
    "a": {"href", "title", "target"},
    "audio": {"src", "controls", "preload"},
    "img": {"src", "alt", "title", "width", "height", "loading"},
    "ol": {"start"},
    "source": {"src", "type"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan", "scope"},
    "video": {"src", "controls", "poster", "preload", "width", "height"},
}

DEFAULT_URL_SCHEMES = {"http", "https", "mailto", "tel"}


def sanitize_html(value: str) -> str:
    """
    The default HTML sanitizer: keeps a CMS-friendly allowlist of tags,
    attributes and URL schemes, strips comments, and drops everything
    else (including the content of script and style tags).
    """
    if not value:
        return value

    return nh3.clean(
        value,
        tags=DEFAULT_TAGS,
        attributes=DEFAULT_ATTRIBUTES,
        url_schemes=DEFAULT_URL_SCHEMES,
    )


def get_default_sanitizer():
    """
    Resolves the project-wide default sanitizer: the HTML_SANITIZER key of
    the BLUEPRINT setting (a callable or dotted import path), falling
    back to the built-in sanitize_html. Resolved lazily on every save so
    settings overrides (and tests) take effect immediately.
    """
    config = getattr(settings, "BLUEPRINT", None) or {}
    sanitizer = config.get("HTML_SANITIZER")

    if sanitizer is None:
        return sanitize_html

    if callable(sanitizer):
        return sanitizer

    return import_string(sanitizer)
