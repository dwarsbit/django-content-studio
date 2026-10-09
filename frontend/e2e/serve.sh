#!/usr/bin/env bash
# Boots the demo Django project for the e2e suite. Invoked by Playwright's
# webServer (cwd: frontend/); CS_PYTHON can override the interpreter (CI
# passes "poetry run python").
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo"

if [ ! -f content_studio/static/content_studio/assets/index.js ]; then
  echo "No built frontend bundle found; building..."
  (cd frontend && npm run build)
fi

python_cmd="${CS_PYTHON:-python3}"

# Start every e2e run from a clean database so assertions do not depend on
# what earlier runs left behind (pagination pushes old data around).
rm -f demo/db.sqlite3
$python_cmd demo/manage.py migrate --run-syncdb --noinput
$python_cmd demo/manage.py seed_demo
exec $python_cmd demo/manage.py runserver 127.0.0.1:8090 --noreload
