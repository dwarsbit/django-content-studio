"""
The events notifications are about: the built-in content changes and
the events a project registers with register_event().
"""

import re
from dataclasses import dataclass
from typing import Any

# The content changes, keyed by Change.action. A user is notified about
# them on the models they may view.
CONTENT_EVENTS = {
    "created": "content.created",
    "updated": "content.updated",
    "deleted": "content.deleted",
    "restored": "content.restored",
    "reordered": "content.reordered",
}

# What a user gets without a stored choice: these changes, to objects
# they created.
DEFAULT_CONTENT_ACTIONS = ("updated", "deleted", "restored")

# A reorder touches many objects: it only notifies followers.
FOLLOW_ONLY_ACTIONS = ("reordered",)

LEVELS = ("info", "success", "warning", "error")

# Lowercase dotted words, like "blog.article_submitted".
KEY_PATTERN = re.compile(r"^[a-z0-9_]+(\.[a-z0-9_]+)+$")
RESERVED_PREFIX = "content."


@dataclass(frozen=True)
class Event:
    key: str
    label: Any
    description: Any = ""
    level: str = "info"
    # Subscribed unless the user opts out.
    default: bool = True
    # Delivered to everyone who may receive it; no opt-out.
    required: bool = False


# Registered events by key.
_registry: dict[str, Event] = {}
# Problems found while registering, reported by system check E031.
_errors: list[str] = []


def register_event(
    key: str,
    label,
    description="",
    level: str = "info",
    default: bool = True,
    required: bool = False,
) -> Event:
    """
    Register an event that notify() can send and users can subscribe to
    on their notification settings. key is lowercase dotted words, like
    "blog.article_submitted"; label (and description) are shown on the
    settings page. default subscribes every user unless they opt out;
    required delivers it to everyone without an opt-out.

    Registering the same key again with the same definition does
    nothing. A malformed key or a key registered twice with different
    definitions is reported by system check content_studio.E031.
    """
    event = Event(
        key=key,
        label=label,
        description=description,
        level=level,
        default=default,
        required=required,
    )

    if not isinstance(key, str) or not KEY_PATTERN.match(key):
        _errors.append(
            f"Notification event key {key!r} must be lowercase dotted words, "
            f'like "blog.article_submitted".'
        )
        return event

    if key.startswith(RESERVED_PREFIX):
        _errors.append(
            f"Notification event key {key!r} uses the prefix "
            f'"{RESERVED_PREFIX}", which content changes use.'
        )
        return event

    if level not in LEVELS:
        _errors.append(
            f"Notification event {key!r} has level {level!r}; expected one of "
            f"{', '.join(LEVELS)}."
        )
        return event

    existing = _registry.get(key)

    if existing is not None:
        if existing != event:
            _errors.append(
                f"Notification event {key!r} is registered twice with different "
                f"definitions."
            )
        return existing

    _registry[key] = event
    return event


def get_event(key: str) -> Event:
    try:
        return _registry[key]
    except KeyError:
        raise ValueError(
            f"Unknown notification event {key!r}: register it with "
            f"register_event() first."
        ) from None


def get_events() -> list[Event]:
    """The registered events, in registration order."""
    return list(_registry.values())


def registration_errors() -> list[str]:
    return list(_errors)
