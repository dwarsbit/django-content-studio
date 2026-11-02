"""
In-app notifications, an optional app: add "content_studio.notifications"
to INSTALLED_APPS.
"""

from .events import register_event
from .sending import notify

__all__ = [
    "notify",
    "register_event",
]
