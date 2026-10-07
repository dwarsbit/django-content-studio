from django.db import models


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
