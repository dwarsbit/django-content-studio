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
    "TENANT_MODEL": None,
    "PASSWORD_RESET_EXPIRATION_TIME": 10,
    # Rate limit for login attempts, per IP; None disables throttling.
    "LOGIN_THROTTLE_RATE": "10/min",
    # Token backend used to authenticate the admin API.
    "TOKEN_BACKEND": "content_studio.token_backends.JsonWebTokenBackend",
    # Access token lifetime in seconds; the token lives in browser memory.
    "TOKEN_LIFETIME": 60 * 60,
    # Refresh token lifetime in seconds; the token lives in an httpOnly cookie.
    "REFRESH_TOKEN_LIFETIME": 7 * 24 * 60 * 60,
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
        SETTINGS_DOC = "https://dwarsbit.github.io/django-content-studio/docs/settings"
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
