"""
The task that makes a media library image's sizes (see sizes.py), as a
Django task. Which backend runs it is the project's choice through
Django's TASKS setting: without one, Django's ImmediateBackend runs it
right away, after the save is committed.

Django 5.2 has no django.tasks; there the django-tasks backport is used
when installed, and otherwise the sizes are made in place.
"""

import logging

from content_studio.settings import cs_settings

try:
    from django.tasks import task
except ImportError:  # Django < 6.0
    try:
        from django_tasks import task
    except ImportError:
        task = None

logger = logging.getLogger(__name__)


class _SynchronousTask:
    """The enqueue interface of a task, running the function in place."""

    def __init__(self, func):
        self.func = func

    def enqueue(self, *args, **kwargs):
        return self.func(*args, **kwargs)

    def call(self, *args, **kwargs):
        return self.func(*args, **kwargs)


def _as_task(func):
    return task(func) if task is not None else _SynchronousTask(func)


def make_image_sizes_of(pk):
    """Make the sizes of the media item with this primary key."""
    from .sizes import make_image_sizes

    model = cs_settings.MEDIA_LIBRARY_MODEL

    if not model:
        return

    item = model._default_manager.filter(pk=pk).first()

    # Deleted since it was enqueued: nothing to make.
    if item is None:
        return

    try:
        make_image_sizes(item)
    except Exception:
        # The item's own file is served meanwhile; the next change or
        # the content_studio_image_sizes command tries again.
        logger.warning("Could not make the image sizes of %s.", pk, exc_info=True)


make_image_sizes_task = _as_task(make_image_sizes_of)
