from django.core.exceptions import ImproperlyConfigured

from .jwt import SimpleJwtBackend
from ..router import content_studio_router


class TokenBackendManager:
    """
    Manages different token authentication backends for use by
    Content Studio.

    While login backends are used to identify a user,
    token backends are used to authenticate
    communication between Content Studio and the admin API.
    """

    available_backends = [SimpleJwtBackend]
    _active_backend = None

    @property
    def active_backend(self):
        if self._active_backend:
            return self._active_backend

        for backend in self.available_backends:
            if backend.is_available:
                self._active_backend = backend
                return backend

        raise ImproperlyConfigured(
            "You need to install at least one of the support authentication backends."
        )

    def set_up_router(self):
        content_studio_router.register(
            f"api/tokens/{self.active_backend.__name__.lower().replace('backend', '')}",
            self.active_backend.view_set,
            basename="content_studio_token_backend",
        )
