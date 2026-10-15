"""
Tests for the init_content_studio management command.
"""

import io
import sys

import pytest
from django.apps import apps
from django.core.management import call_command
from django.core.management.base import CommandError
from content_studio.management.commands import init_content_studio
from content_studio.management.commands.init_content_studio import (
    Command,
    model_import_path,
)

SETTINGS_CONTENT = 'SECRET_KEY = "test"\nDEBUG = True\n'


def make_project(tmp_path, content=SETTINGS_CONTENT):
    """
    A fake settings module location for the command to operate on.
    """
    settings_path = tmp_path / "settings.py"
    settings_path.write_text(content)

    return settings_path


def patch_location(monkeypatch, settings_path):
    monkeypatch.setattr(
        Command,
        "_locate",
        lambda self: ("myproject.settings", settings_path, "myproject"),
    )


def patch_prompts(monkeypatch, answers):
    """
    Feed the prompts canned answers in order (None selects none, an
    int picks that option index); a prompt beyond the answers fails
    loudly instead of hanging the suite.
    """
    answers = list(answers)

    def fake(self, question, options, display=str, default_index=None):
        assert answers, f"Unexpected prompt: {question}"

        answer = answers.pop(0)

        if answer is None:
            return options[default_index - 1] if default_index else None

        if isinstance(answer, int):
            return options[answer]

        return answer

    monkeypatch.setattr(Command, "_prompt_choice", fake)


def patch_tty(monkeypatch, isatty=True):
    monkeypatch.setattr(sys.stdin, "isatty", lambda: isatty)


def forbid_prompts(monkeypatch):
    def fail(self, question, options, display=str, default_index=None):
        raise AssertionError(f"Unexpected prompt: {question}")

    monkeypatch.setattr(Command, "_prompt_choice", fail)


def output():
    return io.StringIO()


def sorted_models():
    return sorted(apps.get_models(), key=lambda model: model._meta.label_lower)


def test_command_is_available():
    from django.core.management import get_commands

    assert get_commands().get("init_content_studio") == "content_studio"


def test_prompt_choice_leads_with_none_and_returns_the_selection(monkeypatch):
    """The interactive select lists a "None" entry first for optional
    choices and hands back the chosen option."""

    recorded = {}

    def fake_pick(options, title=None, indicator=None, quit_keys=None):
        recorded["options"] = options
        recorded["title"] = title

        # The second real option: after the leading "None" entry.
        return options[2], 2

    monkeypatch.setattr(init_content_studio, "pick", fake_pick)

    result = Command()._prompt_choice("Pick one", ["a", "b"], display=str.upper)

    assert result == "b"
    assert recorded["title"] == "Pick one"
    assert recorded["options"][0] == "None"
    assert recorded["options"][1] == "A"


def test_prompt_choice_returns_the_default_when_cancelled(monkeypatch):
    """A cancelled select (Ctrl-C) comes out as the default."""

    def fake_pick(options, title=None, indicator=None, quit_keys=None):
        raise KeyboardInterrupt

    monkeypatch.setattr(init_content_studio, "pick", fake_pick)

    result = Command()._prompt_choice(
        "Login backend", ["backend.one", "backend.two"], default_index=1
    )

    assert result == "backend.one"


def test_prompt_choice_esc_declined_reasks_the_prompt(monkeypatch):
    """ESC asks for confirmation; declining ("No") returns to the prompt."""

    calls = []

    def fake_pick(options, title=None, indicator=None, quit_keys=None):
        calls.append(title)

        if len(calls) == 1:
            # ESC: pick reports it as index -1.
            return None, -1

        if len(calls) == 2:
            # The confirmation's highlighted default: No.
            return init_content_studio.EXIT_NO, 0

        # The re-asked prompt: the second real option.
        return options[2], 2

    monkeypatch.setattr(init_content_studio, "pick", fake_pick)

    result = Command()._prompt_choice("Pick one", ["a", "b"], display=str.upper)

    assert result == "b"
    assert calls == ["Pick one", "Do you want to exit?", "Pick one"]


def test_prompt_choice_esc_confirmed_aborts(monkeypatch):
    """ESC, then confirming the exit, aborts the command."""

    def fake_pick(options, title=None, indicator=None, quit_keys=None):
        if title == "Do you want to exit?":
            return init_content_studio.EXIT_YES, 1

        return None, -1

    monkeypatch.setattr(init_content_studio, "pick", fake_pick)

    with pytest.raises(CommandError):
        Command()._prompt_choice("Pick one", ["a", "b"])


def test_interactive_run_creates_studio_and_settings(tmp_path, monkeypatch):
    settings_path = make_project(tmp_path)
    patch_location(monkeypatch, settings_path)
    patch_tty(monkeypatch)

    first_model = sorted_models()[0]

    # Item: the first model. Folder, tenant: none. Login backend: default.
    patch_prompts(monkeypatch, [0, None, None, None])

    out = output()
    call_command("init_content_studio", stdout=out)

    # The run opens with what the initialization is about.
    output_text = out.getvalue()
    assert "Initialize Content Studio" in output_text
    assert "myproject.studio" in output_text

    studio = (tmp_path / "studio.py").read_text()
    assert "admin_site = ContentStudioSite()" in studio

    content = settings_path.read_text()
    assert '"ADMIN_SITE": "myproject.studio.admin_site"' in content
    assert f'"MEDIA_LIBRARY_MODEL": "{model_import_path(first_model)}",' in content
    assert '"MEDIA_LIBRARY_FOLDER_MODEL": None,' in content
    assert '"TENANT_MODEL": None,' in content
    assert (
        '"LOGIN_BACKENDS": ["content_studio.login_backends.UsernamePasswordBackend"]'
        in content
    )


def test_folder_model_is_not_prompted_without_an_item_model(tmp_path, monkeypatch):
    settings_path = make_project(tmp_path)
    patch_location(monkeypatch, settings_path)
    patch_tty(monkeypatch)

    # Exactly three prompts: item (none), tenant, login backend. A
    # fourth prompt would fail through the patched prompts.
    patch_prompts(monkeypatch, [None, None, None])

    call_command("init_content_studio", stdout=output())

    content = settings_path.read_text()
    assert '"MEDIA_LIBRARY_MODEL": None,' in content
    assert '"MEDIA_LIBRARY_FOLDER_MODEL": None,' in content


def test_existing_content_studio_is_reported_and_skipped(tmp_path, monkeypatch):
    settings_path = make_project(tmp_path, 'CONTENT_STUDIO = {"ADMIN_SITE": "x.y"}\n')
    patch_location(monkeypatch, settings_path)
    patch_tty(monkeypatch)
    patch_prompts(monkeypatch, [None, None, None])

    out = output()
    call_command("init_content_studio", stdout=out)

    assert "CONTENT_STUDIO already exists" in out.getvalue()
    assert settings_path.read_text() == 'CONTENT_STUDIO = {"ADMIN_SITE": "x.y"}\n'

    # The site module is still created: it is what the setting points at.
    assert "admin_site = ContentStudioSite()" in (tmp_path / "studio.py").read_text()


def test_existing_studio_module_is_left_untouched(tmp_path, monkeypatch):
    settings_path = make_project(tmp_path)
    patch_location(monkeypatch, settings_path)
    patch_tty(monkeypatch)
    (tmp_path / "studio.py").write_text("# custom site\n")

    patch_prompts(monkeypatch, [None, None, None])

    out = output()
    call_command("init_content_studio", stdout=out)

    assert "studio.py already exists" in out.getvalue()
    assert (tmp_path / "studio.py").read_text() == "# custom site\n"


def test_no_input_uses_defaults(tmp_path, monkeypatch):
    settings_path = make_project(tmp_path)
    patch_location(monkeypatch, settings_path)

    forbid_prompts(monkeypatch)

    call_command("init_content_studio", "--no-input", stdout=output())

    content = settings_path.read_text()
    assert '"MEDIA_LIBRARY_MODEL": None,' in content
    assert '"TENANT_MODEL": None,' in content
    assert (
        '"LOGIN_BACKENDS": ["content_studio.login_backends.UsernamePasswordBackend"]'
        in content
    )


def test_flags_skip_the_prompts(tmp_path, monkeypatch):
    settings_path = make_project(tmp_path)
    patch_location(monkeypatch, settings_path)

    forbid_prompts(monkeypatch)

    call_command(
        "init_content_studio",
        "--no-input",
        "--media-item",
        "testapp.Article",
        "--media-folder",
        "testapp.Category",
        "--tenant",
        "auth.Group",
        "--login-backend",
        "content_studio.login_backends.UsernamePasswordBackend",
        stdout=output(),
    )

    content = settings_path.read_text()
    assert '"MEDIA_LIBRARY_MODEL": "tests.testapp.models.Article",' in content
    assert '"MEDIA_LIBRARY_FOLDER_MODEL": "tests.testapp.models.Category",' in content
    assert '"TENANT_MODEL": "django.contrib.auth.models.Group",' in content


def test_unknown_flag_model_raises(tmp_path, monkeypatch):
    patch_location(monkeypatch, make_project(tmp_path))

    with pytest.raises(CommandError):
        call_command("init_content_studio", "--no-input", "--media-item", "nope.Nope")


def test_missing_installed_app_raises(tmp_path, monkeypatch):
    patch_location(monkeypatch, make_project(tmp_path))
    monkeypatch.setattr(apps, "is_installed", lambda app_label: False)

    with pytest.raises(CommandError):
        call_command("init_content_studio", stdout=output())


def test_piped_run_without_a_terminal_uses_defaults(tmp_path, monkeypatch):
    """The arrow-key prompts need a terminal; a piped run falls back
    to the defaults with a warning."""
    settings_path = make_project(tmp_path)
    patch_location(monkeypatch, settings_path)
    patch_tty(monkeypatch, isatty=False)
    forbid_prompts(monkeypatch)

    out = output()
    call_command("init_content_studio", stdout=out)

    assert "No interactive terminal" in out.getvalue()

    content = settings_path.read_text()
    assert '"MEDIA_LIBRARY_MODEL": None,' in content
    assert '"TENANT_MODEL": None,' in content
