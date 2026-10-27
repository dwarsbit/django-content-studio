# Django Content Studio - AI Agent Guide

## Project Overview

**Django Content Studio** is a modern, flexible alternative to the Django admin interface. It provides a React-based frontend with a Django REST Framework backend, offering a more contemporary and customizable admin experience.

- **Repository**: https://github.com/dwarsbit/django-content-studio
- **Package**: https://pypi.org/project/django-content-studio/
- **License**: MIT
- **Author**: Leon van der Grient (leon@dwarsbit.nl)
- **Version**: 1.0.0-rc.1

### Design Principles

- **Not a CMS**: Content Studio manages the models you already have. Like the classic Django admin, it works with any plain Django model — register it and it is manageable.
- **Batteries included, never imposed**: Content Studio ships optional content fields (`content_studio.fields`: `HTMLField`, `TagField`, `FlexField`, ...) and base models (`content_studio.models`: `ContentModel`, `SingletonModel`, `SoftDeletableModel`, ...), formerly provided by the now-merged and deprecated django-blueprint. Every capability must also be achievable with plain Django models and fields; never make a built-in field or model the only path to a feature.
- **The internal API stays internal**: the generated Django REST Framework backend is plumbing for the React app, not a public feature. Users who need an API for their own clients should use django-headless. Never document or expose API internals (endpoints, wire formats, the tenant header) in user-facing documentation.

---

## Architecture

### Backend (Python/Django)

```
content_studio/
├── __init__.py           # Package entry point, exports main functions
├── admin.py             # ModelStudio, InlineModelStudio, ContentStudioSite, registry
├── apps.py              # App configuration and registry
├── settings.py          # Content Studio specific settings (CONTENT_STUDIO namespace)
├── models.py            # The optional base models (ContentModel, SingletonModel, ...); activity is Django's LogEntry
├── serializers.py       # DRF serializers
├── viewsets.py          # DRF viewsets for API endpoints
├── views.py             # Traditional Django views
├── urls.py              # URL routing
├── router.py            # Custom DRF router
├── paginators.py        # Custom pagination classes
├── form.py              # Form and field definitions
├── fields.py            # Optional content fields (HTMLField, TagField, FlexField, ...)
├── blocks.py            # BlockField and Block: an ordered list of content blocks
├── managers.py          # Managers for the base models (SingletonManager, SoftDeletableManager)
├── sanitizers.py        # HTML sanitizer (allowlist based on nh3)
├── validators.py        # Field validators (JSONSchemaValidator, ChoiceOptionsValidator)
├── widgets.py           # Widget definitions for field rendering
├── formats.py           # Format definitions for field display
├── checks.py            # System checks (content_studio.E001-E020, W001-W013)
├── utils.py             # Utility functions
├── actions.py           # Bulk actions (@bulk_action decorator, resolution)
├── reordering.py        # Built-in reordering (reorder_field moves, ManualOrderModel renumbering)
├── extensions.py        # Extension base classes
├── filters.py           # Filter definitions
├── dashboard/
│   ├── __init__.py
│   ├── content_list.py  # Dashboard content list component
│   ├── statistic.py     # Dashboard statistic component
│   ├── activity_log.py  # Activity logging for dashboard
│   └── scheduled_tasks.py
├── media_library/       # Optional built-in media library app (models, migrations)
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
| Framework | Django | >=5.2,<7.0 |
| API | Django REST Framework | >=3.16,<4 |
| Auth | JWT (PyJWT, own backend; refresh token in httpOnly cookie) | >=2,<3 |
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
    'MEDIA_LIBRARY_ALLOWED_EXTENSIONS': [...],  # images (no SVG), video, audio, documents
    'MEDIA_LIBRARY_MAX_UPLOAD_SIZE': 50 * 1024 * 1024,
    'HTML_SANITIZER': None,
    'TENANT_MODEL': None,
    'PASSWORD_RESET_EXPIRATION_TIME': 10,
    'PASSWORD_RESET_THROTTLE_RATE': '10/hour',  # per IP; None disables it
    'LOGIN_THROTTLE_RATE': '10/min',  # per IP; None disables login throttling
    'REFRESH_COOKIE_SECURE': None,  # None: secure over HTTPS and whenever DEBUG is off
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
poetry run python scripts/test_wrapper.py test          # Run tests
npm test                 # Frontend unit tests (from frontend/)
poetry run python scripts/test_wrapper.py test-verbose  # Run tests with verbose output
poetry run python scripts/test_wrapper.py test-cov      # Run tests with coverage

# Build
poetry run python scripts/test_wrapper.py build         # Quality gate + build
poetry run python scripts/test_wrapper.py publish       # Quality gate + publish
```

See `scripts/test_wrapper.py` for test configuration. These are development
scripts only: they are not package entry points and are not installed with
the wheel.

### Dependencies

- **Python**: Poetry for dependency management
- **Frontend**: npm for dependency management
- **Dev Tools**: black, pytest, pytest-django, vitest + testing-library, eslint, prettier, typescript

CI runs on GitHub Actions (`.github/workflows/ci.yml`): a backend matrix
(Python 3.12–3.14 x Django 5.2/6.0/6.1) with pytest + black, a frontend job
with typecheck + Vitest + build, a dependency audit job (pip-audit on the
locked Python dependencies, `npm audit --omit=dev` on the frontend runtime
dependencies), and a packaging job that builds the wheel and verifies the
compiled assets and translations on a fresh install.

Releases: run the **Release** workflow (`release.yml`) from `main` with the
version (`X.Y.Z` or `X.Y.Z-rc.N`). It requires green CI on `main` and a
`## X.Y.Z (unreleased)` heading in the changelog, sets the version with
`scripts/bump_version.py`, commits, and pushes the tag `vX.Y.Z` (using the
`RELEASE_TOKEN` secret, so the tag triggers other workflows). The **Publish**
workflow (`publish.yml`) then builds the package, publishes it to PyPI
(trusted publishing, environment `pypi`) and creates the GitHub Release.

---

## Public API

The public API is listed in `website/docs/public-api.mdx` and mirrored by
`__all__` in each public module; `tests/test_public_api.py` keeps the two
in sync. Adding, renaming or removing a public name means updating both
(and, from v1, a deprecation period for removals and renames). Everything
not listed is internal: the REST backend (serializers, viewsets, views,
router, permissions, filters, search), `utils`, `checks` (only the check
IDs are public), the login/token backend internals and the helpers in
`admin.py`. Custom widgets, formats, login backends and token backends are
not supported in v1.

---

## Writing Documentation

All user-facing text (the docs website, the README, and the changelog's
voice and terminology) follows the writing style guide in
`website/STYLE.md`: read it before writing or editing documentation. In
short: address the reader as "you", never "we"; Content Studio's interface
is "the admin", the classic one "the classic Django admin"; no stack beyond
Django, no internal API, no roadmap promises, no version history in prose,
no django-blueprint; complete, runnable examples in the shared blog example
project.

---

## Design System

`/design-system` is the admin's visual design system: the brand book
(`README.md`), the tokens (`tokens.json`) and one folder per component in
`frontend/src/components/ui` with guidelines and a live preview. It is
generated from the admin, never edited by hand where the admin is the source:

- Color values in `tokens.json` follow `frontend/src/index.css`; the usage
  notes are written by hand.
- `npm run build:design-system` (in `frontend/`) syncs the colors and
  builds `components/bundle.js` and `bundle.css` (git-ignored).
- A new UI component needs an export in `frontend/design-system/entry.tsx`,
  an entry in `COMPONENTS` in `frontend/design-system/build.mjs`, and a
  `design-system/components/<Name>/` folder with `README.md` and
  `preview.html`. CI runs `npm run build:design-system -- --check`, which
  fails on a missing piece or a color that drifted from `index.css`.

---

## Code Organization

### Model Registration

Models are registered with Content Studio using the `@register` decorator on
a `ModelStudio` subclass. Content Studio keeps its own registry (the site
configured as `ADMIN_SITE`); the classic Django admin's registry is not read:

```python
from content_studio import register
from content_studio.admin import ModelStudio

@register(Article)
class ArticleStudio(ModelStudio):
    table_display = ["title"]
```

The user model is registered automatically with a default studio unless a
project registers its own.

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
- `HTMLField` → `RichTextWidget` (built into Content Studio)
- `TagField` → `TagWidget` (built into Content Studio)
- `BlockField` → `BlockWidget` (built into Content Studio; blocks declare plain model fields and are not models)
- `FlexField` → `JSONSchemaWidget`, `MultipleChoiceField` → `MultiSelectWidget`, `URLPathField` → `URLPathWidget` (built into Content Studio)
- `MediaField` / `ManyMediaField` → media picker widgets (built into the optional `content_studio.media_library` app)

The content fields and base models formerly provided by django-blueprint are merged into Content Studio itself (`content_studio.fields`, `content_studio.models`); django-blueprint is deprecated. Never import the external `blueprint` package.

The mappings live on the `ContentStudioSite` (`default_widget_mapping`, `default_format_mapping`); there are no per-model overrides.

### Form System

Forms are defined using `FormSet`, `FormSetGroup`, `Field` and `Component` classes in `form.py`; table columns use `TableColumn` (field name or studio method, optional header and format).

### Extensions

Content Studio supports extensions for adding custom functionality: `MainMenuLink` and `IFramePage` in `extensions.py` (base class `BaseExtension`, internal).

### Deterministic IDs

Extensions, dashboard widgets and form components derive their IDs deterministically (`utils.derive_uuid`) from the class plus the values returned by `get_id_parts()` — override that method to return the properties that define the object's identity. An explicit `extension_id`, `widget_id` or `component_id` (UUID) takes precedence and disambiguates duplicates — duplicate IDs are reported by the system checks in `checks.py`. Never use `uuid4()` for these IDs, and never let a base class inspect subclass attributes to derive IDs; use `get_id_parts()` overrides instead.

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

- Uses JWT tokens via Content Studio's own token backend (PyJWT; the refresh token lives in an httpOnly cookie)
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
| Writing style guide | `/website/STYLE.md` |
| Design system | `/design-system` (tokens, component guidelines and previews; built by `frontend/design-system/build.mjs`) |

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
# In your admin.py
from content_studio import register
from content_studio.admin import ModelStudio

@register(Article)
class ArticleStudio(ModelStudio):
    table_display = ["title"]
    list_item_display = {"title": "title", "description": "short_content"}
```

### 2. Widget Overrides

```python
from content_studio import widgets
from content_studio.form import Field, FormSet

edit_main = [FormSet(fields=[Field("summary", widget=widgets.TextAreaWidget)])]
```

Only the built-in widgets and formats are supported in v1: the compiled
frontend has no renderer for custom `BaseWidget` / `BaseFormat` subclasses.

### 3. Settings Access

```python
from content_studio.settings import cs_settings

# Access a setting
admin_site = cs_settings.ADMIN_SITE
```

---

## Testing

- Tests are located in `/tests/`
- Uses pytest with pytest-django
- Coverage report generated to `.coverage`
- Test wrapper script in `scripts/test_wrapper.py`

Run tests:
```bash
poetry run python scripts/test_wrapper.py test        # Normal run
poetry run python scripts/test_wrapper.py test-cov    # With coverage
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
3. Optionally configure the table with `table_display` and the list view with `list_item_display`

### Customizing the Dashboard

1. Extend the `ContentStudioSite` class
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
| Run backend tests | `poetry run python scripts/test_wrapper.py test` |
| Run frontend tests | `cd frontend && npm test` |
| Run frontend dev | `cd frontend && npm run dev` |
| Build frontend | `cd frontend && npm run build` |
| Lint frontend | `cd frontend && npm run lint` |
| Format Python | `black .` |
| Format frontend | `cd frontend && prettier --write .` |
| Run docs site | `cd website && npm start` |
| Build docs site | `cd website && npm run build` |
| Build design system | `cd frontend && npm run build:design-system` |
