# Django Content Studio — documentation website

The documentation site for [Django Content Studio](https://github.com/dwarsbit/django-content-studio),
built with [Docusaurus](https://docusaurus.io/) and hosted on GitHub Pages at
[dwarsbit.github.io/django-content-studio](https://dwarsbit.github.io/django-content-studio/).

## Development

```bash
cd website
npm install
npm start        # dev server with live reload
npm run build    # production build into website/build
npm run serve    # serve the production build locally
npm run typecheck
```

## Deployment

Deploys are automatic: pushes to `main` that touch `website/**` trigger the
`Website` workflow, which builds the site and publishes it to GitHub Pages.
