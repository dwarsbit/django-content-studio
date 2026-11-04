import json
import shutil
import tempfile
from pathlib import Path

from django.test import TestCase, override_settings

ENTRY_FILES = [
    "content_studio/img/favicon.png",
    "content_studio/assets/index.js",
    "content_studio/assets/index.css",
    "content_studio/fonts/inter/index.css",
    "content_studio/icons/pi/style.css",
]


class ManifestStaticFilesTests(TestCase):
    """
    The web app renders with a manifest storage in production (#108).
    """

    def setUp(self):
        # A manifest as collectstatic writes it for the files the page
        # references. Like a real one, it has no entry for the empty name.
        static_root = tempfile.mkdtemp(prefix="content_studio_static_")
        self.addCleanup(shutil.rmtree, static_root)
        paths = {name: name.replace(".", ".abc123.", 1) for name in ENTRY_FILES}
        manifest = {"paths": paths, "version": "1.1", "hash": "abc123"}
        Path(static_root, "staticfiles.json").write_text(json.dumps(manifest))

        settings = override_settings(
            DEBUG=False,
            STATIC_ROOT=static_root,
            STORAGES={
                "default": {
                    "BACKEND": "django.core.files.storage.FileSystemStorage",
                },
                "staticfiles": {
                    "BACKEND": "django.contrib.staticfiles.storage.ManifestStaticFilesStorage",
                },
            },
        )
        settings.enable()
        self.addCleanup(settings.disable)

    def test_index_renders(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(
            response, 'window.DCS_STATIC_PREFIX = "/static/content_studio/";'
        )
        self.assertContains(response, "/static/content_studio/assets/index.abc123.js")
