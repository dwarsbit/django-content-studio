# Django Content Studio

[![PyPI version](https://badge.fury.io/py/django-content-studio.svg)](https://badge.fury.io/py/django-content-studio)
[![Python versions](https://img.shields.io/pypi/pyversions/django-content-studio.svg)](https://pypi.org/project/django-content-studio/)
[![Django versions](https://img.shields.io/badge/django-5.0%2B-blue.svg)](https://www.djangoproject.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Django Content Studio is a modern, flexible alternative to the Django admin.

## 🚀 Quick Start

### Installation

☝️ Django Content Studio depends on Django and Django Rest Framework.

```bash
pip install django-content-studio
```

### Add to Django Settings

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
### Add URLs

```python
# urls.py
urlpatterns = [
    path("admin/", include("content_studio.urls")),
    # ... your urls
]
```

## 🐛 Issues & Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/dwarsbit/django-content-studio/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/dwarsbit/django-content-studio/discussions)
- 📧 **Email**: leon@dwarsbit.nl

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with React and Tailwind CSS
- Inspired by the original Django admin
- Thanks to all contributors and the Django community

## 🔗 Links

- [PyPI Package](https://pypi.org/project/django-content-studio/)
- [GitHub Repository](https://github.com/dwarsbit/django-content-studio)
- [Changelog](CHANGELOG.md)

---

Made in Europe 🇪🇺 with 💚 for Django