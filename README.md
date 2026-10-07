# Django Content Studio

[![PyPI version](https://badge.fury.io/py/django-content-studio.svg)](https://badge.fury.io/py/django-content-studio)
[![Python versions](https://img.shields.io/pypi/pyversions/django-content-studio.svg)](https://pypi.org/project/django-content-studio/)
[![Django versions](https://img.shields.io/badge/django-5.0%2B-blue.svg)](https://www.djangoproject.com/)
[![CI](https://github.com/dwarsbit/django-content-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/dwarsbit/django-content-studio/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Django Content Studio is a modern, flexible alternative to the Django admin: a React interface on top of an auto-generated Django REST Framework API.

📖 **Read the full documentation at [dwarsbit.github.io/django-content-studio](https://dwarsbit.github.io/django-content-studio/)**

## ✨ Features

- **🎯 Works with any model**: register a plain Django model — like the classic admin — and it is manageable. Content Studio brings no models of its own; it is an admin, not a CMS
- **⚡ A complete editing interface**: list views with search, filtering and ordering, a widget-based editor with validation, inlines and audit stamps — secured by the same permission hooks the Django admin calls, including per-object checks
- **🧩 Widget-based editing**: dedicated editors for dates, rich text, tags, media and JSON, with edit views laid out through form sets, field layouts and components
- **📊 A composable dashboard**: statistics, content lists, activity logs and scheduled tasks as widgets you declare in Python
- **🖼️ Media library**: folders, uploads and image crops against whichever media model you configure
- **🧭 Multi-tenancy**: one header scopes every query, one hook decides which tenants a user may see
- **🤝 Plays nice**: pairs with [Django Blueprint](https://github.com/dwarsbit/django-blueprint) when installed — its fields get dedicated widgets — but Blueprint is never a requirement

## 🚀 Quick Start

Install the package:

```bash
pip install django-content-studio
```

Add `rest_framework` and `content_studio` to `INSTALLED_APPS` (after `django.contrib.admin`, which provides the model registry):

```python
# settings.py
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'content_studio',  # Add this
    # ... your apps
]
```

Include the URLs:

```python
# urls.py
urlpatterns = [
    path('admin/', include('content_studio.urls')),
    # ... your urls
]
```

Register a model:

```python
# apps/blog/admin.py
from content_studio import register
from content_studio.admin import ModelAdmin


@register(Article)
class ArticleAdmin(ModelAdmin):
    list_display = ['title', 'status', 'published_at']
    list_filter = ['status']
    search_fields = ['title']
```

That's it! 🎉 Open `/admin/`, log in with a staff account, and manage your content in a modern interface. (Building an API of your own? Use [Django Headless](https://github.com/dwarsbit/django-headless) — Content Studio's backend is internal plumbing for its interface, not a public API.)

## 📚 Documentation

All usage and configuration is documented at [dwarsbit.github.io/django-content-studio](https://dwarsbit.github.io/django-content-studio/):

- [Introduction](https://dwarsbit.github.io/django-content-studio/docs/intro) — what Content Studio is (and is not)
- [Getting started](https://dwarsbit.github.io/django-content-studio/docs/getting-started) — requirements, setup and your first model
- [Registering models](https://dwarsbit.github.io/django-content-studio/docs/content/registering-models) — every `ModelAdmin` option, singletons and inlines
- [Access control](https://dwarsbit.github.io/django-content-studio/docs/permissions) — model-level and per-object permission hooks, login throttling
- [Widgets and forms](https://dwarsbit.github.io/django-content-studio/docs/forms/widgets) — the widget registry and custom form layouts
- [Dashboard](https://dwarsbit.github.io/django-content-studio/docs/dashboard) — composing the dashboard with widgets
- [Media library](https://dwarsbit.github.io/django-content-studio/docs/media-library) — configuration, uploads and thumbnails
- [Authentication](https://dwarsbit.github.io/django-content-studio/docs/authentication) — JWT, login backends, throttling and password reset
- [Multi-tenancy](https://dwarsbit.github.io/django-content-studio/docs/multi-tenancy) — the tenant model, header scoping and the `get_tenants` hook
- [Extensions](https://dwarsbit.github.io/django-content-studio/docs/extensions) — menu links and iframe pages
- [Settings reference](https://dwarsbit.github.io/django-content-studio/docs/settings) — every `CONTENT_STUDIO` option
- [Blueprint integration](https://dwarsbit.github.io/django-content-studio/docs/blueprint-integration) — the optional pairing, end to end

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for your changes (backend: `poetry run test`; frontend: `cd frontend && npm test`)
5. Run the test suites
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/dwarsbit/django-content-studio.git
cd django-content-studio

# Install dependencies (Poetry creates the virtual environment)
poetry install

# Run backend tests
poetry run test

# Frontend (React interface)
cd frontend
npm install
npm run dev
npm test
```

## 🐛 Issues & Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/dwarsbit/django-content-studio/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/dwarsbit/django-content-studio/discussions)
- 📧 **Email**: leon@dwarsbit.nl

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on the shoulders of [Django](https://www.djangoproject.com/) and [Django REST Framework](https://www.django-rest-framework.org/)
- Interface built with React and Tailwind CSS
- Thanks to all contributors and the Django community

## 🔗 Links

- [Documentation](https://dwarsbit.github.io/django-content-studio/)
- [PyPI Package](https://pypi.org/project/django-content-studio/)
- [GitHub Repository](https://github.com/dwarsbit/django-content-studio)
- [Changelog](CHANGELOG.md)
