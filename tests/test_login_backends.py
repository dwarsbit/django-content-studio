"""
Tests for the login backend router registration: every backend gets a
unique basename so multiple backends cannot shadow each other.
"""

from rest_framework.viewsets import ViewSet

from content_studio.login_backends import LoginBackendManager
from content_studio.router import ExtendedRouter
from content_studio.login_backends.username_password import UsernamePasswordBackend


class MagicLinkBackend(UsernamePasswordBackend):
    name = "Magic link"


class StubBackend(UsernamePasswordBackend):
    name = "Stub"


class StubViewSet(ViewSet):
    pass


def test_each_backend_gets_a_unique_basename():
    router = ExtendedRouter(trailing_slash=False)

    manager = LoginBackendManager()
    manager.active_backends = [UsernamePasswordBackend, MagicLinkBackend]
    manager.set_up_router(router)

    basenames = {basename for _, _, basename in router.registry}

    assert basenames == {
        "content_studio_login_backend_usernamepasswordbackend",
        "content_studio_login_backend_magiclinkbackend",
    }


def test_multiple_backends_build_urls_without_collisions():
    router = ExtendedRouter(trailing_slash=False)

    manager = LoginBackendManager()
    manager.active_backends = [UsernamePasswordBackend, StubBackend]
    manager.set_up_router(router)

    # The URL list builds without reverse name collisions.
    patterns = router.urls
    login_routes = [
        str(pattern.pattern) for pattern in patterns if "login" in str(pattern.pattern)
    ]

    assert len(login_routes) >= 2
    assert len(set(login_routes)) == len(login_routes)
