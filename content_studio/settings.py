"""
Settings for Django Content Studio are all namespaced in the CONTENT_STUDIO setting.
For example your project's `settings.py` file might look like this:

CONTENT_STUDIO = {
    'AUTH_STRATEGIES': [
        'content_studio.strategies.UsernamePasswordStrategy',
    ],
}

This module provides the `api_setting` object, that is used to access
Django Content Studio settings, checking for user settings first, then falling
back to the defaults.
"""

from django.conf import settings

from django.core.signals import setting_changed
from django.utils.module_loading import import_string

SETTINGS_NAMESPACE = "CONTENT_STUDIO"

DEFAULTS = {
    "ADMIN_SITE": "content_studio.admin.admin_site",
    "LOGIN_BACKENDS": [
        "content_studio.login_backends.UsernamePasswordBackend",
    ],
    "EDITED_BY_ATTR": "edited_by",
    "EDITED_AT_ATTR": "edited_at",
    "CREATED_BY_ATTR": "created_by",
    "CREATED_AT_ATTR": "created_at",
    "MEDIA_LIBRARY_MODEL": None,
    "MEDIA_LIBRARY_FOLDER_MODEL": None,
    # Sanitizer applied to HTMLField content on save: a callable or a
    # dotted import path; None uses the built-in allowlist sanitizer.
    "HTML_SANITIZER": None,
    # Attribute on the media item model holding the properties editors
    # set for some types of media, such as an image's focal point (a
    # JSONField). Used when the media model has a JSONField by that
    # name; None turns properties off.
    "MEDIA_PROPERTIES_ATTR": "properties",
    # Attribute on the media item model holding the metadata read from
    # its file (a JSONField, e.g. {"width": 1600, "height": 900}). Used
    # when the media model has a JSONField by that name; None turns
    # reading metadata off.
    "MEDIA_METADATA_ATTR": "metadata",
    # File extensions the media library accepts (lowercase, without the
    # dot); None accepts every extension.
    "MEDIA_LIBRARY_ALLOWED_EXTENSIONS": [
        # Images (SVG is left out: it can carry scripts).
        "avif",
        "gif",
        "jpeg",
        "jpg",
        "png",
        "webp",
        # Video and audio.
        "m4a",
        "mov",
        "mp3",
        "mp4",
        "ogg",
        "wav",
        "webm",
        # Documents.
        "csv",
        "doc",
        "docx",
        "odp",
        "ods",
        "odt",
        "pdf",
        "ppt",
        "pptx",
        "txt",
        "xls",
        "xlsx",
    ],
    # Maximum upload size of a media library file in bytes; None for no
    # limit.
    "MEDIA_LIBRARY_MAX_UPLOAD_SIZE": 50 * 1024 * 1024,
    "TENANT_MODEL": None,
    # Whether edit and list pages show which users have an object open;
    # a studio opts out with presence = False.
    "PRESENCE": True,
    # The cache alias presence is stored in. Across several processes or
    # servers it must be a shared cache (Redis, Memcached, database).
    "PRESENCE_CACHE": "default",
    # Hosts webhooks may reach although they resolve to a private,
    # loopback or link-local address, or are served over plain HTTP.
    "WEBHOOK_ALLOWED_HOSTS": [],
    # Attempts per webhook delivery before it is marked as failed.
    "WEBHOOK_MAX_ATTEMPTS": 5,
    # Seconds a webhook request may take, to connect and to respond.
    "WEBHOOK_TIMEOUT": 5,
    # Days finished webhook deliveries are kept; None keeps them.
    "WEBHOOK_DELIVERY_RETENTION": 30,
    "PASSWORD_RESET_EXPIRATION_TIME": 10,
    # Rate limit for the password reset endpoints, per IP; None disables
    # throttling.
    "PASSWORD_RESET_THROTTLE_RATE": "10/hour",
    # Rate limit for login attempts, per IP; None disables throttling.
    "LOGIN_THROTTLE_RATE": "10/min",
    # Token backend used to authenticate the admin API.
    "TOKEN_BACKEND": "content_studio.token_backends.JsonWebTokenBackend",
    # Access token lifetime in seconds; the token lives in browser memory.
    "TOKEN_LIFETIME": 60 * 60,
    # Refresh token lifetime in seconds; the token lives in an httpOnly cookie.
    "REFRESH_TOKEN_LIFETIME": 7 * 24 * 60 * 60,
    # Seconds after login past which a session can no longer be renewed
    # and the user has to log in again; None for no maximum.
    "MAX_SESSION_LIFETIME": 30 * 24 * 60 * 60,
    # The cache alias used and logged-out tokens are recorded in. Across
    # several processes or servers it must be a shared cache (Redis,
    # Memcached, database), or a token revoked in one worker still works
    # in another.
    "TOKEN_CACHE": "default",
    # Whether the refresh token cookie is Secure (sent over HTTPS only).
    # None: secure for HTTPS requests and whenever DEBUG is off, so a
    # deployment behind a TLS-terminating proxy without
    # SECURE_PROXY_SSL_HEADER still gets a secure cookie.
    "REFRESH_COOKIE_SECURE": None,
    # Signing key for tokens; None falls back to the Django SECRET_KEY.
    "TOKEN_SIGNING_KEY": None,
    # Algorithm used to sign tokens (see PyJWT for the supported options).
    "TOKEN_ALGORITHM": "HS256",
}


# List of settings that may be in string import notation.
IMPORT_STRINGS = [
    "ADMIN_SITE",
    "LOGIN_BACKENDS",
    "MEDIA_LIBRARY_MODEL",
    "MEDIA_LIBRARY_FOLDER_MODEL",
    "HTML_SANITIZER",
    "TENANT_MODEL",
    "TOKEN_BACKEND",
]


# List of settings that have been removed
REMOVED_SETTINGS = []


def perform_import(val, setting_name):
    """
    If the given setting is a string import notation,
    then perform the necessary import or imports.
    """
    if val is None:
        return None
    elif isinstance(val, str):
        return import_from_string(val, setting_name)
    elif isinstance(val, (list, tuple)):
        return [import_from_string(item, setting_name) for item in val]
    return val


def import_from_string(val, setting_name):
    """
    Attempt to import a class from a string representation.
    """
    try:
        return import_string(val)
    except ImportError as e:
        msg = "Could not import '%s' for Content Studio setting '%s'. %s: %s." % (
            val,
            setting_name,
            e.__class__.__name__,
            e,
        )
        raise ImportError(msg)


class ContentStudioSettings:
    """
    A settings object that allows Django Content Studio settings to be accessed as
    properties. For example:

        from content_studio.settings import api_settings
        print(api_settings.AUTH_STRATEGIES)

    Any setting with string import paths will be automatically resolved
    and return the class, rather than the string literal.
    """

    def __init__(self, user_settings=None, defaults=None, import_strings=None):
        if user_settings:
            self._user_settings = self.__check_user_settings(user_settings)
        self.defaults = defaults or DEFAULTS
        self.import_strings = import_strings or IMPORT_STRINGS
        self._cached_attrs = set()

    @property
    def user_settings(self):
        if not hasattr(self, "_user_settings"):
            self._user_settings = getattr(settings, SETTINGS_NAMESPACE, {})
        return self._user_settings

    def __getattr__(self, attr):
        if attr not in self.defaults:
            raise AttributeError("Invalid Content Studio setting: '%s'" % attr)

        try:
            # Check if present in user settings
            val = self.user_settings[attr]
        except KeyError:
            # Fall back to defaults
            val = self.defaults[attr]

        # Coerce import strings into classes
        if attr in self.import_strings:
            val = perform_import(val, attr)

        # Cache the result
        self._cached_attrs.add(attr)
        setattr(self, attr, val)
        return val

    def __check_user_settings(self, user_settings):
        SETTINGS_DOC = "https://djangocontentstudio.org/docs/settings"
        for setting in REMOVED_SETTINGS:
            if setting in user_settings:
                raise RuntimeError(
                    "The '%s' setting has been removed. Please refer to '%s' for available settings."
                    % (setting, SETTINGS_DOC)
                )
        return user_settings

    def reload(self):
        for attr in self._cached_attrs:
            delattr(self, attr)
        self._cached_attrs.clear()
        if hasattr(self, "_user_settings"):
            delattr(self, "_user_settings")


cs_settings = ContentStudioSettings(None, DEFAULTS, IMPORT_STRINGS)


def reload_settings(*args, **kwargs):
    setting = kwargs["setting"]
    if setting == SETTINGS_NAMESPACE:
        cs_settings.reload()


setting_changed.connect(reload_settings)

allowed_cors_headers = ("x-dcs-tenant",)
