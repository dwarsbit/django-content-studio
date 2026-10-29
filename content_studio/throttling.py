from rest_framework.settings import api_settings


class ClientIPMixin:
    """
    Identify throttled clients by an address they cannot choose.

    DRF's default identity is the raw X-Forwarded-For header when
    REST_FRAMEWORK["NUM_PROXIES"] is unset, so a client sending a
    different header per request gets a fresh bucket each time. Without
    NUM_PROXIES the connection's REMOTE_ADDR is used instead; with it,
    DRF picks the address the configured proxies added.
    """

    def get_ident(self, request):
        if api_settings.NUM_PROXIES is None:
            return request.META.get("REMOTE_ADDR")

        return super().get_ident(request)
