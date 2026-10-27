"""
The public API: every public module declares __all__, every listed name
resolves, and the Public API docs page lists exactly those names — so a
name cannot become public (or stop being public) without the docs
following.
"""

import importlib
import re
from pathlib import Path

import pytest

DOCS_PAGE = Path(__file__).parent.parent / "website" / "docs" / "public-api.mdx"

PUBLIC_MODULES = [
    "content_studio",
    "content_studio.admin",
    "content_studio.form",
    "content_studio.actions",
    "content_studio.dashboard",
    "content_studio.dashboard.statistic",
    "content_studio.dashboard.content_list",
    "content_studio.dashboard.activity_log",
    "content_studio.dashboard.scheduled_tasks",
    "content_studio.extensions",
    "content_studio.widgets",
    "content_studio.formats",
    "content_studio.fields",
    "content_studio.blocks",
    "content_studio.models",
    "content_studio.managers",
    "content_studio.signals",
    "content_studio.validators",
    "content_studio.sanitizers",
    "content_studio.exceptions",
    "content_studio.media_library.fields",
    "content_studio.media_library.models",
    "content_studio.webhooks.models",
    "content_studio.webhooks.dashboard",
    "content_studio.webhooks.extensions",
]


def documented_names() -> dict[str, set[str]]:
    """The names the docs page lists, keyed by module."""
    documented: dict[str, set[str]] = {}
    module = None

    for line in DOCS_PAGE.read_text().splitlines():
        heading = re.match(r"## `([\w.*]+)`", line)
        if heading:
            module = heading.group(1)
            continue

        item = re.match(r"- `([\w.]+)`", line)
        if item and module:
            name = item.group(1)
            if module.endswith(".*"):
                # Fully qualified names, each from its own module.
                module_name, _, name = name.rpartition(".")
                documented.setdefault(module_name, set()).add(name)
            else:
                documented.setdefault(module, set()).add(name)

    return documented


@pytest.mark.parametrize("module_name", PUBLIC_MODULES)
def test_public_module_declares_resolvable_names(module_name):
    module = importlib.import_module(module_name)

    assert module.__all__, f"{module_name} declares no public names"
    for name in module.__all__:
        assert getattr(module, name, None) is not None, f"{module_name}.{name}"


@pytest.mark.parametrize("module_name", PUBLIC_MODULES)
def test_public_names_match_the_docs(module_name):
    module = importlib.import_module(module_name)

    assert documented_names().get(module_name, set()) == set(module.__all__)


def test_docs_list_no_other_modules():
    assert set(documented_names()) == set(PUBLIC_MODULES)
