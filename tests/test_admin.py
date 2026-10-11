"""
Tests for the Content Studio site: registration and the default user
studio.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase

from content_studio.admin import (
    ContentStudioSite,
    ModelStudio,
    admin_site,
)
from content_studio.exceptions import AlreadyRegistered, NotRegistered
from tests.testapp.models import Article, Category


class ContentStudioSiteTests(TestCase):
    def setUp(self):
        self.site = ContentStudioSite()

    def test_register_instantiates_the_studio(self):
        self.site.register(Article, ModelStudio)

        assert self.site.is_registered(Article)
        assert isinstance(self.site._registry[Article], ModelStudio)
        assert self.site._registry[Article].model is Article

    def test_register_rejects_double_registration(self):
        self.site.register(Article, ModelStudio)

        with self.assertRaises(AlreadyRegistered):
            self.site.register(Article, ModelStudio)

    def test_register_rejects_abstract_models(self):
        from django.db import models

        class Abstract(models.Model):
            class Meta:
                abstract = True

        with self.assertRaises(Exception):
            self.site.register(Abstract, ModelStudio)

    def test_register_without_studio_class_uses_default(self):
        self.site.register(Article)

        assert isinstance(self.site._registry[Article], ModelStudio)

    def test_register_applies_options_through_subclassing(self):
        self.site.register(Article, ModelStudio, list_per_page=7)

        assert self.site._registry[Article].list_per_page == 7
        assert issubclass(self.site._registry[Article].__class__, ModelStudio)

    def test_unregister_removes_the_model(self):
        self.site.register(Article, ModelStudio)
        self.site.unregister(Article)

        assert not self.site.is_registered(Article)

    def test_unregister_unknown_model_raises(self):
        with self.assertRaises(NotRegistered):
            self.site.unregister(Article)

    def test_register_decorator_uses_the_configured_site(self):
        from content_studio import register

        # The test app registers Category already; get out of its way.
        original = admin_site._registry.pop(Category)

        try:

            @register(Category)
            class CategoryStudio(ModelStudio):
                pass

            assert admin_site.is_registered(Category)
            assert isinstance(admin_site._registry[Category], CategoryStudio)

        finally:
            admin_site._registry[Category] = original

    def test_setup_registers_a_default_user_studio(self):
        self.site._register_default_user_studio()

        assert self.site.is_registered(get_user_model())
        assert isinstance(self.site._registry[get_user_model()], ModelStudio)

    def test_setup_respects_a_custom_user_studio(self):
        user_model = get_user_model()

        class UserStudio(ModelStudio):
            pass

        self.site.register(user_model, UserStudio)
        self.site._register_default_user_studio()

        assert isinstance(self.site._registry[user_model], UserStudio)

    def test_site_identity_defaults(self):
        assert admin_site.name == "content_studio"
        assert bool(admin_site.site_header)
        assert bool(admin_site.site_title)
