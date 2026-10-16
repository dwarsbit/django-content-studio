from typing import Literal

from django.db import models

type FileType = Literal["video", "image", "audio", "file"]


class BaseMediaField:
    """
    Base class for all media fields.
    """

    file_type: FileType | list[FileType] = None


class MediaField(models.ForeignKey, BaseMediaField):
    """
    Single media item model field.
    """

    def __init__(
        self,
        to="dbp_media_library.Media",
        file_type: FileType | list[FileType] = None,
        **kwargs,
    ):
        kwargs.setdefault("blank", True)
        kwargs.setdefault("related_name", "+")
        kwargs.setdefault("on_delete", models.SET_NULL)
        kwargs.setdefault("null", True)

        if file_type:
            self.file_type = file_type

        super().__init__(to, **kwargs)


class ManyMediaField(models.ManyToManyField, BaseMediaField):
    """
    Many media items model field.
    """

    def __init__(
        self,
        to="dbp_media_library.Media",
        file_type: FileType | list[FileType] = None,
        **kwargs,
    ):
        kwargs.setdefault("blank", True)
        kwargs.setdefault("related_name", "+")

        if file_type:
            self.file_type = file_type

        super().__init__(to, **kwargs)


class CropField(models.JSONField):
    description = "A field for storing crop information."

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("default", list)
        kwargs.setdefault("blank", True)

        super().__init__(*args, **kwargs)
