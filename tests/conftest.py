import pytest
from django.apps import apps


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
        # Setup code if needed
        pass


@pytest.fixture(autouse=True)
def clear_cache():
    """Throttle counts live in the cache; every test starts with none."""
    from django.core.cache import cache

    cache.clear()
    yield
