from rest_framework.throttling import AnonRateThrottle

from ..router import content_studio_router
from ..settings import cs_settings
from .username_password import UsernamePasswordBackend


class LoginRateThrottle(AnonRateThrottle):
    """
    Rate limit for login attempts, per IP. The rate comes from the
    CONTENT_STUDIO["LOGIN_THROTTLE_RATE"] setting.

    Note: the limit is enforced through the cache. With the default
    per-process cache and multiple workers each worker counts
    separately; configure a shared cache for the full limit.
    """

    scope = "content_studio_login"

    def get_rate(self):
        return cs_settings.LOGIN_THROTTLE_RATE


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

        # Brute-force protection: all login backends are rate limited
        # per IP unless the throttle is disabled via the setting.
        throttle_classes = []
        if cs_settings.LOGIN_THROTTLE_RATE:
            throttle_classes = [LoginRateThrottle]

        for backend in self.active_backends:
            backend.view_set.throttle_classes = throttle_classes
            router.register(
                f"api/login/{backend.__name__.lower().replace('backend', '')}",
                backend.view_set,
                # Unique per backend: a shared basename would make the
                # reverse name collide and the registration shadow itself.
                basename=f"content_studio_login_backend_{backend.__name__.lower()}",
            )
