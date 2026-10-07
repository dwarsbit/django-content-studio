__title__ = "Django Content Studio"
__version__ = "1.0.0-beta.28"
__author__ = "Leon van der Grient"
__license__ = "MIT"

# Version synonym
VERSION = __version__

# The documented entry points (`from content_studio import register`) are
# resolved lazily: importing the admin module eagerly would require the
# app registry to be ready.
__all__ = ["register", "display"]


def __getattr__(name):
    if name in ("register", "display"):
        from . import admin

        return getattr(admin, name)

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
