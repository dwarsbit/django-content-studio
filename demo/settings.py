"""
Django settings for the Content Studio demo project.

The demo mirrors the documented install: `django.contrib.admin` before
`content_studio`, the interface mounted under `admin/`, and models registered
with `@register`. It is intentionally plain Django — django-blueprint is *not*
required. When blueprint happens to be installed, one extra Blueprint-integrated
model registers itself (see `demo/blog/models.py`) to cover the optional
integration.
"""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = "django-insecure-demo-key-not-for-production"
DEBUG = True
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "content_studio",
    "content_studio.contrib.password_reset",
    "demo.blog",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "demo.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "demo" / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "demo" / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Keep demo emails out of SMTP; password reset codes land in the console.
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

CONTENT_STUDIO = {
    "ADMIN_SITE": "demo.blog.admin.admin_site",
    "MEDIA_LIBRARY_MODEL": "demo.blog.models.MediaItem",
    "MEDIA_LIBRARY_FOLDER_MODEL": "demo.blog.models.MediaFolder",
    # The default per-IP rate (10/min) is fine for humans; the e2e suite
    # drives several parallel browser contexts through the same login form.
    "LOGIN_THROTTLE_RATE": "60/min",
}
