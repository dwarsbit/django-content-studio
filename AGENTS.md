# Django Content Studio - AI Agent Guide

## Project Overview

**Django Content Studio** is a modern, flexible alternative to the Django admin interface. It provides a React-based frontend with a Django REST Framework backend, offering a more contemporary and customizable admin experience.

- **Repository**: https://github.com/dwarsbit/django-content-studio
- **Package**: https://pypi.org/project/django-content-studio/
- **License**: MIT
- **Author**: Leon van der Grient (leon@dwarsbit.nl)
- **Version**: 1.0.0-beta.28

### Design Principles

- **Not a CMS**: Content Studio brings no models of its own. Like the classic Django admin, it works with any plain Django model — register it and it is manageable. Django Blueprint is **not** a requirement.
- **Blueprint-aware, never Blueprint-dependent**: Content Studio may detect Blueprint objects and adapt its behavior (for example, Blueprint's `HTMLField` renders the Rich Text widget), but every capability must also be achievable with plain Django models and fields. Never make Blueprint the only path to a feature.

---

## Architecture

### Backend (Python/Django)

```
content_studio/
├── __init__.py           # Package entry point, exports main functions
├── admin.py             # Enhanced AdminSite with widget/form mappings
├── apps.py              # App configuration and registry
├── settings.py          # Content Studio specific settings (CONTENT_STUDIO namespace)
├── models.py            # Base models (ActivityLog)
├── serializers.py       # DRF serializers
├── viewsets.py          # DRF viewsets for API endpoints
├── views.py             # Traditional Django views
├── urls.py              # URL routing
├── router.py            # Custom DRF router
├── paginators.py        # Custom pagination classes
├── form.py              # Form and field definitions
├── widgets.py           # Widget definitions for field rendering
├── formats.py           # Format definitions for field display
├── utils.py             # Utility functions
├── extensions.py        # Extension base classes
├── filters.py           # Filter definitions
├── dashboard/
│   ├── __init__.py
│   ├── content_list.py  # Dashboard content list component
│   ├── statistic.py     # Dashboard statistic component
│   ├── activity_log.py  # Activity logging for dashboard
│   └── scheduled_tasks.py
├── media_library/
│   └── viewsets.py      # Media library API endpoints
├── login_backends/
│   └── ...              # Authentication backends
├── token_backends/
│   └── jwt.py           # JWT token backend
├── contrib/
│   └── password_reset/  # Password reset functionality
├── static/              # Static files (compiled frontend)
├── templates/           # Django templates
└── locale/              # Translations
```

### Frontend (React/TypeScript)

```
frontend/
├── index.html           # Entry HTML file
├── package.json         # Frontend dependencies
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite configuration
├── components.json      # ShadCN component configuration
├── eslint.config.js     # ESLint configuration
├── public/              # Public assets
└── src/
    ├── main.tsx         # Application entry point
    ├── routes/          # Route definitions
    ├── components/      # React components
    ├── hooks/           # Custom React hooks
    ├── lib/             # Utility libraries
    ├── types/           # TypeScript type definitions
    ├── stores/          # State management (Zustand)
    └── ...
```

### Key Technologies

| Area | Technology | Version |
|------|------------|---------|
| Backend | Python | >=3.12 |
| Framework | Django | >=5.0,<7.0 |
| API | Django REST Framework | >=3.16,<4 |
| Auth | JWT (djangorestframework-simplejwt) | >=5,<6 |
| Frontend | React | 19.2.7 |
| Build | Vite | 8.0.16 |
| Styling | Tailwind CSS | 4.3.0 |
| State | TanStack Query | 5.101.0 |
| Forms | React Hook Form + Zod | 7.78.0 + 4.4.3 |
| UI | Radix UI + ShadCN | various |
| Editor | TipTap | 3.26.0 |

---

## Settings & Configuration

### Django Settings

Content Studio uses a namespaced settings system under `CONTENT_STUDIO`:

```python
# settings.py
CONTENT_STUDIO = {
    'ADMIN_SITE': 'content_studio.admin.admin_site',
    'LOGIN_BACKENDS': [
        'content_studio.login_backends.UsernamePasswordBackend',
    ],
    'EDITED_BY_ATTR': 'edited_by',
    'EDITED_AT_ATTR': 'edited_at',
    'CREATED_BY_ATTR': 'created_by',
    'CREATED_AT_ATTR': 'created_at',
    'MEDIA_LIBRARY_MODEL': None,
    'MEDIA_LIBRARY_FOLDER_MODEL': None,
    'TENANT_MODEL': None,
    'PASSWORD_RESET_EXPIRATION_TIME': 10,
    'LOGIN_THROTTLE_RATE': '10/min',  # per IP; None disables login throttling
}
```

See `content_studio/settings.py` for full configuration options.

### Frontend Environment

```bash
# frontend/.env
VITE_DCS_STATIC_PREFIX=/
VITE_DCS_BASENAME=http://localhost:8000/admin/
```

---

## Development

### Setup

```bash
# Backend
pip install -e .

# Frontend
cd frontend
npm install
npm run dev
```

### Scripts

```bash
# Testing
poetry run test          # Run tests
npm test                 # Frontend unit tests (from frontend/)
poetry run test-verbose  # Run tests with verbose output
poetry run test-cov      # Run tests with coverage

# Build
poetry run build         # Quality gate + build
poetry run publish       # Quality gate + publish
```

See `scripts/test_wrapper.py` for test configuration.

### Dependencies

- **Python**: Poetry for dependency management
- **Frontend**: npm for dependency management
- **Dev Tools**: black, pytest, pytest-django, vitest + testing-library, eslint, prettier, typescript

CI runs on GitHub Actions (`.github/workflows/ci.yml`): a backend matrix
(Python 3.12–3.14 x Django 5.2/6.0) with pytest + black, a frontend job with
typecheck + Vitest + build, and a packaging job that builds the wheel and
verifies the compiled assets, translations and a blueprint-less install.

---

## Code Organization

### Admin Registration

Models are registered with Content Studio using the `@register` decorator:

```python
from content_studio import register

@register
class MyModel:
    pass
```

### Widget System

Content Studio uses a widget system to render fields. Default mappings are defined in `admin.py`:

- `CharField` → `InputWidget`
- `TextField` → `TextAreaWidget`
- `BooleanField` → `CheckboxWidget`
- `ForeignKey` → `ForeignKeyWidget`
- `DateField` → `DateWidget`
- `DateTimeField` → `DateTimeWidget`
- `TimeField` → `TimeWidget`
- `JSONField` → `JSONWidget`
- Blueprint `HTMLField` → `RichTextWidget` (only when django-blueprint is installed)
- Blueprint `TagField` → `TagWidget` (only when django-blueprint is installed)

Blueprint widgets are registered via a guarded import: Content Studio imports and works fully without django-blueprint. Never import blueprint at module top level without a guard.

Custom widgets can be registered via the widget mapping.

### Form System

Forms are defined using `FormSet`, `FormSetGroup`, `Field`, and `Component` classes in `form.py`.

### Extensions

Content Studio supports extensions for adding custom functionality. See `extensions.py` for the base `Extension` class.

### Deterministic IDs

Extensions, dashboard widgets and form components derive their IDs deterministically (`utils.derive_uuid`) from the class plus the values returned by `get_id_parts()` — override that method to return the properties that define the object's identity. An explicit `extension_id`, `widget_id` or `component_id` (UUID) takes precedence and disambiguates duplicates — duplicate IDs raise `ImproperlyConfigured` at setup. Never use `uuid4()` for these IDs, and never let a base class inspect subclass attributes to derive IDs; use `get_id_parts()` overrides instead.

---

## API Endpoints

### Default URLs

```python
# content_studio/urls.py
urlpatterns = [
    path('api/auth/login/', ...),
    path('api/auth/logout/', ...),
    path('api/auth/me/', ...),
    path('api/<model>/', ...),
    path('api/<model>/<id>/', ...),
]
```

### Authentication

- Uses JWT tokens via djangorestframework-simplejwt
- Token backend configured in `token_backends/jwt.py`
- Login backends in `login_backends/` directory

---

## File Locations

| Purpose | Location |
|---------|----------|
| Main README | `/README.md` |
| Changelog | `/CHANGELOG.md` |
| Backend package | `/content_studio/` |
| Frontend app | `/frontend/` |
| Tests | `/tests/` |
| Poetry config | `/pyproject.toml` |
| Git ignore | `/.gitignore` |
| Frontend git ignore | `/frontend/.gitignore` |
| ESLint config | `/frontend/eslint.config.js` |
| TypeScript config | `/frontend/tsconfig.json` |
| Vite config | `/frontend/vite.config.ts` |
| Docs website | `/website` (Docusaurus, `npm run build`; deployed by the Website workflow) |

---

## Coding Standards

### Python

- **Formatter**: black (config in pyproject.toml)
- **Testing**: pytest with pytest-django
- **Type hints**: Encouraged
- **Style**: Follow PEP 8

### TypeScript/React

- **Formatter**: prettier
- **Linter**: ESLint with TypeScript
- **Components**: Use Radix UI primitives + ShadCN
- **Styling**: Tailwind CSS
- **State**: TanStack Query for server state, Zustand for client state
- **Forms**: React Hook Form with Zod validation

---

## Important Patterns

### 1. Model Registration

```python
# In your models.py or admin.py
from content_studio import register, display

@register
class Article:
    title = models.CharField(max_length=200)
    content = models.TextField()
    
    @display
    def short_content(self):
        return self.content[:100]
```

### 2. Custom Widgets

```python
from content_studio.widgets import BaseWidget

class CustomWidget(BaseWidget):
    name = 'custom'
    # ... implementation
```

### 3. Settings Access

```python
from content_studio.settings import api_settings

# Access a setting
admin_site_class = api_settings.ADMIN_SITE
```

### 4. API Viewsets

```python
from content_studio.viewsets import ModelViewSet

class ArticleViewSet(ModelViewSet):
    # Custom behavior
    pass
```

---

## Testing

- Tests are located in `/tests/`
- Uses pytest with pytest-django
- Coverage report generated to `.coverage`
- Test wrapper script in `scripts/test_wrapper.py`

Run tests:
```bash
poetry run test        # Normal run
poetry run test-cov    # With coverage
```

---

## Common Tasks

### Adding a New Feature

1. Add backend code in `content_studio/`
2. Add frontend code in `frontend/src/`
3. Add tests in `tests/`
4. Update documentation if needed

### Adding a Model

1. Define the model in your app
2. Register with `@register` decorator
3. Optionally customize with `@display` for list views

### Customizing the Dashboard

1. Extend `AdminSite` class
2. Set custom dashboard component
3. Configure widgets and layout

---

## Contributing

- **Issues**: https://github.com/dwarsbit/django-content-studio/issues
- **Discussions**: https://github.com/dwarsbit/django-content-studio/discussions
- **Email**: leon@dwarsbit.nl

---

## Quick Reference

| Task | Command |
|------|---------|
| Install package | `pip install django-content-studio` |
| Run backend tests | `poetry run test` |
| Run frontend tests | `cd frontend && npm test` |
| Run frontend dev | `cd frontend && npm run dev` |
| Build frontend | `cd frontend && npm run build` |
| Lint frontend | `cd frontend && npm run lint` |
| Format Python | `black .` |
| Format frontend | `cd frontend && prettier --write .` |
| Run docs site | `cd website && npm start` |
| Build docs site | `cd website && npm run build` |
