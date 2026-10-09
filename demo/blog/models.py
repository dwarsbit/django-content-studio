"""
Models for the Content Studio demo project.

Everything here is plain Django — no Blueprint required. The media library
models follow the documented model contract (``name``, ``tags``, ``type``,
``file``, ``folder``), so the demo exercises the media library with a custom
model instead of a framework-provided one.

When django-blueprint is installed, one extra model registers itself at the
bottom of this module to cover the optional integration.
"""

from django.conf import settings
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=50)

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
    tags = models.CharField(max_length=500, blank=True)
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


# Blueprint is an optional integration: the demo works fully without it. When
# it is installed, a Blueprint-integrated model joins the demo so the rich
# text widget and formats are exercised too.
try:
    from blueprint import fields as bp_fields

    blueprint_available = True
except ImportError:
    bp_fields = None
    blueprint_available = False

if bp_fields is not None:

    class LandingPage(models.Model):
        title = models.CharField(max_length=200)
        body = bp_fields.HTMLField(blank=True)

        class Meta:
            verbose_name = "landing page"
            verbose_name_plural = "landing pages"

        def __str__(self):
            return self.title
