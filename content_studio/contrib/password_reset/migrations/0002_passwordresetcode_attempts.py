from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("password_reset", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="passwordresetcode",
            name="attempts",
            field=models.PositiveIntegerField(
                default=0, editable=False, verbose_name="Failed attempts"
            ),
        ),
    ]
