# Changelog

## Unreleased

- ⚠️ **Breaking:** Content Studio now ships its own JSON Web Token backend
  and no longer depends on `djangorestframework-simplejwt`. All token
  configuration lives in the `CONTENT_STUDIO` namespace, so projects that
  use simplejwt for their own API no longer share global JWT settings with
  the admin.
- ⚠️ **Breaking:** the login response returns `{"access": ...}` only. The
  refresh token moved to an httpOnly, `SameSite=Lax` cookie scoped to the
  token endpoints and never reaches the browser; sessions restore silently
  on reload, a 401 triggers one shared refresh with a retry, and logout
  clears the cookie server-side. Outstanding sessions invalidate once.
- 🔐 New settings: `TOKEN_BACKEND`, `TOKEN_LIFETIME` (default one hour),
  `REFRESH_TOKEN_LIFETIME` (default seven days), `TOKEN_SIGNING_KEY`
  (default the Django `SECRET_KEY`) and `TOKEN_ALGORITHM` (default HS256).
- 🐛 The frontend previously sent an `Authorization: JWT` header prefix,
  which simplejwt's default configuration rejects; requests now send the
  standard `Bearer` prefix.

## v1.0.0-beta.1
Initial pre-release! 🎉