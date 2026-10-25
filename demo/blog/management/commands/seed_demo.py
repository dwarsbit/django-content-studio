from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from demo.blog.models import Article, Category, Review

DEMO_PASSWORD = "admin1234"


class Command(BaseCommand):
    help = "Seed the demo project with staff users and sample content."

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

        # A second author, so the foreign key filter has a choice to make.
        editor, created = user_model.objects.get_or_create(
            username="editor",
            defaults={"is_staff": True},
        )
        if created:
            editor.set_password(DEMO_PASSWORD)
            editor.save(update_fields=["password"])
            self.stdout.write("Created staff user 'editor'.")

        categories = {
            slug: Category.objects.get_or_create(
                name=name, defaults={"position": position}
            )[0]
            for position, (slug, name) in enumerate(
                (
                    ("general", "General"),
                    ("technology", "Technology"),
                    ("opinion", "Opinion"),
                ),
                start=1,
            )
        }

        if not Article.objects.exists():
            now = timezone.now()

            # An article with reviews in a manual order, for reordering.
            ordered = Article.objects.create(
                title="Reviews in order",
                body="Seeded sample article with ordered reviews.",
                author=user,
                created_by=user,
            )
            for position, text in enumerate(
                ("First review", "Second review", "Third review"), start=1
            ):
                Review.objects.create(article=ordered, text=text, position=position)

            # Sample articles with varied values, so every filter type has
            # something to find: status choices, boolean, number range,
            # date range, foreign key and many to many.
            samples = [
                (
                    "Behind the scenes with Content Studio",
                    Article.Status.DRAFT,
                    editor,
                    False,
                    5,
                    None,
                    ["technology"],
                ),
                (
                    "Opinion: the admin interface needs a refresh",
                    Article.Status.PUBLISHED,
                    editor,
                    True,
                    75,
                    now - timedelta(days=9),
                    ["opinion", "technology"],
                ),
                (
                    "Tips and tricks for inlines",
                    Article.Status.DRAFT,
                    user,
                    False,
                    42,
                    None,
                    ["technology"],
                ),
                (
                    "A quiet week in the studio",
                    Article.Status.PUBLISHED,
                    user,
                    False,
                    8,
                    now - timedelta(days=60),
                    [],
                ),
            ]
            for title, status, author, featured, views, published_at, slugs in samples:
                article = Article.objects.create(
                    title=title,
                    body=f"Seeded sample article: {title}.",
                    status=status,
                    author=author,
                    created_by=user,
                    featured=featured,
                    views=views,
                    published_at=published_at,
                )
                for slug in slugs:
                    article.categories.add(categories[slug])
            self.stdout.write("Created sample articles.")

            # The demo article is created last, so it leads the pk-ordered
            # list and stays in the dashboard's latest-5 widget.
            article = Article.objects.create(
                title="Hello, Content Studio",
                body="This article was created by the demo seed command.",
                status=Article.Status.PUBLISHED,
                author=user,
                created_by=user,
                featured=True,
                views=120,
                published_at=now - timedelta(days=2),
            )
            article.categories.add(categories["general"])
            Review.objects.create(article=article, text="Nice first article!", stars=5)
            self.stdout.write("Created demo article.")

        self.stdout.write("Demo seed complete.")
