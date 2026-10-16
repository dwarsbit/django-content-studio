# Contributing

Thank you for helping improve Django Content Studio. This guide covers the
development setup and how to propose a change.

## Development setup

The backend is a Django app managed with Poetry; the admin's frontend is a
React application in `frontend/`, built into the package's static files.

```bash
git clone https://github.com/dwarsbit/django-content-studio.git
cd django-content-studio

# Backend
poetry install
poetry run pytest

# Frontend
cd frontend
npm install
npm test
npm run dev
```

The `demo/` project runs the admin against example models; see
[demo/README.md](demo/README.md). The documentation website lives in
`website/`; see [website/README.md](website/README.md).

## Proposing a change

1. Fork the repository and create a branch for your change.
2. Make the change, with tests: `poetry run pytest` for the backend,
   `npm test` in `frontend/` for the frontend.
3. Format the code: `black` for Python, `prettier` for the frontend.
4. Update the documentation when behavior changes, following the
   [writing style guide](website/STYLE.md), and add a line to the
   [changelog](CHANGELOG.md).
5. Open a pull request that explains what changed and why.

## Questions and security

Ask questions in [GitHub Discussions](https://github.com/dwarsbit/django-content-studio/discussions).
Report security problems privately, as described in [SECURITY.md](SECURITY.md).
