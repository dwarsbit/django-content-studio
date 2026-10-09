# Content Studio demo project

A small Django project used by the Playwright e2e suite and handy for manual
testing. It mirrors the documented install: `content_studio` mounted under
`admin/`, plain Django models registered with `@register`, a custom media
library model, a singleton, an inline, and a small dashboard.

django-blueprint is **not** required. When it is installed in the environment,
one extra Blueprint-integrated model (`LandingPage`, with an `HTMLField`)
registers itself so the optional integration is covered too.

## Run it

```bash
# from the repository root, with the project's dependencies installed
python demo/manage.py migrate --run-syncdb
python demo/manage.py seed_demo
python demo/manage.py runserver
```

Then open http://127.0.0.1:8000/admin/ and log in with **admin / admin1234**.

The demo app ships no migrations on purpose: the Blueprint-integrated model
only exists when django-blueprint is installed, and `--run-syncdb` builds the
tables straight from the current models either way. For the same reason the
seed command is idempotent.

## E2E

The e2e suite (in `frontend/e2e/`) starts this project automatically with the
**built** frontend bundle — the same static files users get from PyPI — see
`frontend/playwright.config.ts`.
