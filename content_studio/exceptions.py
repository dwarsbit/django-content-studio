from collections import Counter

from django.db.models import ProtectedError, RestrictedError
from rest_framework.exceptions import APIException

__all__ = [
    "AlreadyRegistered",
    "NotRegistered",
]


class NotConfigured(APIException):
    """
    Raised when an optional feature (media library, multi-tenancy) is
    used without being configured. Not a client error: the server is
    missing configuration, so the status is 501 Not Implemented.
    """

    status_code = 501
    default_detail = "This feature is not configured."
    default_code = "not_configured"


class DeleteConflict(APIException):
    """
    Raised when a delete is blocked by objects that refer to the deleted
    ones with on_delete=PROTECT or RESTRICT. The status is 409 Conflict.
    """

    status_code = 409
    default_detail = "This object cannot be deleted: other objects refer to it."
    default_code = "delete_conflict"

    @classmethod
    def from_error(cls, error: ProtectedError | RestrictedError):
        """Describe the blocking objects by model, e.g. "2 comments"."""
        if isinstance(error, ProtectedError):
            blocking = error.protected_objects
        else:
            blocking = error.restricted_objects

        counts = Counter(obj._meta for obj in blocking)

        if not counts:
            return cls()

        described = ", ".join(
            f"{count} {opts.verbose_name if count == 1 else opts.verbose_name_plural}"
            for opts, count in counts.items()
        )

        return cls(
            f"This object cannot be deleted: other objects refer to it ({described})."
        )


class AlreadyRegistered(Exception):
    """
    Raised when registering a model that is already registered with
    the Content Studio site.
    """


class NotRegistered(Exception):
    """
    Raised when unregistering a model that is not registered with the
    Content Studio site.
    """
