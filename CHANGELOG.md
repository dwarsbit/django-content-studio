# Changelog

## Unreleased

- **Table columns:** `table_display` accepts `TableColumn` objects
  alongside field names — `TableColumn(field, header, format)` sets a
  custom column header, an explicit format, and references studio
  methods (`(obj, request)` returning a JSON-safe value) for computed
  columns. Method columns render through `TextFormat` when no format
  is set, cannot be sorted (ordering is now restricted to real model
  fields — ordering by `__str__` previously raised a server error),
  and misconfiguration is reported by the `content_studio.E006`
  system check.
- ⚠️ **Breaking:** Content Studio no longer inherits from Django's
  `ModelAdmin` and `AdminSite`. The configuration classes are now
  `ModelStudio` and `ContentStudioSite` (`InlineModelStudio` for
  inlines), implementing only the surface the studio actually uses:
  list, edit, relation display and permission options. The permission
  hooks are uniform (`has_*_permission(self, request, obj=None)`), the
  `check()` workaround is gone and configuration errors surface as
  Django system checks (`content_studio.E001`–`E005`, reported by
  `manage.py check`).
- ⚠️ **Breaking:** Content Studio keeps its own registry. Models
  registered only with the classic Django admin no longer appear in the
  studio — register them with `content_studio.register`. The user model
  is registered automatically with a default studio when no custom one
  is registered.
- ⚠️ **Breaking:** `content_studio.display` (the alias of Django's
  `@display`) is removed. The admin payload no longer carries column
  labels or `empty_value` metadata; table columns render raw values
  until the upcoming display API.
- ⚠️ **Breaking:** `ModelStudio` no longer supports per-model
  `widget_mapping` and `format_mapping`. Widget and format choices live
  on the `ContentStudioSite` (`default_widget_mapping` /
  `default_format_mapping`); a dedicated override API will follow.
- The site's identity defaults (`site_header`, `site_title`) now say
  "Content Studio" instead of Django's administration defaults.
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