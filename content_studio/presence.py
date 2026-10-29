"""
Presence: which users have an object's edit page open, and whether they
are viewing it or editing it (the form has unsaved changes).

The admin sends a heartbeat while an edit page is open; the entries live
in Django's cache under one key per object, scoped to the tenant for
tenant-scoped models, and expire unless refreshed. Each open edit page
(a browser tab) is a session of its own, so a user with the object open
in two tabs stays present until both are closed.

The entries of an object are read, changed and written back without a
lock: two heartbeats for the same object at the same moment can lose one
of them, which the next heartbeat restores. Presence is informational;
nothing is locked or checked on save.
"""

import hashlib
import time
from typing import Any, Optional

from django.contrib.auth import get_user_model
from django.core.cache import caches
from django.http import HttpRequest

from .settings import cs_settings
from .utils import get_tenant_field_name

VIEWING = "viewing"
EDITING = "editing"
STATES = (VIEWING, EDITING)

# Seconds an entry lives without a heartbeat. The admin sends one every
# 15 seconds while the page is visible, so an entry survives a missed
# heartbeat or two before it expires.
PRESENCE_TIMEOUT = 45

# The longest session id a heartbeat may carry.
MAX_SESSION_LENGTH = 64

# The most objects one list request asks about.
MAX_OBJECTS = 500

# The most sessions kept per user and per object: a user's oldest
# sessions make way for new ones, and the object's oldest entries make
# way once it has MAX_ENTRIES, so no editor can grow an object's cache
# value without bound by sending heartbeats for made-up sessions.
MAX_SESSIONS_PER_USER = 5
MAX_ENTRIES = 100


def is_presence_enabled(studio) -> bool:
    """
    Whether a studio's edit and list pages show presence: the PRESENCE
    setting is on and the studio does not opt out. Inlines are edited on
    their parent's edit page and have no presence of their own.
    """
    from .admin import ModelStudio

    return (
        bool(cs_settings.PRESENCE)
        and isinstance(studio, ModelStudio)
        and bool(getattr(studio, "presence", True))
    )


def get_presence_cache():
    return caches[cs_settings.PRESENCE_CACHE]


def get_tenant_key(request: HttpRequest, model) -> str:
    """
    The tenant part of the key: the request's tenant for tenant-scoped
    models (validated by the queryset the object was found in), nothing
    for models every tenant shares.
    """
    if cs_settings.TENANT_MODEL and get_tenant_field_name(model):
        return request.headers.get("x-dcs-tenant", "") or ""

    return ""


def get_cache_key(tenant: str, model, pk: Any) -> str:
    # Hashed: primary keys and tenant ids may hold characters some cache
    # backends do not accept in keys.
    digest = hashlib.sha256(
        f"{tenant}\x00{model._meta.label_lower}\x00{pk}".encode()
    ).hexdigest()

    return f"content_studio:presence:{digest}"


def describe_user(user, request: HttpRequest) -> dict[str, Any]:
    """
    How a user appears in presence: the full name (falling back to the
    username) and the picture or initials of the user model's relation
    display, so a user studio's get_relation_display customizes both.
    """
    from .admin import get_relation_display_for

    display = get_relation_display_for(get_user_model(), user, request)
    full_name = ""

    if callable(getattr(user, "get_full_name", None)):
        full_name = (user.get_full_name() or "").strip()

    return {
        "id": user.pk,
        "name": full_name or user.get_username(),
        "initials": display.initials or "",
        "avatar": display.avatar or None,
    }


def _live_entries(entries: Optional[dict], now: float) -> dict:
    if not isinstance(entries, dict):
        return {}

    return {
        session: entry
        for session, entry in entries.items()
        if isinstance(entry, dict) and entry.get("expires", 0) > now
    }


def _newest(entries: dict, limit: int) -> dict:
    """
    The limit entries that expire last (the most recent heartbeats).
    """
    if len(entries) <= limit:
        return entries

    newest = sorted(entries.items(), key=lambda item: item[1].get("expires", 0))

    return dict(newest[-limit:])


def _cap(entries: dict, user) -> dict:
    """
    Keep at most MAX_SESSIONS_PER_USER sessions of user and MAX_ENTRIES
    entries in all, dropping the oldest.
    """
    prefix = f"{user.pk}:"
    own = {k: v for k, v in entries.items() if k.startswith(prefix)}
    others = {k: v for k, v in entries.items() if not k.startswith(prefix)}

    return _newest({**others, **_newest(own, MAX_SESSIONS_PER_USER)}, MAX_ENTRIES)


def collapse(entries: dict, exclude_user=None) -> list[dict[str, Any]]:
    """
    One entry per user, editing when any of their sessions edits, left
    out for exclude_user (the request's own user). Editing users come
    first, then by name.
    """
    users: dict[str, dict[str, Any]] = {}

    for entry in entries.values():
        user = entry.get("user") or {}

        if exclude_user is not None and str(user.get("id")) == str(exclude_user.pk):
            continue

        key = str(user.get("id"))
        current = users.get(key)

        if current is None or entry.get("state") == EDITING:
            users[key] = {**user, "state": entry.get("state", VIEWING)}

    return sorted(
        users.values(),
        key=lambda user: (user["state"] != EDITING, str(user.get("name", "")).lower()),
    )


def heartbeat(
    request: HttpRequest, obj, session: str, state: str
) -> list[dict[str, Any]]:
    """
    Record that the request's user has obj open in session, with state;
    returns the other users who have it open.
    """
    cache = get_presence_cache()
    key = get_cache_key(get_tenant_key(request, obj.__class__), obj.__class__, obj.pk)
    now = time.time()
    entries = _live_entries(cache.get(key), now)

    entries[f"{request.user.pk}:{session}"] = {
        "user": describe_user(request.user, request),
        "state": state,
        "expires": now + PRESENCE_TIMEOUT,
    }
    entries = _cap(entries, request.user)
    cache.set(key, entries, PRESENCE_TIMEOUT)

    return collapse(entries, exclude_user=request.user)


def leave(request: HttpRequest, obj, session: str) -> None:
    """
    Remove the request's user's session from obj's entries.
    """
    cache = get_presence_cache()
    key = get_cache_key(get_tenant_key(request, obj.__class__), obj.__class__, obj.pk)
    entries = _live_entries(cache.get(key), time.time())

    if entries.pop(f"{request.user.pk}:{session}", None) is None:
        return

    if entries:
        cache.set(key, entries, PRESENCE_TIMEOUT)
    else:
        cache.delete(key)


def get_presence(request: HttpRequest, model, pks: list) -> dict[Any, list]:
    """
    The other users who have each of the objects open, in one cache
    round trip; objects nobody else has open are left out. The caller
    checks that the request may see the objects.
    """
    tenant = get_tenant_key(request, model)
    keys = {get_cache_key(tenant, model, pk): pk for pk in pks}
    now = time.time()
    found = get_presence_cache().get_many(list(keys))
    presence = {}

    for key, entries in found.items():
        users = collapse(_live_entries(entries, now), exclude_user=request.user)

        if users:
            presence[keys[key]] = users

    return presence
