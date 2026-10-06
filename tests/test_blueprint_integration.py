"""
Tests for the optional Django Blueprint integration.

Django Blueprint is NOT a dependency of Content Studio: the package must
import and work without it. When it is installed, its fields get their
dedicated widgets and formats.
"""

import importlib.util
import os
import subprocess
import sys

import pytest

blueprint_installed = importlib.util.find_spec("blueprint") is not None

BLUEPRINT_FIELD_NAMES = {
    "HTMLField",
    "TagField",
    "FlexField",
    "MultipleChoiceField",
    "URLPathField",
    "MediaField",
    "ManyMediaField",
}

_BLOCK_BLUEPRINT_SNIPPET = """
import os
import sys

os.environ["DJANGO_SETTINGS_MODULE"] = "tests.settings"

from importlib.abc import MetaPathFinder


class BlockBlueprint(MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == "blueprint" or fullname.startswith("blueprint."):
            raise ImportError("blocked for test")
        return None


sys.meta_path.insert(0, BlockBlueprint())

import django

django.setup()

import content_studio.admin as admin_module

assert admin_module.blueprint_available is False, "flag should be False"
widget_names = {
    key if isinstance(key, str) else key.__name__
    for key in admin_module.admin_site.default_widget_mapping
}
format_names = {
    key.__name__ for key in admin_module.admin_site.default_format_mapping
}
for name in ("HTMLField", "TagField", "MediaField", "ManyMediaField"):
    assert name not in widget_names, f"{name} should not be mapped"
    assert name not in format_names, f"{name} should not be mapped"
print("OK")
"""


def test_imports_without_blueprint():
    """Content Studio imports and builds mappings with blueprint unavailable.

    Runs in a subprocess so the blocked import does not affect the test
    process itself.
    """
    result = subprocess.run(
        [sys.executable, "-c", _BLOCK_BLUEPRINT_SNIPPET],
        capture_output=True,
        text=True,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        env={**os.environ, "DJANGO_SETTINGS_MODULE": "tests.settings"},
    )
    assert result.returncode == 0, result.stderr
    assert "OK" in result.stdout


@pytest.mark.skipif(not blueprint_installed, reason="django-blueprint is not installed")
def test_blueprint_widgets_registered_when_installed():
    """With blueprint installed, its fields map to their dedicated widgets."""
    from content_studio.admin import admin_site, blueprint_available

    assert blueprint_available is True
    widget_names = {
        key if isinstance(key, str) else key.__name__
        for key in admin_site.default_widget_mapping
    }
    assert BLUEPRINT_FIELD_NAMES <= widget_names

    format_names = {key.__name__ for key in admin_site.default_format_mapping}
    assert BLUEPRINT_FIELD_NAMES <= format_names
