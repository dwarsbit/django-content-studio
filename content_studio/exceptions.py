from rest_framework.exceptions import APIException


class NotConfigured(APIException):
    """
    Raised when an optional feature (media library, multi-tenancy) is
    used without being configured. Not a client error: the server is
    missing configuration, so the status is 501 Not Implemented.
    """

    status_code = 501
    default_detail = "This feature is not configured."
    default_code = "not_configured"
