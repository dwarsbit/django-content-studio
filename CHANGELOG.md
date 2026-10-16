# Changelog

## Unreleased

- **Docs, branding and package metadata.** The documentation site
  adopts the mist grayscale and the Content Studio logo; code samples
  use `ContentStudioSite` and `ModelStudio` (the `AdminSite` and
  `ModelAdmin` names they showed do not exist); the setup guide no
  longer claims `django.contrib.admin` must precede `content_studio`
  (it stays installed for the activity log's `LogEntry`). The package
  now ships classifiers, keywords and project URLs.

- **Django Blueprint is merged in and deprecated.** The content fields
  (`HTMLField`, `TagField`, `FlexField`, `MultipleChoiceField`,
  `URLPathField`, `HashTagField`) and base models (`ContentModel`,
  `SingletonModel`, `SoftDeletableModel` and the other base classes)
  formerly provided by the optional django-blueprint integration now
  ship first-class in Content Studio — `content_studio.fields`,
  `content_studio.models`, `content_studio.managers`,
  `content_studio.sanitizers` and `content_studio.validators` — and are
  always mapped to their dedicated widgets and formats.

- **A built-in media library app.** `content_studio.media_library`
  ships `Media` and `Folder` models with migrations: add the app to
  `INSTALLED_APPS` and point `MEDIA_LIBRARY_MODEL` /
  `MEDIA_LIBRARY_FOLDER_MODEL` at its models. Custom media models keep
  working as before.

- **The HTML sanitizer setting moves to the `CONTENT_STUDIO`
  namespace.** `CONTENT_STUDIO["HTML_SANITIZER"]` (a callable or dotted
  import path) replaces the old `BLUEPRINT["HTML_SANITIZER"]` setting;
  unset, the built-in allowlist sanitizer applies.

- The media library focal point setting is renamed
  `FOCAL_POINT_ATTR` (formerly `FOCUS_POINT_ATTR`), and the built-in
  media library models use the `content_studio_media` and
  `content_studio_folder` tables.

## v1.0.0-rc.1

- 🎉 **The beta era closes.** Twenty-eight pre-releases (beta.1 →
  beta.28) grew Content Studio from an initial prototype into a
  complete alternative to the Django admin: a React interface over a
  generated REST backend, model registration with a widget, filter
  and format system, bulk actions, dashboards, a media library, soft
  delete, JWT authentication, multi-tenancy, internationalization
  and password reset — working with any plain Django model, with or
  without django-blueprint. No per-version backfill: the tag history
  and PyPI releases remain the record for the individual betas; the
  entries below cover everything since beta.28.

- **Media library state joins the remembered-state model.** The
  media library's view, its type and tags filters and its ordering
  are remembered per media model, like the content list's state,
  instead of the URL; the URL keeps only the folder, the search term
  and the page. Remembered values that no longer apply (an unknown
  view or file type) are dropped, and the table's headers expose
  their sort state through aria-sort.
- **List page polish.** Narrowing or re-sorting a list returns to the
  first page instead of stranding the current one; the empty state
  invites creation (permission-checked) and, while a search term or
  filters are active, shows a no-results notice that offers clearing
  them; remembered filters and ordering are validated against the
  current studio configuration so stale values are dropped instead
  of sent; and sortable headers expose their sort state through
  aria-sort with visible focus rings.
- **List filters and ordering move to local storage.** The content
  list's filters and sort are now remembered per content type, like
  the view choice, instead of living in the URL: returning to a
  content type restores them, and the URL keeps only the page and
  the search term.
- **List view sorting.** The list view no longer inherits the table's
  sorting: without a `sortable_by` declaration it always uses the
  studio's default ordering, and with one it gains a select (to the
  left of the view toggle) that sorts by exactly the declared fields,
  with a direction toggle next to it. The table view keeps sorting by
  every sortable column when `sortable_by` is absent and by exactly
  the declared columns otherwise — and the API now enforces the same
  restriction, dropping `ordering` parameters outside `sortable_by`
  instead of applying them.
- **Media library v2.** The library grows from a grid into a full
  list page: grid, list and table views behind a toggle (the table
  with sortable columns for whatever the model carries), type and
  tags filters with any-of semantics (the tags filter a
  searchable select of the tags currently on the library's items),
  and bulk actions — delete
  (confirmed) and move to folder — over a per-page selection. The
  search, filters, view and ordering all live in the URL, so any
  state is deep-linkable; the media API gains the type and tags
  filters, explicit ordering with a stable newest-first default, a
  permission-checked bulk endpoint, and folder item counts. Files
  can be dragged onto the library (per-file progress), and each
  item's context menu offers Copy URL and Download.
- 🐛 **Opening a media item crashed the editor.** The demo's media
  model declared `tags` as a plain character field while the
  interface's tags input expects a list — the item editor failed with
  "e.map is not a function". The demo now models the documented
  contract (a list-typed `tags` field, like Blueprint's `TagField`),
  the docs state the field type explicitly, and an e2e test opens an
  uploaded item so the editor cannot regress silently.
- 🐛 **Saving a media item did nothing.** Integer primary keys
  arrive from the API as JSON numbers while the editor's form schema
  treats ids as strings — the resolver rejected the id and the save
  was silently dropped, because the id has no rendered field to show
  the error. The id is now normalized at the form boundary, and the
  e2e test saves a rename through the dialog.
- **Theme colors only, and new status tokens.** The interface no
  longer uses raw palette colors: every surface rides on the theme's
  tokens, which fixes several dark mode gaps (the FK and date widget
  triggers, selects, menus, the scrollbar, tooltips and overlays now
  flip correctly). The gray scale is redefined on the theme's mauve
  family instead of Tailwind's blue-leaning default, and a `success`
  and a `warning` token join `destructive` — saturated in light mode,
  lightened in dark — carrying the dashboard's trend and status
  colors. A dark mode e2e spec pins the computed colors so raw palette
  values cannot creep back in.
- **Command palette with global search.** ⌘K (or Ctrl K, or the search
  button on the main menu) opens a palette over the whole studio:
  jump to the dashboard, the media library or any model you may view,
  create a new object in any model you may add, open a model's trash,
  switch the theme or log out — entries filter as you type. Typing
  two characters or more also searches objects across every
  registered model with `search_fields`: the same match the model's
  own list view runs, permission- and tenant-scoped, trashed objects
  excluded, capped at five results per model. Picking a result opens
  the object in the editor.
- **Soft delete and the trash.** A model studio can opt into a trash by
  naming the model's nullable timestamp field in `soft_delete`
  (django-blueprint's `SoftDeletableModel` uses `"removed_at"`).
  Deleting then stamps the field instead of removing the row — the
  bulk delete action included, with a confirm message that announces
  the trash instead of claiming the change is irreversible — the
  object disappears from the lists, and the list view links to the
  model's trash — a deep-linkable page at `/content/<model>/trash`
  where trashed objects can be restored (change permission) or
  permanently deleted (delete permission). Restoring is recorded in
  the object's history. Models without the option keep the classic
  hard delete; a misconfigured field is reported by the
  `content_studio.E008` system check.
- **Per-object history.** The activity recorded for an object — its
  additions, changes and deletions, most recent first, with the acting
  user — is available in the edit view through the `ActivityLog` form
  component: opt-in, placed like any component
  (`edit_sidebar = ["published_at", ActivityLog(title="History")]`),
  with a translated default title of "Activity". The entries come
  from the generated API's activity endpoint, gated by view
  permission on the object.
- **Filter controls for every field type on the list view.** A field
  listed in `list_filter` now renders a control that fits the field,
  instead of silently showing nothing for everything but choices:
  boolean fields get a tri-state all/yes/no filter, date and datetime
  fields a range calendar (datetime bounds cover the full picked days),
  integer, decimal and float fields a min/max range, foreign keys a
  searchable select over the related model's objects and many-to-many
  fields a searchable multi-select matching any of the picked objects.
  Choice fields keep the multi-select. Filters live in the URL as
  `filters.<field>[__lookup]` values, so filtered views are
  deep-linkable and survive the back button; everything is plain
  Django — the filtering runs through the generated API's existing
  lookup support, with no new model requirements.
- **Bulk actions on the table view.** Model studios can declare batch
  operations with the `@bulk_action` decorator (`label`, `icon`,
  `confirm`, `allowed_permissions`, `destructive`); the built-in delete
  is offered by default, gated on delete permission, and deletes
  through Django's Collector so deletion signals fire like the classic
  admin. The `actions` attribute selects what is offered (None = delete
  plus every declared action, [] disables them, an explicit list picks
  exactly those names). Selecting rows in the table view shows a bulk
  bar; selection is per page and the actions run through one endpoint,
  permission-filtered per user and tenant-scoped like any list.
  Misconfigurations are reported by the `content_studio.E007` system
  check.
- **The content editor is a route, not a dialog.** Objects open at
  `/content/<model>/<id>`, creation at `/content/<model>/new` and
  singletons on the model's index route — editor URLs are deep-linkable,
  and the browser's back and forward buttons work as expected. Saving
  keeps the editor open (after a create, the route becomes the new
  object's), and leaving with unsaved changes asks for confirmation
  (including reloads, via the browser's own prompt). Inline creation
  stays dialog-based; list state (filters, page, view) is preserved on
  the way back since it lives in the URL.
- **System check `content_studio.W001`:** required model fields missing
  from the edit form are now reported as a warning by `manage.py check`.
  A field counts as required when a save without it would fail validation
  (editable, not nullable, not blank, no default), minus the fields
  Content Studio fills itself (the created/edited stamps and the tenant
  relation) and the user model's password. Required fields dropped
  through `exclude` are reported as well; a warning is issued rather
  than an error because fields can legitimately be filled
  programmatically outside the form.
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