import uuid

from django.core.validators import MinLengthValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from .fields import CropField
from ..fields import TagField
from ..models import ContentModel


def generate_uuid(instance, filename):
    return str(uuid.uuid4())


class Media(ContentModel):
    class Meta(ContentModel.Meta):
        db_table = "dbp_media"
        verbose_name = _("Media")
        verbose_name_plural = _("Media")

    file = models.FileField(upload_to=generate_uuid, verbose_name=_("File"))

    name = models.CharField(
        blank=True, default="", max_length=255, verbose_name=_("Name")
    )

    alt_text = models.CharField(
        blank=True,
        default="",
        max_length=255,
        verbose_name=_("Alt text"),
        help_text=_("Describes a picture for screen readers"),
    )

    tags = TagField(verbose_name=_("Tags"))

    folder = models.ForeignKey(
        "Folder",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="media",
        verbose_name=_("Folder"),
    )

    crop = CropField(verbose_name=_("Crop"))

    size = models.PositiveBigIntegerField(
        null=True, verbose_name=_("File size"), editable=False
    )

    type = models.CharField(
        choices={
            "image": _("Image"),
            "video": _("Video"),
            "audio": _("Audio"),
            "file": _("File"),
        },
        default="file",
        verbose_name=_("File type"),
        max_length=20,
    )

    def __str__(self):
        if self.file:
            return self.file.url

        return self.name or str(self.pk)

    def save(self, *args, **kwargs):
        if self.file:
            if not self.name:
                file_name = self.file.name.split("/")[-1]
                # If file name has an extension
                if "." in file_name:
                    # Remove extension
                    self.name = ".".join(file_name.split(".")[:-1])
                else:
                    self.name = file_name

            self.size = self.file.size

        return super().save(*args, **kwargs)


class Folder(ContentModel):
    class Meta(ContentModel.Meta):
        db_table = "dbp_folder"
        verbose_name = _("Folder")
        verbose_name_plural = _("Folders")
        unique_together = ("name", "parent")

    name = models.CharField(
        max_length=100, verbose_name=_("Name"), validators=[MinLengthValidator(1)]
    )

    parent = models.ForeignKey(
        "self", null=True, blank=True, related_name="children", on_delete=models.CASCADE
    )

    def __str__(self):
        return self.name
