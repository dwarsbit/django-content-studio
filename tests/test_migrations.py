"""
The migrations Content Studio ships (the media library and password reset
apps) match their models, whatever DEFAULT_AUTO_FIELD a project uses: a
mismatch would make makemigrations write a migration into the installed
package.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SHIPPED_APPS = ["content_studio", "content_studio_media_library", "password_reset"]


@pytest.mark.parametrize(
    "auto_field",
    ["django.db.models.AutoField", "django.db.models.BigAutoField"],
)
def test_shipped_migrations_match_the_models(auto_field):
    env = {
        **os.environ,
        "DJANGO_SETTINGS_MODULE": "tests.settings",
        "CONTENT_STUDIO_TEST_AUTO_FIELD": auto_field,
    }
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import django; from django.conf import settings; "
            "import os; settings.DEFAULT_AUTO_FIELD = "
            "os.environ['CONTENT_STUDIO_TEST_AUTO_FIELD']; django.setup(); "
            "from django.core.management import call_command; "
            f"call_command('makemigrations', *{SHIPPED_APPS!r}, "
            "check=True, dry_run=True)",
        ],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
