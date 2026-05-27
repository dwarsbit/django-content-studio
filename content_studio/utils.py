import json
import sys
from typing import Optional
from urllib.error import URLError
from urllib.request import urlopen

from rich.console import Console

from content_studio.settings import cs_settings

console = Console()


def log(*args, **kwargs):
    console.print(*args, **kwargs)


def flatten(xss):
    return [x for xs in xss for x in xs]


def is_runserver():
    """
    Checks if the Django application is running as a server.

    Returns True if:
    - Django is started via WSGI/ASGI (not using manage.py)
    - Using manage.py with server commands like runserver, runserver_plus, etc.
    - Running in a context that suggests server mode (e.g., DJANGO_RUNSERVER env var)

    Returns False for management commands like migrate, makemigrations, etc.
    """
    try:
        # Check if we're using manage.py
        if sys.argv[0].endswith("/manage.py"):
            # If using manage.py, we need at least 2 arguments to have a command
            if len(sys.argv) > 1:
                # Common server commands
                server_commands = {"runserver", "runserver_plus", "runsslserver"}
                return sys.argv[1] in server_commands
            else:
                # manage.py without a command - not a server
                return False
        else:
            # If not using manage.py, assume it's a server (WSGI/ASGI)
            return True

    except IndexError:
        # If sys.argv is malformed, default to False to be safe
        return False


def is_jsonable(x):
    try:
        json.dumps(x)
        return True
    except (TypeError, OverflowError):
        return False


def get_related_field_name(inline, parent_model):
    """
    Get the name of the foreign key field in the inline model.
    """
    if inline.fk_name:
        return inline.fk_name

    # Let Django figure it out

    opts = inline.model._meta

    # Find all foreign keys pointing to parent model
    fks = [
        f
        for f in opts.get_fields()
        if f.many_to_one and f.remote_field.model == parent_model
    ]

    if len(fks) == 1:
        return fks[0].name
    elif len(fks) == 0:
        raise ValueError(
            f"No foreign key found in {inline.model} pointing to {parent_model}"
        )
    else:
        raise ValueError(f"Multiple foreign keys found. Specify fk_name on the inline.")


def get_tenant_field_name(model):
    tenant_model = cs_settings.TENANT_MODEL

    if not tenant_model:
        return None

    opts = model._meta

    # Find all foreign keys pointing to the tenant model
    fks = [
        f
        for f in opts.get_fields()
        if f.many_to_one and f.remote_field.model == tenant_model
    ]

    if len(fks) == 1:
        return fks[0].name
    elif len(fks) == 0:
        return None
    else:
        raise ValueError(
            f"Multiple fields found pointing to {tenant_model}. Only one field can point to a tenant model."
        )


def normalize_version(version: str) -> str:
    """Normalize version strings for comparison (e.g., '1.0.0b6' -> '1.0.0-beta.6')"""
    if not version:
        return version

    # Handle prerelease versions: b6 -> beta.6, a6 -> alpha.6, rc6 -> rc.6
    # Use regex to avoid overlapping replacements
    import re

    # Replace bX with -beta.X (but not if already in beta format)
    version = re.sub(r"\b(\d+\.\d+\.\d+)b(\d+)", r"\1-beta.\2", version)
    # Replace aX with -alpha.X
    version = re.sub(r"\b(\d+\.\d+\.\d+)a(\d+)", r"\1-alpha.\2", version)
    # Replace rcX with -rc.X
    version = re.sub(r"\b(\d+\.\d+\.\d+)rc(\d+)", r"\1-rc.\2", version)

    return version


def get_latest_version() -> Optional[str]:
    """Fetch the latest version of django-content-studio from PyPI"""
    try:
        # Fetch the PyPI JSON API for django-content-studio
        with urlopen(
            "https://pypi.org/pypi/django-content-studio/json", timeout=5
        ) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data.get("info", {}).get("version")
    except (URLError, json.JSONDecodeError, KeyError):
        # If there's any error (network, JSON parsing, etc.), return None
        return None
