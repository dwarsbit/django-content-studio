"""
The profile page: every editor's own account. The overview counts the
editor's changes from the activity log (Django's LogEntry) and lists the
content they changed last; the edit tab changes the site's profile
fields and the password.

The endpoints only ever serve the signed-in user, so editing a profile
needs no permission on the user model: the profile fields are the gate.
"""

from typing import Optional

from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import FieldDoesNotExist
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count
from django.db.models.functions import Trunc
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.parsers import JSONParser
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.viewsets import ViewSet

from .analytics.ranges import InvalidRange, get_query
from .form import Field
from .permissions import IsActiveStaff
from .settings import cs_settings
from .signals import collect_changes, record_change

# The profile fields when the site names none: those the user model has.
DEFAULT_PROFILE_FIELDS = ["first_name", "last_name", "email"]

# Fields that decide who a user is or what they may do: never editable on
# the profile, only shown read-only.
PROTECTED_FIELDS = {
    "id",
    "is_superuser",
    "is_staff",
    "is_active",
    "groups",
    "user_permissions",
    "last_login",
    "date_joined",
}

# The metrics of the overview and the action flags they count.
METRIC_FLAGS = {
    "created": ADDITION,
    "updated": CHANGE,
    "deleted": DELETION,
}

ACTION_NAMES = {flag: name for name, flag in METRIC_FLAGS.items()}

# The most items the recent content list returns, and the most log
# entries read to fill it.
MAX_RECENT = 50
MAX_SCANNED = 500


def protected_field_names(user_model=None) -> set[str]:
    """The user model fields a profile may only show read-only."""
    user_model = user_model or get_user_model()

    return PROTECTED_FIELDS | {user_model._meta.pk.name, user_model.USERNAME_FIELD}


def get_profile_fields(site=None) -> list[Field]:
    """
    The site's profile fields as Field objects: profile_fields, or the
    default name and email fields the user model has.
    """
    site = site or cs_settings.ADMIN_SITE
    configured = getattr(site, "profile_fields", None)

    if configured is None:
        user_model = get_user_model()
        configured = [
            # The names side by side, the email address under them.
            Field(name, col_span=2 if name == "email" else 1)
            for name in DEFAULT_PROFILE_FIELDS
            if has_model_field(user_model, name)
        ]

    fields = [
        field if isinstance(field, Field) else Field(field) for field in configured
    ]

    # The password hash is never serialized, whatever the configuration.
    return [field for field in fields if field.name != "password"]


def has_model_field(model, name: str) -> bool:
    try:
        model._meta.get_field(name)
    except FieldDoesNotExist:
        return False

    return True


def editable_field_names(fields: list[Field]) -> list[str]:
    protected = protected_field_names()

    return [
        field.name
        for field in fields
        if not field.readonly and field.name not in protected
    ]


def can_change_password(user, site=None) -> bool:
    """
    Whether the profile offers a password change: the user has a usable
    password and the site signs in with a username and password.
    """
    from .login_backends.username_password import UsernamePasswordBackend

    site = site or cs_settings.ADMIN_SITE

    return user.has_usable_password() and any(
        isinstance(backend, type) and issubclass(backend, UsernamePasswordBackend)
        for backend in site.login_backend.active_backends
    )


def get_profile_serializer(fields: list[Field]):
    from .serializers import ContentSerializer

    names = [field.name for field in fields]
    editable = set(editable_field_names(fields))

    class ProfileSerializer(ContentSerializer):
        class Meta:
            model = get_user_model()
            # An empty list would mean every field to DRF.
            fields = names or ["pk"]
            read_only_fields = [name for name in names if name not in editable]

    return ProfileSerializer


def user_data(user, request) -> dict:
    """Who the user is, for the profile card."""
    from .admin import get_relation_display_for

    user_model = get_user_model()
    display = get_relation_display_for(user_model, user, request)
    full_name = user.get_full_name() if hasattr(user, "get_full_name") else ""
    email_field = user_model.get_email_field_name()
    date_joined = getattr(user, "date_joined", None)
    last_login = getattr(user, "last_login", None)
    groups = getattr(user, "groups", None)

    return {
        "id": user.pk,
        "username": user.get_username(),
        "name": (full_name or "").strip(),
        "email": getattr(user, email_field, "") or "",
        "initials": display.initials or "",
        "avatar": display.avatar or None,
        "is_superuser": bool(getattr(user, "is_superuser", False)),
        "groups": (
            list(groups.order_by("name").values_list("name", flat=True))
            if groups is not None
            else []
        ),
        "date_joined": date_joined.isoformat() if date_joined else None,
        "last_login": last_login.isoformat() if last_login else None,
    }


class PasswordChangeRateThrottle(UserRateThrottle):
    """
    Rate limit for password changes, per user: a wrong current password
    is a guess, so they share the LOGIN_THROTTLE_RATE.
    """

    scope = "content_studio_password_change"

    def get_rate(self):
        return cs_settings.LOGIN_THROTTLE_RATE


class ProfileViewSet(ViewSet):
    """The signed-in user's profile."""

    # Explicit, so the project's DEFAULT_PERMISSION_CLASSES never decide.
    permission_classes = [IsActiveStaff]
    # One profile per user: the router maps PATCH on the list route to
    # partial_update, like a singleton's.
    is_singleton = True
    parser_classes = [JSONParser]
    renderer_classes = [JSONRenderer]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        admin_site = cs_settings.ADMIN_SITE
        self.authentication_classes = [
            admin_site.token_backend.active_backend.authentication_class
        ]

    def get_throttles(self):
        if self.action == "password" and cs_settings.LOGIN_THROTTLE_RATE:
            return [PasswordChangeRateThrottle()]

        return []

    def profile_data(self, request) -> dict:
        user = request.user
        fields = get_profile_fields()
        serializer = get_profile_serializer(fields)(user, context={"request": request})
        values = serializer.data if fields else {}
        editable = set(editable_field_names(fields))

        return {
            "user": user_data(user, request),
            "fields": [
                {
                    **field.serialize(),
                    "readonly": field.readonly or field.name not in editable,
                }
                for field in fields
            ],
            "values": {field.name: values.get(field.name) for field in fields},
            "password": can_change_password(user),
        }

    def list(self, request):
        return Response(self.profile_data(request))

    def partial_update(self, request, pk=None):
        fields = get_profile_fields()
        editable = editable_field_names(fields)
        data = {name: value for name, value in request.data.items() if name in editable}
        serializer = get_profile_serializer(fields)(
            request.user, data=data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        if data:
            with collect_changes(request):
                user = serializer.save()
                record_change(request, user, "updated", "Changed the profile.")

        return Response(self.profile_data(request))

    @action(methods=["post"], detail=False, url_path="password")
    def password(self, request):
        """
        Change the password: the current one, then the new one. Changing
        it ends every other session; this one continues with the tokens
        in the response.
        """
        user = request.user

        if not can_change_password(user):
            return Response(status=status.HTTP_404_NOT_FOUND)

        current = request.data.get("current_password") or ""
        new = request.data.get("new_password") or ""

        if not user.check_password(current):
            return Response(
                {"current_password": [_("Your current password is not correct.")]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not new:
            return Response(
                {"new_password": [_("Enter a new password.")]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(new, user)
        except DjangoValidationError as error:
            return Response(
                {"new_password": list(error.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with collect_changes(request):
            user.set_password(new)
            user.save(update_fields=["password"])
            record_change(request, user, "updated", "Changed password.")

        return (
            cs_settings.ADMIN_SITE.token_backend.active_backend.get_response_for_user(
                user, request
            )
        )

    @action(methods=["get"], detail=False, url_path="activity")
    def activity(self, request):
        """
        The user's changes in a period against the period before: the
        totals, a series per interval and the count per model.
        """
        try:
            query = get_query(
                request.query_params.get("range") or "30d",
                start=request.query_params.get("start"),
                end=request.query_params.get("end"),
            )
        except InvalidRange as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(activity_data(request, query))

    @action(methods=["get"], detail=False, url_path="recent")
    def recent(self, request):
        """The content the user changed last, one row per object."""
        try:
            limit = min(
                max(int(request.query_params.get("limit") or 10), 1), MAX_RECENT
            )
        except ValueError:
            limit = 10

        return Response({"items": recent_content(request, limit)})


def own_entries(request):
    """The user's log entries on the models they may view."""
    from .dashboard.activity_log import viewable_content_type_ids

    return LogEntry.objects.filter(
        user=request.user, content_type_id__in=viewable_content_type_ids(request)
    )


def _wall_time(value, tz):
    return timezone.localtime(value, tz).replace(tzinfo=None)


def bucket_counts(entries, query) -> dict:
    """The entries of the query's period, counted per bucket and flag."""
    rows = (
        entries.filter(action_time__gte=query.start, action_time__lt=query.end)
        .annotate(bucket=Trunc("action_time", query.interval, tzinfo=query.timezone))
        .values("bucket", "action_flag")
        .annotate(count=Count("pk"))
    )
    counts: dict = {}

    for row in rows:
        key = _wall_time(row["bucket"], query.timezone)
        counts.setdefault(key, {})
        counts[key][row["action_flag"]] = (
            counts[key].get(row["action_flag"], 0) + row["count"]
        )

    return counts


def activity_data(request, query) -> dict:
    from .analytics.report import range_data

    entries = own_entries(request)
    previous_query = query.previous
    current = bucket_counts(entries, query)
    previous = bucket_counts(entries, previous_query)
    now = timezone.now()

    def count(counts, key, metric):
        flags = counts.get(key, {})

        if metric == "total":
            return sum(flags.values())

        return flags.get(METRIC_FLAGS[metric], 0)

    metrics = ["total", *METRIC_FLAGS]
    buckets = query.buckets()
    previous_buckets = previous_query.buckets()
    series = {metric: [] for metric in metrics}

    for index, bucket in enumerate(buckets):
        # Intervals still to come are left out, not drawn as zero.
        if bucket > now:
            break

        key = _wall_time(bucket, query.timezone)
        previous_key = (
            _wall_time(previous_buckets[index], query.timezone)
            if index < len(previous_buckets)
            else None
        )

        for metric in metrics:
            series[metric].append(
                {
                    "date": bucket.isoformat(),
                    "value": count(current, key, metric),
                    "previous": (
                        count(previous, previous_key, metric)
                        if previous_key is not None
                        else None
                    ),
                }
            )

    def total(counts, metric):
        return sum(count(counts, key, metric) for key in counts)

    return {
        "range": range_data(query),
        "metrics": [
            {
                "key": metric,
                "value": total(current, metric),
                "previous": total(previous, metric),
            }
            for metric in metrics
        ],
        "series": series,
        "models": model_counts(entries, query),
    }


def model_counts(entries, query) -> list[dict]:
    """The period's changes per model, most first."""
    rows = (
        entries.filter(action_time__gte=query.start, action_time__lt=query.end)
        .values("content_type__app_label", "content_type__model")
        .annotate(count=Count("pk"))
        .order_by("-count", "content_type__app_label", "content_type__model")
    )
    result = []

    for row in rows:
        key = f"{row['content_type__app_label']}.{row['content_type__model']}"
        model = _model_for(key)
        result.append(
            {
                "key": key,
                "label": str(model._meta.verbose_name_plural) if model else key,
                "value": row["count"],
            }
        )

    return result


def _model_for(label: str):
    from django.apps import apps

    try:
        return apps.get_model(label)
    except (LookupError, ValueError):
        return None


def recent_content(request, limit: int) -> list[dict]:
    """
    The objects the user changed last, newest first: one row per object
    with its latest change. On tenant-scoped models only objects in the
    request's tenant are listed.
    """
    from .dashboard.activity_log import tenant_scoped_models, visible_entries

    entries = own_entries(request).select_related("content_type")
    content_type_ids = list(
        entries.values_list("content_type_id", flat=True).distinct()
    )
    scoped = tenant_scoped_models(content_type_ids)
    entries = entries.order_by("-action_time", "-pk")
    picked = []
    seen = set()
    batch_size = max(limit * 4, 20)

    for offset in range(0, MAX_SCANNED, batch_size):
        batch = list(entries[offset : offset + batch_size])
        unique = []

        for entry in batch:
            key = (entry.content_type_id, entry.object_id)

            if key in seen:
                continue

            seen.add(key)
            unique.append(entry)

        picked += visible_entries(request, unique, scoped) if scoped else unique

        if len(picked) >= limit or len(batch) < batch_size:
            break

    return describe_entries(request, picked[:limit])


def describe_entries(request, entries) -> list[dict]:
    """The rows of the recent content list, with the objects that remain."""
    site = cs_settings.ADMIN_SITE
    media_model = cs_settings.MEDIA_LIBRARY_MODEL
    objects: dict = {}

    by_model: dict = {}
    for entry in entries:
        model = entry.content_type.model_class()
        if model is not None and entry.action_flag != DELETION:
            by_model.setdefault(model, []).append(entry.object_id)

    for model, ids in by_model.items():
        studio = site._registry.get(model)
        queryset = (
            studio.get_queryset(request)
            if studio is not None
            else model._default_manager.all()
        )
        pks = []

        for object_id in ids:
            try:
                pks.append(model._meta.pk.to_python(object_id))
            except DjangoValidationError:
                continue

        for obj in queryset.filter(pk__in=pks):
            objects[(model, str(obj.pk))] = obj

    items = []

    for entry in entries:
        model = entry.content_type.model_class()
        obj = objects.get((model, entry.object_id))
        studio = site._registry.get(model) if model is not None else None
        title = entry.object_repr
        thumbnail = None

        if obj is not None and studio is not None:
            display = studio.get_list_item_display(obj, request)
            title = display.title or title
            thumbnail = display.thumbnail or None

            if not thumbnail:
                thumbnail = studio.get_relation_display(obj, request).avatar or None
        elif obj is not None and model is media_model:
            title = getattr(obj, "name", "") or str(obj)
            if getattr(obj, "type", None) == "image":
                thumbnail = site.get_thumbnail(obj)

        items.append(
            {
                "model": f"{entry.content_type.app_label}.{entry.content_type.model}",
                "model_label": (
                    str(model._meta.verbose_name) if model is not None else ""
                ),
                "id": entry.object_id,
                "title": title,
                "action": ACTION_NAMES.get(entry.action_flag, "updated"),
                "timestamp": entry.action_time.isoformat(),
                "thumbnail": thumbnail,
                # Links go to the edit page of objects that remain in a
                # registered studio.
                "link": obj is not None and studio is not None,
            }
        )

    return items


def set_up_router():
    from .router import content_studio_router

    content_studio_router.register(
        "api/profile", ProfileViewSet, basename="content_studio_profile"
    )
