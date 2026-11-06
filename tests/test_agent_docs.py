"""
The docs for AI agents stay true to the code: every Content Studio import
in the docs, the README and the agent skill resolves, the skill only uses
public names, its code parses, and its links and check IDs exist.
"""

import ast
import importlib
import re
from pathlib import Path

import pytest

from tests.test_public_api import PUBLIC_MODULES, documented_names

ROOT = Path(__file__).parent.parent
DOCS = ROOT / "website" / "docs"
SKILLS = ROOT / "website" / "skills"
SKILL_FILES = sorted(SKILLS.glob("*/SKILL.md"))

IMPORT = re.compile(
    r"^\s*from (content_studio[\w.]*) import (?:\(([^)]*)\)|(.+))$", re.MULTILINE
)


def imports(text: str) -> list[tuple[str, str]]:
    """The (module, name) pairs of the Content Studio imports in a text."""
    pairs = []
    for match in IMPORT.finditer(text):
        names = match.group(2) if match.group(2) is not None else match.group(3)
        for name in names.replace("\n", ",").split(","):
            name = name.split("#")[0].strip().split(" as ")[0].strip()
            if name:
                pairs.append((match.group(1), name))
    return pairs


def python_blocks(text: str) -> list[str]:
    return re.findall(r"```python\n(.*?)```", text, re.DOTALL)


def resolve(module_name: str, name: str):
    module = importlib.import_module(module_name)
    if hasattr(module, name):
        return getattr(module, name)
    # A submodule, such as `from content_studio import widgets`.
    return importlib.import_module(f"{module_name}.{name}")


DOC_FILES = sorted(DOCS.glob("*.mdx")) + [ROOT / "README.md"] + SKILL_FILES


@pytest.mark.parametrize("path", DOC_FILES, ids=lambda path: path.name)
def test_documented_imports_resolve(path):
    missing = []
    for module_name, name in imports(path.read_text()):
        try:
            resolve(module_name, name)
        except (ImportError, AttributeError):
            missing.append(f"from {module_name} import {name}")

    assert not missing, f"{path.name} imports names that do not exist: {missing}"


def test_there_is_a_skill():
    assert SKILL_FILES


@pytest.mark.parametrize("path", SKILL_FILES, ids=lambda path: path.parent.name)
def test_skill_frontmatter(path):
    text = path.read_text()
    match = re.match(r"---\n(.*?)\n---\n", text, re.DOTALL)
    assert match, "SKILL.md starts with YAML frontmatter"

    fields = dict(
        line.split(": ", 1) for line in match.group(1).splitlines() if ": " in line
    )
    assert fields.get("name") == path.parent.name
    assert re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", fields["name"])
    assert 0 < len(fields.get("description", "")) <= 1024


@pytest.mark.parametrize("path", SKILL_FILES, ids=lambda path: path.parent.name)
def test_skill_uses_public_names_only(path):
    public = documented_names()
    private = []
    for module_name, name in imports(path.read_text()):
        if f"{module_name}.{name}" in PUBLIC_MODULES:
            continue
        if name not in public.get(module_name, set()):
            private.append(f"from {module_name} import {name}")

    assert not private, f"not in the public API: {private}"


@pytest.mark.parametrize("path", SKILL_FILES, ids=lambda path: path.parent.name)
def test_skill_code_parses(path):
    for block in python_blocks(path.read_text()):
        ast.parse(block)


@pytest.mark.parametrize("path", SKILL_FILES, ids=lambda path: path.parent.name)
def test_skill_links_to_existing_pages(path):
    pages = {page.stem for page in DOCS.glob("*.mdx")}
    linked = set(
        re.findall(r"djangocontentstudio\.org/docs/([\w-]+)\.md", path.read_text())
    )

    assert linked, "the skill links to the docs"
    assert linked <= pages, f"no such pages: {sorted(linked - pages)}"


@pytest.mark.parametrize("path", SKILL_FILES, ids=lambda path: path.parent.name)
def test_skill_check_ids_exist(path):
    documented = set(
        re.findall(
            r"content_studio\.([EW]\d{3})", (DOCS / "deployment.mdx").read_text()
        )
    )
    text = path.read_text()
    mentioned = set(re.findall(r"`([EW]\d{3})`", text))
    mentioned |= set(re.findall(r"content_studio\.([EW]\d{3})", text))
    # Ranges such as `E001`–`E040` name their ends.
    mentioned |= set(re.findall(r"([EW]\d{3})`?–`?", text))

    assert mentioned <= documented, f"unknown checks: {sorted(mentioned - documented)}"
