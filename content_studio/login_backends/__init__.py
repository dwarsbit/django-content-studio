from .username_password import UsernamePasswordBackend
from ..router import content_studio_router
from ..settings import cs_settings


class LoginBackendManager:
    """
    Manages different login backends for use by
    Content Studio.
    """

    def __init__(self, **kwargs):
        self.active_backends = cs_settings.LOGIN_BACKENDS

    def set_up_router(self, router=None):
        if router is None:
            router = content_studio_router

        for backend in self.active_backends:
            router.register(
                f"api/login/{backend.__name__.lower().replace('backend', '')}",
                backend.view_set,
                # Unique per backend: a shared basename would make the
                # reverse name collide and the registration shadow itself.
                basename=f"content_studio_login_backend_{backend.__name__.lower()}",
            )
