"""
Tests for the content fields' own validation.
"""

import pytest
from django.core.exceptions import ValidationError

from content_studio.fields import URLPathField


@pytest.mark.parametrize("value", ["about", "/blog/spring-sale", "a_b/c-1"])
def test_url_path_field_accepts_valid_paths(value):
    URLPathField().run_validators(value)


@pytest.mark.parametrize("value", ["about\n", "about\n/", "ab out", "a//b", "über"])
def test_url_path_field_rejects_invalid_paths(value):
    with pytest.raises(ValidationError):
        URLPathField().run_validators(value)
