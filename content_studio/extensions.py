import uuid

from .utils import derive_uuid


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
