"""
Tests for the documented entry points (`from content_studio import
register`). They resolve lazily: importing the admin module eagerly
would require the app registry to be ready.
"""

import subprocess
import sys


def test_documented_imports_work():
    from content_studio import display, register

    assert callable(register)
    assert callable(display)


def test_package_import_does_not_require_the_admin_module():
    """A bare import must not pull in Django's admin (registry not ready)."""
    code = "import sys; import content_studio; print('admin' not in sys.modules)"
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "True"


def test_unknown_attribute_raises_attribute_error():
    import content_studio

    try:
        content_studio.nonexistent
    except AttributeError as e:
        assert "nonexistent" in str(e)
    else:
        raise AssertionError("expected AttributeError")
