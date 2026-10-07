import json
import sys
import uuid
from typing import Optional
from urllib.error import URLError
from urllib.request import urlopen

from rich.console import Console

from content_studio.settings import cs_settings

console = Console()

# Namespace for deterministically derived UUIDs: widgets, components and
# extensions derive their IDs from stable parts so every process (and
# every worker) agrees on them.
UUID_NAMESPACE = uuid.uuid5(
    uuid.NAMESPACE_URL, "https://github.com/dwarsbit/django-content-studio"
)


def derive_uuid(*parts) -> uuid.UUID:
    """
    Deterministically derive a UUID from stable string parts.

    Derived IDs are stable across processes and restarts, so multi-worker
    deployments agree on them and cached frontend data keeps working
    after a restart.
    """
    return uuid.uuid5(UUID_NAMESPACE, ":".join(str(part) for part in parts))


def log(*args, **kwargs):
    console.print(*args, **kwargs)


def flatten(xss):
    return [x for xs in xss for x in xs]


def is_runserver():
    """
    Checks if Django is running as an interactive server.

    Returns True for runserver-style servers and WSGI/ASGI entrypoints.
    Returns False for management commands, test runners (pytest) and
    other tooling.
    """
    # Test runners are never interactive servers.
    if "pytest" in sys.modules:
        return False

    # Check if we're using manage.py
    if sys.argv[0].endswith("manage.py"):
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


def validate_tenant_access(request, tenant_id):
    """
    Validate an x-dcs-tenant value against AdminSite.get_tenants: the
    single authorization hook for tenant access, also used to populate
    the frontend's tenant selector.

    Raises PermissionDenied when the user may not access the tenant.
    """
    from rest_framework.exceptions import PermissionDenied

    tenant_model = cs_settings.TENANT_MODEL

    if not tenant_model:
        return

    admin_site = cs_settings.ADMIN_SITE
    tenants = admin_site.get_tenants(tenant_model=tenant_model, request=request)

    if not tenants.filter(pk=tenant_id).exists():
        raise PermissionDenied("Unknown or unauthorized tenant.")


def get_tenant_scoped_queryset(request, model, queryset=None):
    """
    Return the queryset for a model, scoped to the request's tenant.

    - Models without a tenant field are unaffected: all rows.
    - Tenant-scoped models fail closed: without an x-dcs-tenant header
      no rows are returned, and the header's tenant must be in
      AdminSite.get_tenants.
    """
    tenant_model = cs_settings.TENANT_MODEL
    field_name = get_tenant_field_name(model)
    qs = queryset if queryset is not None else model.objects.all()

    if not tenant_model or not field_name:
        return qs

    tenant_id = request.headers.get("x-dcs-tenant", None)

    if not tenant_id:
        return qs.none()

    validate_tenant_access(request, tenant_id)

    return qs.filter(**{f"{field_name}_id": tenant_id})


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
