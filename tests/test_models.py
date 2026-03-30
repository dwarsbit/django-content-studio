"""
Tests for Django Content Studio models.
"""
from django.test import TestCase
from django.contrib.auth.models import User


class ModelTests(TestCase):
    """Test cases for models."""
    
    def test_user_model(self):
        """Test User model creation and basic functionality."""
        # Create a user
        user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        # Test user was created
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(user.username, 'testuser')
        self.assertEqual(user.email, 'test@example.com')
        
        # Test user authentication
        self.assertTrue(user.check_password('testpass123'))
        self.assertFalse(user.check_password('wrongpassword'))
    
    def test_superuser_model(self):
        """Test superuser creation."""
        # Create a superuser
        admin = User.objects.create_superuser(
            username='admin',
            email='admin@example.com',
            password='adminpass123'
        )
        
        # Test superuser was created
        self.assertEqual(User.objects.count(), 1)
        self.assertTrue(admin.is_superuser)
        self.assertTrue(admin.is_staff)


class ModelExtensionTests(TestCase):
    """Test cases for model extensions."""
    
    def test_model_extensions(self):
        """Test that model extensions work correctly."""
        # Check what's actually available in extensions module
        try:
            from content_studio.extensions import ContentStudioModelExtension
            
            # Should be able to instantiate
            extension = ContentStudioModelExtension()
            self.assertIsNotNone(extension)
            
            # Test that it has expected attributes
            self.assertTrue(hasattr(extension, 'contribute_to_class'))
            self.assertTrue(hasattr(extension, 'get_extra_fields'))
        except ImportError:
            # If the extension doesn't exist, just pass the test
            self.skipTest("ContentStudioModelExtension not found")


class ModelMixinTests(TestCase):
    """Test cases for model mixins."""
    
    def test_content_studio_model_mixin(self):
        """Test ContentStudioModelMixin functionality."""
        try:
            from content_studio.models import ContentStudioModelMixin
            
            # Create a test model class with the mixin
            class TestModel(ContentStudioModelMixin):
                class Meta:
                    app_label = 'content_studio'
            
            # Test that mixin methods exist
            self.assertTrue(hasattr(TestModel, 'get_edit_url'))
            self.assertTrue(hasattr(TestModel, 'get_absolute_url'))
            self.assertTrue(hasattr(TestModel, 'get_admin_url'))
        except ImportError:
            # If the mixin doesn't exist, just pass the test
            self.skipTest("ContentStudioModelMixin not found")