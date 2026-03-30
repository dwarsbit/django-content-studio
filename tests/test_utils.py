"""
Tests for Django Content Studio utility functions.
"""
from django.test import TestCase
from django.contrib.auth.models import User


class UtilsTests(TestCase):
    """Test cases for utility functions."""
    
    def test_is_runserver(self):
        """Test is_runserver utility function."""
        from content_studio.utils import is_runserver
        
        # In test environment, this might return True or False depending on how it's detected
        # We'll just test that it doesn't raise an exception
        try:
            result = is_runserver()
            self.assertIsNotNone(result)
            self.assertIsInstance(result, bool)
        except Exception:
            self.fail("is_runserver() raised an exception")
    
    def test_get_tenant_field_name(self):
        """Test get_tenant_field_name utility function."""
        from content_studio.utils import get_tenant_field_name
        from django.contrib.auth.models import User
        
        # Test with User model (should return None as User has no tenant field)
        result = get_tenant_field_name(User)
        self.assertIsNone(result)
    
    def test_log_function(self):
        """Test log utility function."""
        from content_studio.utils import log
        
        # Should not raise exceptions
        try:
            log("Test message")
            log("🚀", "Test with emoji")
            log("Test", "with", "multiple", "args")
            log_works = True
        except Exception:
            log_works = False
        
        self.assertTrue(log_works)


class SettingsTests(TestCase):
    """Test cases for settings functionality."""
    
    def test_cs_settings_access(self):
        """Test that cs_settings can be accessed."""
        from content_studio.settings import cs_settings
        
        # Should not raise exceptions
        self.assertIsNotNone(cs_settings)
        
        # Test accessing some settings
        self.assertIsNotNone(cs_settings.ADMIN_SITE)
        self.assertIsNotNone(cs_settings.LOGIN_BACKENDS)
    
    def test_cs_settings_defaults(self):
        """Test that default settings are loaded correctly."""
        from content_studio.settings import cs_settings
        
        # Check some default values
        self.assertEqual(cs_settings.EDITED_BY_ATTR, "edited_by")
        self.assertEqual(cs_settings.EDITED_AT_ATTR, "edited_at")
        self.assertEqual(cs_settings.CREATED_BY_ATTR, "created_by")
        self.assertEqual(cs_settings.CREATED_AT_ATTR, "created_at")


class PaginatorTests(TestCase):
    """Test cases for paginator functionality."""
    
    def test_content_pagination(self):
        """Test ContentPagination class."""
        from content_studio.paginators import ContentPagination
        
        # Should be able to instantiate
        paginator = ContentPagination()
        self.assertIsNotNone(paginator)
        
        # Check that it has a page_size attribute (default might be 20)
        self.assertTrue(hasattr(paginator, 'page_size'))
        self.assertIsInstance(paginator.page_size, int)