"""
Models for the Content Studio demo project.

Everything here is plain Django — no third-party packages required. The
media library models follow the documented model contract (``name``,
``tags``, ``type``, ``file``, ``folder``), so the demo exercises the media
library with a custom model instead of a framework-provided one.

At the bottom of this module a model built on the built-in ``HTMLField``
and ``BlockField`` registers itself, so the rich text and block widgets
and formats are exercised too.
"""

from django.conf import settings
from django.db import models

from content_studio.blocks import Block, BlockField
from content_studio.fields import HTMLField
from content_studio.media_library.fields import MediaField


class Category(models.Model):
    name = models.CharField(max_length=50)
    # The manual order; see CategoryStudio.reorder_field.
    position = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "category"
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class MediaFolder(models.Model):
    name = models.CharField(max_length=100)
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="children",
    )

    class Meta:
        verbose_name = "media folder"
        verbose_name_plural = "media folders"

    def __str__(self):
        return self.name


class MediaItem(models.Model):
    name = models.CharField(max_length=200)
    # A list of strings, like the built-in TagField — the interface's
    # tags input and search expect a list-typed field.
    tags = models.JSONField(default=list, blank=True)
    type = models.CharField(max_length=10, default="file")
    file = models.FileField(upload_to="media/")
    alt_text = models.CharField(max_length=200, blank=True)
    size = models.PositiveIntegerField(default=0)
    crop = models.JSONField(default=list, blank=True)
    folder = models.ForeignKey(
        MediaFolder,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="items",
    )

    class Meta:
        verbose_name = "media item"
        verbose_name_plural = "media items"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.file and self.file.size:
            self.size = self.file.size
        super().save(*args, **kwargs)


class Article(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="articles",
    )
    categories = models.ManyToManyField(Category, blank=True)
    cover = models.ForeignKey(
        MediaItem,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    featured = models.BooleanField(default=False)
    views = models.PositiveIntegerField(default=0)
    # The soft-delete timestamp; see ArticleStudio.soft_delete.
    removed_at = models.DateTimeField(null=True, blank=True, editable=False)
    published_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "article"
        verbose_name_plural = "articles"
        ordering = ["-pk"]

    def __str__(self):
        return self.title


class Review(models.Model):
    article = models.ForeignKey(Article, on_delete=models.CASCADE)
    text = models.TextField()
    stars = models.PositiveIntegerField(default=5)
    # The manual order per article; see ReviewInline.reorder_field.
    position = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "review"
        verbose_name_plural = "reviews"

    def __str__(self):
        return self.text[:20]


class SiteSettings(models.Model):
    site_name = models.CharField(max_length=100, default="Demo site")
    tagline = models.CharField(max_length=200, blank=True)

    class Meta:
        verbose_name = "site settings"
        verbose_name_plural = "site settings"

    def __str__(self):
        return self.site_name


class TextBlock(Block):
    body = HTMLField()

    class Meta:
        description = "Rich text with headings and lists"
        icon = "ph-bold ph-text-t"


class ImageBlock(Block):
    image = MediaField("demo_blog.MediaItem", blank=False)
    caption = models.CharField(max_length=200, blank=True)

    class Meta:
        description = "An image from the media library"
        icon = "ph-bold ph-image"


class ColumnsBlock(Block):
    left = BlockField(blocks=[TextBlock, ImageBlock], blank=True, max_num=4)
    right = BlockField(blocks=[TextBlock, ImageBlock], blank=True, max_num=4)

    class Meta:
        description = "Two columns of blocks"
        icon = "ph-bold ph-columns"


class LandingPage(models.Model):
    title = models.CharField(max_length=200)
    body = HTMLField(blank=True)
    sections = BlockField(
        blocks=[TextBlock, ImageBlock, ColumnsBlock], blank=True, max_num=20
    )

    class Meta:
        verbose_name = "landing page"
        verbose_name_plural = "landing pages"

    def __str__(self):
        return self.title
