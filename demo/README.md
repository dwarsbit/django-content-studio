# Content Studio demo project

A small Django project used by the Playwright e2e suite and handy for manual
testing. It mirrors the documented install: `content_studio` mounted under
`admin/`, plain Django models registered with `@register`, a custom media
library model, a singleton, an inline, and a small dashboard. One model
(`LandingPage`) is built on the built-in `HTMLField`, so the rich text
widget is covered too.

## Run it

```bash
# from the repository root, with the project's dependencies installed
python demo/manage.py migrate --run-syncdb
python demo/manage.py seed_demo
python demo/manage.py runserver
```

Then open http://127.0.0.1:8000/admin/ and log in with **admin / admin1234**.

## Showcase data

For screenshots and demos, seed a complete, realistic site instead: a
made-up travel and design magazine, "Northbound", with a team of five
editors, fifteen articles with cover images, colored categories, reader
reviews, a landing page built from blocks, an activity log and unread
notifications.

```bash
python demo/manage.py migrate --run-syncdb
python demo/manage.py seed_demo --showcase
python demo/manage.py runserver
```

Log in with **admin / admin1234** (every showcase user shares that
password). `--showcase` replaces the demo's content, so run it on a fresh
database, and needs Pillow (`poetry install --all-extras`). The images are
drawn by `demo/blog/showcase/images.py` when you seed, so they are free to
use anywhere; the people, the magazine and its stories are fictional.

The demo app ships no migrations on purpose: `--run-syncdb` builds the
tables straight from the current models. For the same reason the
seed command is idempotent.

## E2E

The e2e suite (in `frontend/e2e/`) starts this project automatically with the
**built** frontend bundle — the same static files users get from PyPI — see
`frontend/playwright.config.ts`.
