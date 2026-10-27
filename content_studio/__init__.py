__title__ = "Django Content Studio"
__version__ = "1.1.0"
__author__ = "Leon van der Grient"
__license__ = "MIT"

# Version synonym
VERSION = __version__

# The documented entry point (`from content_studio import register`) is
# resolved lazily: importing the admin module eagerly would require the
# app registry to be ready.
__all__ = ["VERSION", "register"]


def __getattr__(name):
    if name == "register":
        from . import admin

        return getattr(admin, name)

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
