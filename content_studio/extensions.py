import uuid
from typing import Optional, Union

from .form import ButtonResult
from .utils import derive_uuid

__all__ = [
    "IFramePage",
    "MainMenuButton",
    "MainMenuLink",
]


class BaseExtension:
    extension_type: str
    extension_id: uuid.UUID

    def __init__(self, extension_id=None):
        """
        The extension ID is derived deterministically from the class and
        its ID parts, so all workers agree on it. Pass an explicit UUID
        to disambiguate extensions that share these.
        """
        if extension_id is not None:
            self.extension_id = uuid.UUID(str(extension_id))
        else:
            self.extension_id = derive_uuid(
                self.__class__.__module__,
                self.__class__.__qualname__,
                *self.get_id_parts(),
            )

    def get_id_parts(self):
        """
        Return the properties that define this extension's identity.

        The parts feed the derived extension ID, so every extension
        should override this to return the values that distinguish it.
        Note that the method is called from __init__: only use
        attributes that are set before calling super().__init__().
        Extensions sharing their parts get the same ID and are rejected
        at setup.
        """
        return ()

    def serialize(self):
        return {
            "extension_type": self.extension_type,
            "extension_id": str(self.extension_id),
        }


class MainMenuLink(BaseExtension):
    extension_type = "MainMenuLink"
    url: str
    label: str
    icon: str = None
    color: str = None
    # The position among the main menu's links and buttons: lower first.
    weight: int = 0

    def __init__(
        self,
        url: str,
        label: str,
        icon: str = None,
        color: str = None,
        weight: int = 0,
        extension_id: uuid.UUID = None,
    ):
        self.url = url
        self.label = label
        self.icon = icon
        self.color = color
        self.weight = weight
        super().__init__(extension_id)

    def get_id_parts(self):
        return (self.url, self.label)

    def serialize(self):
        return {
            **super().serialize(),
            "config": {
                "url": self.url,
                "icon": self.icon,
                "color": self.color,
                "label": self.label,
                "weight": self.weight,
            },
        }


class MainMenuButton(BaseExtension):
    """
    A button in the main menu that runs handle(request) on the server,
    like the edit page's Button component but for the whole admin:

        class ClearCacheButton(MainMenuButton):
            def handle(self, request):
                cache.clear()
                return _("The cache is cleared.")

        class BlogStudioSite(ContentStudioSite):
            extensions = [
                ClearCacheButton(
                    label=_("Clear cache"),
                    icon="ph-bold ph-broom",
                    confirm=_("Clear the cache?"),
                ),
            ]

    handle returns None, a message (shown as a notification) or a
    ButtonResult. is_visible(request) decides who sees the button; it
    is checked again when the button runs.
    """

    extension_type = "MainMenuButton"
    label: str
    icon: Optional[str] = None
    color: Optional[str] = None
    # A question to confirm before the button runs.
    confirm: Optional[str] = None
    # The position among the main menu's links and buttons: lower first.
    weight: int = 0

    def __init__(
        self,
        label: str = None,
        icon: str = None,
        color: str = None,
        confirm: str = None,
        weight: int = None,
        extension_id: uuid.UUID = None,
    ):
        # Arguments override the class attributes, so subclasses can
        # set defaults. Set before super().__init__(): get_id_parts()
        # reads the label.
        if label is not None:
            self.label = label
        if icon is not None:
            self.icon = icon
        if color is not None:
            self.color = color
        if confirm is not None:
            self.confirm = confirm
        if weight is not None:
            self.weight = weight

        if not getattr(self, "label", None):
            raise ValueError("A main menu button needs a label.")

        super().__init__(extension_id)

    def get_id_parts(self):
        return (str(self.label),)

    def is_visible(self, request) -> bool:
        return True

    def handle(self, request) -> Union[None, str, ButtonResult]:
        raise NotImplementedError("A main menu button needs a handle(request) method.")

    def run(self, request) -> ButtonResult:
        result = self.handle(request)

        if isinstance(result, ButtonResult):
            return result

        return ButtonResult(message=result)

    def serialize(self):
        return {
            **super().serialize(),
            "config": {
                "label": str(self.label),
                "icon": self.icon,
                "color": self.color,
                "confirm": None if self.confirm is None else str(self.confirm),
                "weight": self.weight,
            },
        }


class IFramePage(BaseExtension):
    extension_type = "IFramePage"
    path: str
    iframe_url: str

    def __init__(
        self,
        path: str,
        iframe_url: str,
        extension_id: uuid.UUID = None,
    ):
        self.path = path
        self.iframe_url = iframe_url
        super().__init__(extension_id)

    def get_id_parts(self):
        return (self.path, self.iframe_url)

    def serialize(self):
        return {
            **super().serialize(),
            "config": {
                "path": self.path,
                "iframe_url": self.iframe_url,
            },
        }
