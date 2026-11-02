"""
What a user is notified about without a choice of their own.

The built-in default is the same for everyone: updates, deletions and
restores of the objects they created, and each registered event's own
default. A site changes it per user with
ContentStudioSite.get_default_subscriptions(user), for group or studio
defaults. A stored choice always wins over a default, so changing the
hook changes what every user without a choice gets, without a data
migration.
"""

from dataclasses import dataclass, field

from django.db.models import Model

from ..settings import cs_settings
from .events import DEFAULT_CONTENT_ACTIONS, Event

# The content changes a default can name: a reorder only notifies
# followers.
DEFAULT_ACTIONS = ("created", "updated", "deleted", "restored")
SCOPES = ("all", "mine")


@dataclass(frozen=True)
class ContentDefault:
    """The changes to a model's objects a user gets by default: on
    every object ("all") or on the ones they created ("mine")."""

    scope: str = "mine"
    actions: frozenset = frozenset(DEFAULT_CONTENT_ACTIONS)

    def includes(self, action: str, creator: bool = False) -> bool:
        """Whether a change notifies the user: always about every
        object with scope "all"; with "mine" about the user's own, but
        never about their creating it."""
        if action not in self.actions:
            return False

        return self.scope == "all" or (creator and action != "created")


BUILT_IN = ContentDefault()


@dataclass(frozen=True)
class Defaults:
    # By model class.
    models: dict = field(default_factory=dict)
    # Registered event keys to on or off.
    events: dict = field(default_factory=dict)

    def for_model(self, model) -> ContentDefault:
        return self.models.get(model, BUILT_IN)

    def for_event(self, event: Event) -> bool:
        if event.required:
            return True

        return self.events.get(event.key, event.default)


NO_DEFAULTS = Defaults()


def site_overrides_defaults(site=None) -> bool:
    """Whether the site overrides get_default_subscriptions. Without an
    override, every user gets the built-in default and the hook is not
    called."""
    from ..admin import ContentStudioSite

    site = site or cs_settings.ADMIN_SITE
    method = getattr(site, "get_default_subscriptions", None)

    if method is None:
        return False

    return (
        getattr(method, "__func__", method)
        is not ContentStudioSite.get_default_subscriptions
    )


def parse(value) -> Defaults:
    """Check and convert what get_default_subscriptions returned."""
    if value is None:
        return NO_DEFAULTS

    if not isinstance(value, dict):
        raise TypeError(
            "get_default_subscriptions() must return a dict, not "
            f"{type(value).__name__}."
        )

    models = {}
    events = {}

    for key, entry in value.items():
        if isinstance(key, type) and issubclass(key, Model):
            models[key._meta.concrete_model] = parse_model_default(key, entry)
        elif isinstance(key, str):
            if not isinstance(entry, bool):
                raise TypeError(
                    f"get_default_subscriptions(): event {key!r} must map to True "
                    f"or False."
                )
            events[key] = entry
        else:
            raise TypeError(
                "get_default_subscriptions() keys must be model classes or "
                f"registered event keys, not {key!r}."
            )

    return Defaults(models=models, events=events)


def parse_model_default(model, entry) -> ContentDefault:
    label = model._meta.label

    if not isinstance(entry, dict):
        raise TypeError(
            f"get_default_subscriptions(): {label} must map to a dict with "
            f'"events" and optionally "scope".'
        )

    unknown_keys = set(entry) - {"events", "scope"}

    if unknown_keys:
        raise ValueError(
            f"get_default_subscriptions(): {label} has unknown keys "
            f"{', '.join(sorted(map(str, unknown_keys)))}."
        )

    scope = entry.get("scope", "mine")

    if scope not in SCOPES:
        raise ValueError(
            f'get_default_subscriptions(): {label} has scope {scope!r}; expected "all" '
            f'or "mine".'
        )

    actions = entry.get("events", ())

    if isinstance(actions, str) or not all(isinstance(a, str) for a in actions):
        raise TypeError(
            f"get_default_subscriptions(): {label} events must be a list of "
            f'changes, like ["updated", "deleted"].'
        )

    unknown = set(actions) - set(DEFAULT_ACTIONS)

    if unknown:
        raise ValueError(
            f"get_default_subscriptions(): {label} has unknown changes "
            f"{', '.join(sorted(unknown))}; expected {', '.join(DEFAULT_ACTIONS)}."
        )

    return ContentDefault(scope=scope, actions=frozenset(actions))


def get_defaults(user) -> Defaults:
    """The user's defaults: the site's, when it overrides
    get_default_subscriptions, else the built-in ones."""
    site = cs_settings.ADMIN_SITE

    if not site_overrides_defaults(site):
        return NO_DEFAULTS

    return parse(site.get_default_subscriptions(user))


class DefaultsCache:
    """Each user's defaults, asked from the site once per batch."""

    def __init__(self):
        self.overridden = site_overrides_defaults()
        self._cache = {}

    def get(self, user) -> Defaults:
        if not self.overridden or user is None:
            return NO_DEFAULTS

        if user.pk not in self._cache:
            self._cache[user.pk] = get_defaults(user)

        return self._cache[user.pk]
