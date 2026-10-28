from django.db import models

from content_studio.blocks import Block, BlockField
from content_studio.fields import HTMLField, URLPathField
from content_studio.models import ManualOrderModel


class Category(models.Model):
    name = models.CharField(max_length=50)

    class Meta:
        verbose_name = "Category"
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name


class Article(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    title = models.CharField(max_length=100)
    body = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    author = models.ForeignKey(
        "auth.User", null=True, blank=True, on_delete=models.SET_NULL
    )
    categories = models.ManyToManyField(Category, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    views = models.PositiveIntegerField(default=0)
    rating = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    created_by = models.ForeignKey(
        "auth.User", null=True, on_delete=models.SET_NULL, related_name="+"
    )
    edited_by = models.ForeignKey(
        "auth.User", null=True, on_delete=models.SET_NULL, related_name="+"
    )
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["pk"]

    def __str__(self):
        return self.title

    @property
    def word_count(self):
        return len(self.body.split()) if self.body else 0


class Review(models.Model):
    article = models.ForeignKey(Article, on_delete=models.CASCADE)
    text = models.TextField()
    stars = models.PositiveIntegerField(default=5)

    def __str__(self):
        return self.text[:20]


class SiteSettings(models.Model):
    site_name = models.CharField(max_length=100, default="Site")
    tagline = models.CharField(max_length=200, blank=True)

    def __str__(self):
        return self.site_name


class Note(models.Model):
    title = models.CharField(max_length=100)
    # The soft-delete timestamp; see NoteAdmin.soft_delete.
    removed_at = models.DateTimeField(null=True, blank=True, editable=False)

    class Meta:
        verbose_name = "note"
        verbose_name_plural = "notes"

    def __str__(self):
        return self.title


class Page(models.Model):
    title = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)
    # A tenant field when TENANT_MODEL is Category.
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL
    )
    removed_at = models.DateTimeField(null=True, blank=True, editable=False)

    def __str__(self):
        return self.title


class Label(models.Model):
    # A primary key that is not called "id".
    code = models.CharField(max_length=20, primary_key=True)
    name = models.CharField(max_length=50)

    def __str__(self):
        return self.name


class Track(models.Model):
    title = models.CharField(max_length=100)
    # The manual order, per category; see TrackAdmin.reorder_field.
    position = models.IntegerField(default=0)
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.CASCADE
    )
    removed_at = models.DateTimeField(null=True, blank=True, editable=False)

    def __str__(self):
        return self.title


class Step(ManualOrderModel):
    article = models.ForeignKey(Article, on_delete=models.CASCADE)
    text = models.CharField(max_length=100)

    order_scope = ["article"]

    def __str__(self):
        return self.text


class TextBlock(Block):
    heading = models.CharField(max_length=50, blank=True)
    body = HTMLField()

    class Meta:
        description = "Rich text"
        icon = "ph-bold ph-text-t"


class CategoryLinkBlock(Block):
    category = models.ForeignKey(Category, on_delete=models.CASCADE)
    published = models.DateField(null=True, blank=True)


class ColumnsBlock(Block):
    left = BlockField(blocks=[TextBlock, CategoryLinkBlock], blank=True, max_num=2)
    right = BlockField(blocks=[TextBlock, CategoryLinkBlock], blank=True, max_num=2)


class LandingPage(models.Model):
    title = models.CharField(max_length=100)
    body = BlockField(blocks=[TextBlock, CategoryLinkBlock, ColumnsBlock], max_num=3)

    def __str__(self):
        return self.title


class Product(models.Model):
    # Duplication: see ProductAdmin.
    title = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, max_length=20)
    path = URLPathField(blank=True, null=True)
    sku = models.CharField(max_length=20, unique=True, null=True, blank=True)
    details = models.JSONField(default=dict, blank=True)
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL
    )
    tags = models.ManyToManyField(Category, blank=True, related_name="tagged")
    suppliers = models.ManyToManyField(
        Label, through="ProductSupplier", blank=True, related_name="products"
    )
    featured = models.OneToOneField(
        Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    manual = models.FileField(blank=True)
    internal_note = models.CharField(max_length=100, blank=True)
    secret = models.CharField(max_length=100, blank=True)
    imported_at = models.DateTimeField(null=True, blank=True, editable=False)
    removed_at = models.DateTimeField(null=True, blank=True, editable=False)

    def __str__(self):
        return self.title


class Part(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    code = models.SlugField(unique=True)

    def __str__(self):
        return self.name


class ProductSupplier(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    label = models.ForeignKey(Label, on_delete=models.CASCADE)
    note = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return self.note


class ProductComment(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    text = models.CharField(max_length=100)

    def __str__(self):
        return self.text
