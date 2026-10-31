import uuid

from django.core.validators import MinLengthValidator
from django.db import models, transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils.translation import gettext_lazy as _

from ..fields import TagField
from ..models import ContentModel

__all__ = [
    "Folder",
    "Media",
]


def generate_uuid(instance, filename):
    return str(uuid.uuid4())


class Media(ContentModel):
    class Meta(ContentModel.Meta):
        db_table = "content_studio_media"
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

    size = models.PositiveBigIntegerField(
        null=True, verbose_name=_("File size"), editable=False
    )

    metadata = models.JSONField(
        default=dict,
        blank=True,
        editable=False,
        verbose_name=_("Metadata"),
        help_text=_("Read from the file, such as an image's width and height."),
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


@receiver(
    post_delete, sender=Media, dispatch_uid="content_studio_media_library_delete_file"
)
def delete_file(sender, instance, using, **kwargs):
    """
    Remove a deleted item's file from storage, once the deletion is
    committed: a rolled-back delete keeps its file. Bulk deletes and
    folders that cascade go through the collector, which sends this
    signal for every item.
    """
    file = instance.file

    if not file or not file.name:
        return

    storage, name = file.storage, file.name
    transaction.on_commit(lambda: storage.delete(name), using=using)


class Folder(ContentModel):
    class Meta(ContentModel.Meta):
        db_table = "content_studio_folder"
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
