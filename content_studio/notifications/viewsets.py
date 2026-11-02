"""
The admin's notification endpoints: the list, the unread count it polls,
mark as read, the notification settings and following an object. Every
endpoint is about the request user's own notifications, so signing in as
staff is the only gate; what a user may see is decided per notification
by visible_notifications, the same filter the count uses.

Internal: the admin is the only client.
"""

from __future__ import annotations

from datetime import datetime

from django.contrib.admin.models import ADDITION, LogEntry
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Max, Q, TextField
from django.db.models.functions import Cast
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from ..permissions import IsActiveStaff
from ..presence import describe_user
from ..settings import cs_settings
from ..utils import get_tenant_field_name, get_tenant_scoped_queryset
from .defaults import get_defaults
from .digest import digest_available, digest_enabled, get_email, set_digest_enabled
from .events import CONTENT_EVENTS, get_event, get_events
from .models import Follow, Notification, NotificationSubscription
from .permissions import load_objects, notifications_enabled
from .reading import request_tenant, unread_count, visible_notifications

# The actions on the settings grid: reorders only notify followers.
GRID_ACTIONS = ("created", "updated", "deleted", "restored")
# A singleton is never created, deleted or restored by an editor.
SINGLETON_ACTIONS = ("updated",)

PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MAX_IDS = 500
# A search matches every word; longer queries are cut.
MAX_SEARCH_WORDS = 5
MAX_SEARCH_LENGTH = 100


def get_studio_for_label(label: str):
    """The registered studio of a model label (app_label.model_name)."""
    for model, studio in cs_settings.ADMIN_SITE._registry.items():
        if model._meta.label_lower == label:
            return model, studio

    raise NotFound("Unknown model.")


def is_singleton(studio) -> bool:
    from ..admin import get_is_singleton

    return bool(get_is_singleton(studio))


def subscribable_models(request) -> list:
    """The registered models the request user may view and that notify:
    the rows of the settings grid."""
    return [
        (model, studio)
        for model, studio in cs_settings.ADMIN_SITE._registry.items()
        if notifications_enabled(model) and studio.has_view_permission(request)
    ]


def model_tenant(request, model) -> str:
    """The tenant a model's subscriptions are stored for: the request's
    for tenant-scoped models, none for the others (their changes carry
    no tenant)."""
    return request_tenant(request) if get_tenant_field_name(model) else ""


def parse_time(value) -> datetime:
    parsed = parse_datetime(value) if isinstance(value, str) else None

    if parsed is None:
        raise ValidationError("Expected an ISO 8601 date and time.")

    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)

    return parsed


def actor_fields() -> list[str]:
    """The user fields a search looks at: the username and, when the
    user model has them, the names and the email address."""
    User = get_user_model()
    names = {field.name for field in User._meta.get_fields()}
    fields = [User.USERNAME_FIELD]

    for name in ("first_name", "last_name", User.get_email_field_name()):
        if name in names and name not in fields:
            fields.append(name)

    return [f"actor__{name}" for name in fields]


def filter_notifications(queryset, params):
    """
    The list's filters: ?model= a model label, ?event= an event key, and
    ?q= words that each appear in the object's name, the text, the named
    objects or the actor.
    """
    label = params.get("model")

    if label:
        app_label, _, model_name = label.partition(".")

        try:
            content_type = ContentType.objects.get_by_natural_key(app_label, model_name)
        except ContentType.DoesNotExist:
            return queryset.none()

        queryset = queryset.filter(content_type=content_type)

    event = params.get("event")

    if event:
        queryset = queryset.filter(event=event)

    words = (params.get("q") or "")[:MAX_SEARCH_LENGTH].split()[:MAX_SEARCH_WORDS]

    if words:
        fields = ["object_repr", "title", "body", "params_text", *actor_fields()]
        queryset = queryset.annotate(
            params_text=Cast("params", output_field=TextField())
        )

        for word in words:
            match = Q()

            for field in fields:
                match |= Q(**{f"{field}__icontains": word})

            queryset = queryset.filter(match)

    return queryset


def serialize_notifications(request, notifications) -> list[dict]:
    # Which targets still exist, one query per model; trashed objects
    # count as existing, the edit page offers to restore them.
    existing = {}
    by_type = {}

    for notification in notifications:
        if notification.content_type_id and notification.object_id:
            by_type.setdefault(notification.content_type_id, set()).add(
                notification.object_id
            )

    for content_type_id, object_ids in by_type.items():
        model = ContentType.objects.get_for_id(content_type_id).model_class()
        existing[content_type_id] = (
            set(load_objects(model, object_ids)) if model else set()
        )

    actors = {}

    def actor(user):
        if user is None:
            return None

        if user.pk not in actors:
            actors[user.pk] = describe_user(user, request)

        return actors[user.pk]

    results = []

    for notification in notifications:
        content_type = (
            ContentType.objects.get_for_id(notification.content_type_id)
            if notification.content_type_id
            else None
        )
        results.append(
            {
                "id": notification.pk,
                "event": notification.event,
                "level": notification.level,
                "actor": actor(notification.actor),
                "model": (
                    f"{content_type.app_label}.{content_type.model}"
                    if content_type
                    else None
                ),
                "object_id": notification.object_id or None,
                "object_repr": notification.object_repr,
                "exists": notification.object_id
                in existing.get(notification.content_type_id, ()),
                "url": notification.url,
                "title": notification.get_title(),
                "body": notification.get_body(),
                "objects": (
                    notification.params.get("objects", [])
                    if notification.event.startswith("content.")
                    and isinstance(notification.params, dict)
                    else []
                ),
                "count": notification.count,
                "created_at": notification.created_at,
                "updated_at": notification.updated_at,
                "read": notification.read_at is not None,
            }
        )

    return results


class NotificationViewSet(ViewSet):
    permission_classes = [IsActiveStaff]
    parser_classes = [JSONParser]
    renderer_classes = [JSONRenderer]

    def __init__(self, *args, **kwargs):
        # Forward kwargs: action-level overrides (permission_classes,
        # authentication_classes) arrive through the viewset init.
        super().__init__(*args, **kwargs)
        self.authentication_classes = [
            cs_settings.ADMIN_SITE.token_backend.active_backend.authentication_class
        ]

    def list(self, request):
        """
        A page of the user's notifications, newest first: ?filter=unread
        (the default) or all, ?offset and ?limit; ?since leaves out the
        ones not changed after that time (the new ones of a poll); ?model,
        ?event and ?q narrow it down (see filter_notifications).
        """
        queryset = visible_notifications(request).select_related("actor")

        if request.query_params.get("filter", "unread") == "unread":
            queryset = queryset.filter(read_at=None)

        queryset = filter_notifications(queryset, request.query_params)

        since = request.query_params.get("since")

        if since:
            queryset = queryset.filter(updated_at__gt=parse_time(since))

        try:
            offset = max(int(request.query_params.get("offset", 0)), 0)
            limit = min(
                max(int(request.query_params.get("limit", PAGE_SIZE)), 1),
                MAX_PAGE_SIZE,
            )
        except ValueError:
            raise ValidationError("offset and limit must be numbers.")

        page = list(
            queryset.order_by("-updated_at", "-pk")[offset : offset + limit + 1]
        )
        more = len(page) > limit

        return Response(
            {
                "results": serialize_notifications(request, page[:limit]),
                "next": offset + limit if more else None,
            }
        )

    @action(methods=["get"], detail=False, url_path="status")
    def status(self, request):
        """
        What the admin polls: the unread count and when the newest
        notification last changed, so the list is only fetched when
        something moved.
        """
        visible = visible_notifications(request)
        latest = visible.aggregate(latest=Max("updated_at"))["latest"]

        return Response(
            {
                "unread": visible.filter(read_at=None).count(),
                "latest": latest,
            }
        )

    @action(methods=["get"], detail=False, url_path="filters")
    def filters(self, request):
        """
        What the page's filters offer: the models and the events of the
        user's visible notifications, with the label of each registered
        event (content changes are labelled by the admin).
        """
        visible = visible_notifications(request).order_by()
        content_type_ids = (
            visible.exclude(content_type=None)
            .values_list("content_type_id", flat=True)
            .distinct()
        )
        models = sorted(
            f"{content_type.app_label}.{content_type.model}"
            for content_type in (
                ContentType.objects.get_for_id(pk) for pk in set(content_type_ids)
            )
        )
        events = []

        for key in sorted(set(visible.values_list("event", flat=True).distinct())):
            label = None

            if not key.startswith("content."):
                try:
                    label = str(get_event(key).label)
                except ValueError:
                    label = key

            events.append({"key": key, "label": label})

        return Response({"models": models, "events": events})

    @action(methods=["post"], detail=False, url_path="read")
    def read(self, request):
        """
        Mark notifications as read: {"ids": [...]} those, or {"before":
        time} every unread one that did not change after that time (mark
        all as read, without the ones that arrived since).
        """
        queryset = visible_notifications(request).filter(read_at=None)
        ids = request.data.get("ids")
        before = request.data.get("before")

        if isinstance(ids, list) and ids:
            if len(ids) > MAX_IDS or not all(isinstance(pk, int) for pk in ids):
                raise ValidationError("ids must be a list of notification ids.")

            queryset = queryset.filter(pk__in=ids)
        elif before:
            queryset = queryset.filter(updated_at__lte=parse_time(before))
        else:
            raise ValidationError("Send ids or before.")

        # Through the primary keys: the visible queryset may exclude rows,
        # which an update cannot always express on every database.
        Notification.objects.filter(
            pk__in=list(queryset.values_list("pk", flat=True))
        ).update(read_at=timezone.now())

        return Response({"unread": unread_count(request)})

    @action(methods=["get"], detail=False, url_path="settings")
    def notification_settings(self, request):
        """
        The settings page: the content grid (one row per model the user
        may view, with its stored or default choices), the registered
        events and the followed objects.
        """
        models = subscribable_models(request)
        content_types = ContentType.objects.get_for_models(*[m for m, _ in models])
        content_type_ids = {ct.pk for ct in content_types.values()}
        rows = {}

        for row in NotificationSubscription.objects.filter(
            user=request.user, content_type_id__in=content_type_ids
        ):
            rows[(row.content_type_id, row.event, row.tenant)] = row

        grid = []
        defaults = get_defaults(request.user)

        for model, studio in models:
            content_type = content_types[model]
            tenant = model_tenant(request, model)
            actions = SINGLETON_ACTIONS if is_singleton(studio) else GRID_ACTIONS
            stored = {
                action: rows.get((content_type.pk, CONTENT_EVENTS[action], tenant))
                for action in actions
            }
            default = defaults.for_model(model._meta.concrete_model)
            scope = next(
                (row.scope for row in stored.values() if row is not None),
                default.scope,
            )
            grid.append(
                {
                    "model": model._meta.label_lower,
                    "scope": scope,
                    "events": {
                        action: (
                            row.enabled
                            if row is not None
                            else action in default.actions
                        )
                        for action, row in stored.items()
                    },
                    "default": all(row is None for row in stored.values()),
                }
            )

        tenant = request_tenant(request)
        event_rows = {
            row.event: row
            for row in NotificationSubscription.objects.filter(
                user=request.user, content_type=None, tenant=tenant
            )
        }
        events = []

        for event in get_events():
            row = event_rows.get(event.key)
            events.append(
                {
                    "key": event.key,
                    "label": str(event.label),
                    "description": str(event.description or ""),
                    "level": event.level,
                    "required": event.required,
                    "enabled": (
                        True
                        if event.required
                        else (
                            row.enabled
                            if row is not None
                            else defaults.for_event(event)
                        )
                    ),
                }
            )

        return Response(
            {
                "models": grid,
                "events": events,
                "follows": self._follows(request),
                "digest": (
                    {
                        "enabled": digest_enabled(request.user),
                        "email": get_email(request.user),
                    }
                    if digest_available()
                    else None
                ),
            }
        )

    def _follows(self, request) -> list[dict]:
        viewable = {
            ContentType.objects.get_for_model(model).pk: (model, studio)
            for model, studio in subscribable_models(request)
        }
        tenant = request_tenant(request)
        follows = Follow.objects.filter(
            user=request.user, content_type_id__in=viewable
        ).order_by("-created_at", "-pk")
        follows = [f for f in follows if f.tenant in ("", tenant)]
        objects = {}

        for content_type_id in {f.content_type_id for f in follows}:
            model = viewable[content_type_id][0]
            objects[content_type_id] = load_objects(
                model,
                {f.object_id for f in follows if f.content_type_id == content_type_id},
            )

        results = []

        for follow in follows:
            model, studio = viewable[follow.content_type_id]
            obj = objects[follow.content_type_id].get(follow.object_id)

            # Gone objects are left out (the prune command drops their
            # follows), and so are objects the user may no longer view.
            if obj is None or not studio.has_view_permission(request, obj):
                continue

            results.append(
                {
                    "model": model._meta.label_lower,
                    "id": follow.object_id,
                    "repr": str(obj)[:200],
                    "created_at": follow.created_at,
                }
            )

        return results

    @action(
        methods=["put"],
        detail=False,
        url_path=r"settings/models/(?P<label>[a-z0-9_]+\.[a-z0-9_]+)",
    )
    def model_settings(self, request, label):
        """
        Store a model's row of the grid: {"scope": "all" | "mine",
        "events": {"updated": true, ...}}. Every action of the row is
        stored, so the row stops following the default.
        """
        model, studio = get_studio_for_label(label)

        if not notifications_enabled(model) or not studio.has_view_permission(request):
            raise NotFound("Unknown model.")

        scope = request.data.get("scope")
        events = request.data.get("events")

        if scope not in NotificationSubscription.Scope.values:
            raise ValidationError("scope must be all or mine.")

        if not isinstance(events, dict) or not all(
            isinstance(value, bool) for value in events.values()
        ):
            raise ValidationError("events must map actions to true or false.")

        actions = SINGLETON_ACTIONS if is_singleton(studio) else GRID_ACTIONS
        unknown = set(events) - set(actions)

        if unknown:
            raise ValidationError(f"Unknown actions: {', '.join(sorted(unknown))}.")

        content_type = ContentType.objects.get_for_model(model)
        tenant = model_tenant(request, model)
        default = get_defaults(request.user).for_model(model._meta.concrete_model)

        with transaction.atomic():
            for action_name in actions:
                NotificationSubscription.objects.update_or_create(
                    user=request.user,
                    content_type=content_type,
                    event=CONTENT_EVENTS[action_name],
                    tenant=tenant,
                    defaults={
                        "scope": scope,
                        "enabled": events.get(
                            action_name, action_name in default.actions
                        ),
                    },
                )

        return Response(status=204)

    @action(
        methods=["put"],
        detail=False,
        url_path=r"settings/events/(?P<key>[a-z0-9_.]+)",
    )
    def event_settings(self, request, key):
        """Subscribe to a registered event or opt out: {"enabled": bool}."""
        try:
            event = get_event(key)
        except ValueError:
            raise NotFound("Unknown event.")

        enabled = request.data.get("enabled")

        if not isinstance(enabled, bool):
            raise ValidationError("enabled must be true or false.")

        if event.required:
            raise PermissionDenied("This event is required.")

        NotificationSubscription.objects.update_or_create(
            user=request.user,
            content_type=None,
            event=event.key,
            tenant=request_tenant(request),
            defaults={"enabled": enabled},
        )

        return Response(status=204)

    @action(methods=["put"], detail=False, url_path="settings/digest")
    def digest_settings(self, request):
        """Turn the email digest on or off: {"enabled": bool}."""
        if not digest_available():
            raise NotFound("The email digest is off.")

        enabled = request.data.get("enabled")

        if not isinstance(enabled, bool):
            raise ValidationError("enabled must be true or false.")

        set_digest_enabled(request.user, enabled)

        return Response(status=204)

    @action(methods=["get", "post", "delete"], detail=False, url_path="follow")
    def follow(self, request):
        """
        Following one object: GET ?model=&id= answers whether the user
        follows it and whether they created it (and so are notified by
        default), POST {"model", "id"} follows it, DELETE ?model=&id=
        stops following it.
        """
        source = request.data if request.method == "POST" else request.query_params
        model, studio = get_studio_for_label(str(source.get("model", "")))

        if not notifications_enabled(model):
            raise NotFound("Unknown model.")

        try:
            pk = model._meta.pk.to_python(source.get("id"))
        except (DjangoValidationError, ValueError, TypeError):
            raise NotFound()

        obj = (
            get_tenant_scoped_queryset(request, model, model._base_manager.all())
            .filter(pk=pk)
            .first()
        )

        if obj is None or not studio.has_view_permission(request, obj):
            raise NotFound()

        content_type = ContentType.objects.get_for_model(model)
        object_id = str(obj.pk)
        follows = Follow.objects.filter(
            user=request.user, content_type=content_type, object_id=object_id
        )

        if request.method == "POST":
            field_name = get_tenant_field_name(model)
            tenant_id = getattr(obj, f"{field_name}_id") if field_name else None
            Follow.objects.get_or_create(
                user=request.user,
                content_type=content_type,
                object_id=object_id,
                defaults={"tenant": "" if tenant_id is None else str(tenant_id)},
            )
        elif request.method == "DELETE":
            follows.delete()

        creator = LogEntry.objects.filter(
            action_flag=ADDITION,
            content_type=content_type,
            object_id=object_id,
            user=request.user,
        ).exists()

        return Response({"following": follows.exists(), "creator": creator})
