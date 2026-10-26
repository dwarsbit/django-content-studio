"""
Webhook delivery: the content_changed receiver and the HTTP requests.

The receiver stores one WebhookDelivery per matching webhook and
enqueues it as a Django task. Which backend runs it is the project's
choice through Django's TASKS setting: without one, Django's
ImmediateBackend sends it right away, after the commit. Django 5.2 has
no django.tasks; there the django-tasks backport is used when
installed, and otherwise the delivery is sent in place. Failed attempts
are retried by the content_studio_deliver_webhooks command.

Requests are signed, never follow redirects, and only connect to public
addresses (checked on the address the connection uses, so a DNS answer
cannot change between the check and the connection), unless the host is
in WEBHOOK_ALLOWED_HOSTS.
"""

import hashlib
import hmac
import http.client
import ipaddress
import json
import logging
import socket
import time
from datetime import timedelta
from urllib.parse import urlsplit

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.utils import timezone

from .. import VERSION
from ..settings import cs_settings
from .models import Webhook, WebhookDelivery

try:
    from django.tasks import task
except ImportError:  # Django < 6.0
    try:
        from django_tasks import task
    except ImportError:
        task = None

logger = logging.getLogger("content_studio.webhooks")

PAYLOAD_VERSION = 1
EVENT = "content.changed"

# The part of a response body kept on the delivery.
RESPONSE_BODY_LIMIT = 1000

# The wait before retry n is BACKOFF_BASE * 4 ** (n - 1): 1, 4, 16 and
# 64 minutes, at most MAX_BACKOFF.
BACKOFF_BASE = timedelta(minutes=1)
MAX_BACKOFF = timedelta(hours=6)


class WebhookError(Exception):
    pass


def _iso(value):
    return value.isoformat() if value else None


def build_payload(delivery_id, webhook, changes) -> dict:
    return {
        "version": PAYLOAD_VERSION,
        "event": EVENT,
        "delivery": str(delivery_id),
        "webhook": webhook.name,
        "timestamp": _iso(timezone.now()),
        "changes": [
            {
                "action": change.action,
                "model": change.model._meta.label_lower,
                "id": change.object_id,
                "label": change.object_repr,
                "tenant": (None if change.tenant_id is None else str(change.tenant_id)),
                "timestamp": _iso(change.timestamp),
            }
            for change in changes
        ],
    }


def create_deliveries(sender, changes, **kwargs):
    """
    The content_changed receiver: one delivery per active webhook that
    matches any of the changes, carrying the changes it matches.
    """
    webhooks = Webhook.objects.filter(is_active=True).prefetch_related("content_types")
    deliveries = []

    for webhook in webhooks:
        content_type_ids = {
            content_type.pk for content_type in webhook.content_types.all()
        }
        matching = [
            change for change in changes if webhook.matches(change, content_type_ids)
        ]

        if not matching:
            continue

        delivery = WebhookDelivery(webhook=webhook, next_attempt_at=timezone.now())
        delivery.payload = build_payload(delivery.pk, webhook, matching)
        deliveries.append(delivery)

    if not deliveries:
        return

    WebhookDelivery.objects.bulk_create(deliveries)

    for delivery in deliveries:
        transaction.on_commit(lambda pk=str(delivery.pk): deliver_webhook.enqueue(pk))


def sign(secret: str, timestamp: int, body: bytes) -> str:
    """The signature header: t=<unix time>,v1=<HMAC-SHA256 hex of
    "<unix time>.<body>"> with the webhook's secret."""
    message = str(timestamp).encode() + b"." + body
    digest = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def _is_allowed_host(host: str) -> bool:
    return host.lower() in {
        allowed.lower() for allowed in cs_settings.WEBHOOK_ALLOWED_HOSTS
    }


def check_url(url: str):
    """Refuse URLs that are not HTTP(S), and plain HTTP unless DEBUG is
    on or the host is allowed."""
    parts = urlsplit(url)

    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise WebhookError("The URL must be an http or https URL.")

    if (
        parts.scheme == "http"
        and not settings.DEBUG
        and not _is_allowed_host(parts.hostname)
    ):
        raise WebhookError("The URL must use https.")


def _create_connection(host, allowed):
    def create_connection(address, timeout=None, source_address=None):
        """socket.create_connection, refusing non-public addresses
        unless the host is allowed."""
        _, port = address
        error = None

        for family, type_, proto, _, sockaddr in socket.getaddrinfo(
            host, port, type=socket.SOCK_STREAM
        ):
            ip = ipaddress.ip_address(sockaddr[0])

            if ip.version == 6 and ip.ipv4_mapped:
                ip = ip.ipv4_mapped

            if not allowed and (not ip.is_global or ip.is_multicast):
                error = WebhookError(f"{host} resolves to a non-public address.")
                continue

            sock = socket.socket(family, type_, proto)
            try:
                sock.settimeout(timeout)
                if source_address:
                    sock.bind(source_address)
                sock.connect(sockaddr)
                return sock
            except OSError as exc:
                sock.close()
                error = exc

        raise error or WebhookError(f"{host} does not resolve.")

    return create_connection


def send(url: str, body: bytes, headers: dict) -> tuple[int, str]:
    """POST the body; returns the response status and the start of its
    body. Redirects are not followed."""
    check_url(url)
    parts = urlsplit(url)
    timeout = cs_settings.WEBHOOK_TIMEOUT
    connection_class = (
        http.client.HTTPSConnection
        if parts.scheme == "https"
        else http.client.HTTPConnection
    )
    connection = connection_class(parts.hostname, parts.port, timeout=timeout)
    connection._create_connection = _create_connection(
        parts.hostname, _is_allowed_host(parts.hostname)
    )
    path = parts.path or "/"

    if parts.query:
        path = f"{path}?{parts.query}"

    try:
        connection.request("POST", path, body=body, headers=headers)
        response = connection.getresponse()
        content = response.read(RESPONSE_BODY_LIMIT)
        return response.status, content.decode("utf-8", "replace")
    finally:
        connection.close()


def backoff(attempts: int) -> timedelta:
    return min(BACKOFF_BASE * 4 ** (attempts - 1), MAX_BACKOFF)


def deliver(delivery_id) -> bool:
    """
    Make one attempt at a pending delivery. The attempt is claimed with
    an atomic update first, so two workers never send the same attempt,
    and a worker that dies mid-request leaves the delivery due for a
    retry. Returns whether this call made the attempt.
    """
    delivery = (
        WebhookDelivery.objects.select_related("webhook")
        .filter(pk=delivery_id, status=WebhookDelivery.Status.PENDING)
        .first()
    )

    if delivery is None:
        return False

    attempts = delivery.attempts + 1
    now = timezone.now()
    claimed = WebhookDelivery.objects.filter(
        pk=delivery.pk,
        status=WebhookDelivery.Status.PENDING,
        attempts=delivery.attempts,
    ).update(attempts=attempts, next_attempt_at=now + backoff(attempts))

    if not claimed:
        return False

    webhook = delivery.webhook
    body = json.dumps(delivery.payload, separators=(",", ":")).encode()
    headers = {
        "Content-Type": "application/json",
        "User-Agent": f"Content-Studio-Webhooks/{VERSION}",
        "X-Content-Studio-Event": EVENT,
        "X-Content-Studio-Delivery": str(delivery.pk),
        "X-Content-Studio-Signature": sign(webhook.secret, int(time.time()), body),
    }
    fields = {"response_status": None, "response_body": "", "error": ""}

    if not webhook.is_active:
        fields["error"] = "The webhook is not active."
        success = False
    else:
        try:
            status, content = send(webhook.url, body, headers)
        except (WebhookError, OSError, http.client.HTTPException) as exc:
            fields["error"] = str(exc) or exc.__class__.__name__
            success = False
        else:
            fields["response_status"] = status
            fields["response_body"] = content
            success = 200 <= status < 300

            if not success:
                fields["error"] = f"The webhook responded with {status}."

    if success:
        fields["status"] = WebhookDelivery.Status.SUCCESS
        fields["delivered_at"] = timezone.now()
        fields["next_attempt_at"] = None
    elif attempts >= cs_settings.WEBHOOK_MAX_ATTEMPTS or not webhook.is_active:
        fields["status"] = WebhookDelivery.Status.FAILED
        fields["next_attempt_at"] = None
        logger.warning(
            "Webhook delivery %s to %s failed: %s",
            delivery.pk,
            webhook,
            fields["error"],
        )

    WebhookDelivery.objects.filter(pk=delivery.pk).update(**fields)

    return True


def deliver_due(limit=None) -> int:
    """Attempt the pending deliveries that are due, oldest first;
    returns the number of attempts made."""
    due = (
        WebhookDelivery.objects.filter(
            status=WebhookDelivery.Status.PENDING,
            next_attempt_at__lte=timezone.now(),
        )
        .order_by("next_attempt_at")
        .values_list("pk", flat=True)
    )

    if limit:
        due = due[:limit]

    return sum(deliver(pk) for pk in list(due))


class _SynchronousTask:
    """The enqueue interface of a task, running the function in place."""

    def __init__(self, func):
        self.func = func

    def enqueue(self, *args, **kwargs):
        return self.func(*args, **kwargs)

    def call(self, *args, **kwargs):
        return self.func(*args, **kwargs)


def deliver_webhook(delivery_id):
    deliver(delivery_id)


# Workers import tasks by module and function name, so the task keeps
# the name of the function it wraps.
deliver_webhook = (
    task(deliver_webhook) if task is not None else _SynchronousTask(deliver_webhook)
)
