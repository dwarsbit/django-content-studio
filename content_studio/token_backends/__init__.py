from django.core.exceptions import ImproperlyConfigured

from .jwt import JsonWebTokenBackend
from ..router import content_studio_router
from ..settings import cs_settings


class TokenBackendManager:
    """
    Manages the token authentication backend used by Content Studio.

    While login backends are used to identify a user, token backends are used
    to authenticate communication between Content Studio and the admin API.
    The backend is selected through the `TOKEN_BACKEND` setting and defaults
    to Content Studio's own JSON Web Token backend.
    """

    @property
    def active_backend(self):
        backend = cs_settings.TOKEN_BACKEND

        if backend is None:
            raise ImproperlyConfigured(
                "No token backend configured for Content Studio. Set "
                "CONTENT_STUDIO['TOKEN_BACKEND'] to a token backend class."
            )

        required_attrs = (
            "authentication_class",
            "view_set",
            "get_info",
            "get_response_for_user",
        )

        for attr in required_attrs:
            if not hasattr(backend, attr):
                raise ImproperlyConfigured(
                    f"The token backend '{backend}' is missing '{attr}'."
                )

        return backend

    def set_up_router(self):
        backend = self.active_backend
        content_studio_router.register(
            f"api/tokens/{backend.__name__.lower().replace('backend', '')}",
            backend.view_set,
            basename=(f"content_studio_token_backend_{backend.__name__.lower()}"),
        )


__all__ = ["TokenBackendManager", "JsonWebTokenBackend"]
