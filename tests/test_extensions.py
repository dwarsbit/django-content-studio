"""
Tests for the extensions' serialization: what the frontend receives.
"""

from content_studio.extensions import DEFAULT_IFRAME_SANDBOX, IFramePage


def test_an_iframe_page_is_sandboxed_by_default():
    page = IFramePage(path="/reports/", iframe_url="https://example.com")

    assert page.serialize()["config"] == {
        "path": "/reports/",
        "iframe_url": "https://example.com",
        "sandbox": DEFAULT_IFRAME_SANDBOX,
    }
    # The default keeps the embedded page working but keeps it from
    # navigating the admin away.
    assert "allow-scripts" in DEFAULT_IFRAME_SANDBOX
    assert "allow-top-navigation" not in DEFAULT_IFRAME_SANDBOX


def test_the_sandbox_can_be_tightened_or_turned_off():
    tight = IFramePage("/a/", "https://example.com", sandbox="allow-scripts")
    assert tight.serialize()["config"]["sandbox"] == "allow-scripts"

    off = IFramePage("/a/", "https://example.com", sandbox=None)
    assert off.serialize()["config"]["sandbox"] is None


def test_the_sandbox_is_not_part_of_the_identity():
    sandboxed = IFramePage("/a/", "https://example.com")
    plain = IFramePage("/a/", "https://example.com", sandbox=None)

    assert sandboxed.extension_id == plain.extension_id
