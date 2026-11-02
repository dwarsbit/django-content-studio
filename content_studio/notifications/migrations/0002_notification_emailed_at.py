from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("content_studio_notifications", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="notification",
            name="emailed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
