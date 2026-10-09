from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from demo.blog.models import Article, Category, Review

DEMO_PASSWORD = "admin1234"


class Command(BaseCommand):
    help = "Seed the demo project with a staff user and sample content."

    def handle(self, *args, **options):
        user_model = get_user_model()
        user, created = user_model.objects.get_or_create(
            username="admin",
            defaults={"is_staff": True, "is_superuser": True},
        )
        if created:
            user.set_password(DEMO_PASSWORD)
            user.save(update_fields=["password"])
            self.stdout.write("Created staff user 'admin'.")

        category, _ = Category.objects.get_or_create(name="General")

        if not Article.objects.exists():
            article = Article.objects.create(
                title="Hello, Content Studio",
                body="This article was created by the demo seed command.",
                status=Article.Status.PUBLISHED,
                author=user,
                created_by=user,
            )
            article.categories.add(category)
            Review.objects.create(article=article, text="Nice first article!", stars=5)
            self.stdout.write("Created sample article.")

        self.stdout.write("Demo seed complete.")
