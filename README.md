<p align="center">
  <img src="https://raw.githubusercontent.com/dwarsbit/django-content-studio/main/website/static/img/logo.svg" alt="Django Content Studio" width="96">
</p>

# Django Content Studio

[![PyPI version](https://badge.fury.io/py/django-content-studio.svg)](https://badge.fury.io/py/django-content-studio)
[![Python versions](https://img.shields.io/pypi/pyversions/django-content-studio.svg)](https://pypi.org/project/django-content-studio/)
[![Django versions](https://img.shields.io/pypi/frameworkversions/django/django-content-studio.svg)](https://pypi.org/project/django-content-studio/)
[![CI](https://github.com/dwarsbit/django-content-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/dwarsbit/django-content-studio/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Django Content Studio is a modern alternative to the classic Django admin,
with batteries included. Register the models you already have and manage
them in a fast, modern admin, with optional fields and models for
content-driven projects.

**Documentation: [dwarsbit.github.io/django-content-studio](https://dwarsbit.github.io/django-content-studio/)**

## Features

- **Your models, as they are.** Register a plain Django model, as in the
  classic Django admin, and it is manageable. Nothing to migrate to.
- **A complete admin.** List pages with search, filters and sorting, and
  edit pages with validation, inlines and audit stamps. Access follows the
  permission hooks of the classic Django admin, down to single objects.
- **Dedicated widgets** for dates, rich text, tags, media and structured
  JSON, with edit pages laid out in Python.
- **A dashboard** with statistics, content lists and recent activity.
- **A media library** with folders, uploads and image crops.
- **Multi-tenancy**: one method decides which tenants an editor may work in.
- **Batteries included**: optional fields such as `HTMLField` and
  `TagField`, and base models such as `ContentModel` and `SingletonModel`.

## Quick start

1. Install the package:

   ```bash
   pip install django-content-studio
   ```

2. Add the apps to your settings:

   ```python
   # mysite/settings.py
   INSTALLED_APPS = [
       "django.contrib.admin",
       "django.contrib.auth",
       "django.contrib.contenttypes",
       "django.contrib.sessions",
       "django.contrib.messages",
       "django.contrib.staticfiles",
       "rest_framework",
       "content_studio",
       "blog",
   ]
   ```

3. Mount the admin:

   ```python
   # mysite/urls.py
   from django.urls import include, path

   urlpatterns = [
       path("admin/", include("content_studio.urls")),
   ]
   ```

4. Register a model in your app's `admin.py`:

   ```python
   # blog/admin.py
   from content_studio import register
   from content_studio.admin import ModelStudio

   from .models import Article


   @register(Article)
   class ArticleStudio(ModelStudio):
       table_display = ["title", "status", "published_at"]
       list_filter = ["status"]
       search_fields = ["title"]
   ```

5. Start the development server, open `/admin/` and log in with a staff
   account.

Continue with [Getting started](https://dwarsbit.github.io/django-content-studio/docs/getting-started)
in the documentation.

## Documentation

- [Introduction](https://dwarsbit.github.io/django-content-studio/docs/intro): what Content Studio is, and what it is not
- [How it compares](https://dwarsbit.github.io/django-content-studio/docs/comparison): Content Studio next to admin themes and content management systems
- [Getting started](https://dwarsbit.github.io/django-content-studio/docs/getting-started): installation and your first model
- [Registering models](https://dwarsbit.github.io/django-content-studio/docs/content/registering-models): studio options, singletons and inlines
- [Access control](https://dwarsbit.github.io/django-content-studio/docs/permissions): model and object permissions
- [Widgets](https://dwarsbit.github.io/django-content-studio/docs/forms/widgets) and [form sets](https://dwarsbit.github.io/django-content-studio/docs/forms/form-sets): field editors and edit page layouts
- [Dashboard](https://dwarsbit.github.io/django-content-studio/docs/dashboard): composing the start page
- [Media library](https://dwarsbit.github.io/django-content-studio/docs/media-library): models, uploads and cropping
- [Authentication](https://dwarsbit.github.io/django-content-studio/docs/authentication): logging in, sessions and password reset
- [Multi-tenancy](https://dwarsbit.github.io/django-content-studio/docs/multi-tenancy): tenants and who may work in them
- [Security](https://dwarsbit.github.io/django-content-studio/docs/security): what is protected, and a deployment checklist
- [Settings](https://dwarsbit.github.io/django-content-studio/docs/settings): every `CONTENT_STUDIO` setting

See also [Django Headless](https://djangoheadless.org), if you need an API
for your own clients.

## Contributing and support

- Read [CONTRIBUTING.md](CONTRIBUTING.md) to set up the project and propose a change.
- Report bugs in [GitHub Issues](https://github.com/dwarsbit/django-content-studio/issues) and ask questions in [GitHub Discussions](https://github.com/dwarsbit/django-content-studio/discussions).
- Report security problems privately; see [SECURITY.md](SECURITY.md).

## License

MIT; see [LICENSE](LICENSE). Changes are listed in the [changelog](CHANGELOG.md).
