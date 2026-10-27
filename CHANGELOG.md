# Changelog

## 1.1.0 (unreleased)

- **Read-only fields on the studio.** `readonly_fields` and
  `get_readonly_fields(request, obj=None)` work like the classic Django
  admin's, on studios and inlines: the edit page shows the fields
  without an input, and saving never changes them. The hook receives
  the object (`None` on the create form), so a field can be read-only
  per editor or once the object exists. System check
  `content_studio.E015` reports entries that are not model fields, and
  `content_studio.W002` now also reports required fields in
  `readonly_fields`.
- **Prepopulated fields.** `prepopulated_fields` and
  `get_prepopulated_fields(request, obj=None)` work like the classic
  Django admin's, on studios and inlines: on the create form, a field
  such as a slug follows its source fields until you edit it yourself.
  Existing objects are never prepopulated. System check
  `content_studio.E016` reports misconfigurations. The slug widget now
  drops accents instead of turning them into hyphens.
- **Duplicate warnings for unique fields.** While you type a value in a
  field with `unique=True`, such as a prepopulated slug, the edit page
  checks whether another object already uses it and shows a warning
  under the field that names that object (only if you may view it).
  Saving is not blocked; Django's uniqueness validation still decides.
  Objects in the trash count, and on tenant-scoped models only the
  current tenant's objects are compared. `unique_together` and
  multi-field `UniqueConstraint`s are not checked.
- **Reordering.** Set `reorder_field` to a number field on a studio or
  inline and editors drag rows into their own order in the table view,
  the list view and inlines, with the pointer or the keyboard. A row menu
  moves an object one step up or down, or to the top or the bottom of the
  list, also across pages. `reorder_scope` orders objects within a group (inlines are
  always ordered per parent, tenant-scoped models per tenant), and
  overriding `reorder()` on the studio plugs in any other ordering
  implementation. Reordering needs change permission, is recorded in the
  object's history and is off while the list is sorted by a column or
  searched. System checks `content_studio.E017` and `content_studio.W013`
  report misconfigurations.
- **`ManualOrderModel.reorder()` is scoped and fast.** It renumbers only
  the objects that share the model's new `order_scope` fields, in a single
  update query, instead of saving every object of the model one by one.
- **`Field(readonly=True)` is enforced on save.** The edit page already
  showed these fields without an input; saving now ignores any value
  sent for them as well.
- **Buttons on the edit page.** The new `Button` component runs your
  code for the object being edited: subclass it and implement
  `handle(obj, request)`. It takes a `label`, an `icon`, a `confirm`
  question, a `destructive` style and `allowed_permissions`, and
  `is_visible(obj, request)` hides it per object. The editor sees the
  returned message as a notification; a `ButtonResult` can also carry a
  value shown once in a dialog with a copy button.
- **Buttons in the main menu.** The new `MainMenuButton` extension runs
  your code from the admin's main menu: subclass it and implement
  `handle(request)`. It takes a `label`, an `icon`, a `color` and a
  `confirm` question, and `is_visible(request)` decides who sees and
  runs it. Its result is shown like a `Button`'s.
- **Components in the edit page's header.** `edit_header` on a studio
  places components, such as buttons, next to the save button; on an
  inline studio, in the header of the inline object's editor. System
  check `content_studio.E019` reports entries that are not components.
- **Components work in inline objects' editors.** Links and buttons of an
  inline model's own studio failed in the dialog in which an editor opens
  one of the inline's objects; they now work there, gated by the inline
  studio's permissions.
- **Read-only inlines.** Inlines follow their studio's permissions in the
  admin: without add permission there is no create button, and without
  change permission objects open read-only, deletable only with delete
  permission.
- **A message after creating.** A studio's
  `get_created_result(request, obj)` returns a message or a
  `ButtonResult` the editor sees after creating an object, with a value
  shown once in a dialog with a copy button.
- **The `content_changed` signal.** `content_studio.signals.content_changed`
  is sent after changes made in the admin are committed: creating,
  editing, deleting, restoring and reordering objects, including the
  built-in bulk delete and the media library. One request sends one
  signal with all its changes, each a `Change` with the action, the
  model, the object's pk and label, the tenant, the user and a
  timestamp. Changes that are rolled back are not sent. Custom bulk
  actions record their changes with `record_change`.
- **Webhooks.** The optional `content_studio.webhooks` app sends a
  signed POST request to a URL after changes made in the admin, for
  example to rebuild a static site. A `Webhook` chooses the events, the
  models and the tenant it fires on; one request in the admin makes one
  delivery per webhook, with all its matching changes. Deliveries are
  sent as Django tasks (directly on Django 5.2 without django-tasks),
  stored as `WebhookDelivery` with their outcome, and retried with a
  growing wait by the `content_studio_deliver_webhooks` command.
  Webhooks only reach public addresses over HTTPS and never follow
  redirects, unless the host is in the new `WEBHOOK_ALLOWED_HOSTS`
  setting. The same command removes finished deliveries after
  `WEBHOOK_DELIVERY_RETENTION` days (30 by default). New settings
  `WEBHOOK_MAX_ATTEMPTS` and `WEBHOOK_TIMEOUT`; system check
  `content_studio.E018` reports malformed webhook settings.
- **Media library changes are recorded in the history.** Uploading,
  editing, deleting, cropping and moving media items are logged in the
  activity log, like changes to content, and so are creating, renaming,
  moving and deleting folders. Deleting a folder also records the
  subfolders and media items deleted with it.
- **Bulk deletes are logged with the object's pk.** The built-in bulk
  delete and the media library's bulk delete recorded their history
  entries without the deleted object's pk.

## Unreleased

- **Readable text and visible focus in the admin.** In the light theme,
  supporting text (`muted-foreground`), text on hover fills
  (`accent-foreground`) and the `success` and `warning` colors now meet
  4.5:1 contrast; focus rings are solid and meet 3:1 in both themes. The
  dark theme's active menu item uses the mist palette instead of a stray
  blue.
- **Shadows that were missing now render.** Controls using `shadow-xs`
  (buttons, checkboxes, switches, toggles) and the few that used the bare
  `shadow` or `shadow-2xl` had no shadow at all; the theme now defines
  `shadow-xs` and those controls use the defined scale.

- **No migrations inside the installed package.** The password reset
  app did not pin its primary key type, so a project with
  `DEFAULT_AUTO_FIELD = "django.db.models.AutoField"` got a pending
  migration that `makemigrations` wrote into the installed package. The
  password reset and media library apps now pin it, and a test checks
  the shipped migrations against both settings.

- **`Link` components render.** A `Link` on the edit page showed
  nothing; it is now a text link to the URL from `get_url`, next to the
  `ButtonLink` button.
- **Dashboard widgets keep their display when renamed.** The admin chose
  a widget's display by its `name`, so a subclass with its own name
  disappeared. Built-in widgets now carry a `widget_type` for that, and
  system check `content_studio.W012` reports widgets that are not a
  built-in type.
- **The startup banner only announces newer releases.** It compared
  versions as text and announced older pre-releases as new; releases are
  now compared by version order (`packaging` is a new dependency).

### Security

A security review fixed the following issues in 1.0.0-rc.1 and the
betas. Upgrading is strongly recommended.

- **Dashboard data was readable without signing in.** The dashboard
  widget endpoint set no permission classes and fell back to Django
  REST Framework's default (`AllowAny`, unless the project configured
  `DEFAULT_PERMISSION_CLASSES`): statistics, content lists and the
  activity log were public. It now requires an active staff user, and
  the activity log widget only shows entries on models the user may
  view.
- **Non-staff users could sign in.** Login and token authentication
  only checked `is_active`, so any active account with a password got
  working tokens (what it could see then depended on its model
  permissions). Both now require an active staff user, like the Django
  admin.
- **Tokens outlived a password change.** Access and refresh tokens are
  now bound to the user's password: changing or resetting it signs the
  user out everywhere.
- **Password reset codes could be brute-forced.** Requesting a new code
  reset the failed-attempt count. Attempts now count per email across
  codes, with a one-hour lockout; the endpoints are throttled per IP
  (`PASSWORD_RESET_THROTTLE_RATE`); only active staff users can reset;
  new passwords go through `AUTH_PASSWORD_VALIDATORS`; and an email
  shared by several users no longer causes a server error.
- **Uploads were not checked.** The media library stored any file, so
  an HTML or SVG upload served from the site's domain was stored XSS.
  Uploads are now checked against `MEDIA_LIBRARY_ALLOWED_EXTENSIONS`
  and `MEDIA_LIBRARY_MAX_UPLOAD_SIZE`, and markup is rejected whatever
  its extension.
- **The model schema was public.** The interface's discovery data
  (models, fields, extensions) answered anonymous requests; it now
  requires signing in, and the public sign-in information no longer
  includes the exact version.
- **The refresh cookie could travel over HTTP** behind a
  TLS-terminating proxy. It is now `Secure` whenever `DEBUG` is off
  (`REFRESH_COOKIE_SECURE` forces either value).
- **Password reset mails are Django tasks.** Configure a task backend
  that runs them in a worker and the request only enqueues the mail, so
  its response time no longer reveals which emails belong to an account.
  Without one (or on Django 5.2 without the `django-tasks` backport) the
  mail is sent during the request, as before.
- Signing out clears the interface's cached data, so the next user in
  the same browser does not see the previous user's.
- **List filters could read fields of related models.** A foreign key
  in `list_filter` let a filter continue into the related model, so an
  editor could probe its fields, such as the password hashes of the
  users behind an `author` filter. Filters on a relation now only take
  the relation's own lookups.
- **Content could move to another tenant.** Saving an object could set
  its tenant to any tenant, including ones the editor may not access,
  and creating an object without a selected tenant was allowed. The
  tenant now always comes from the selected tenant and cannot be
  changed, relation pickers only offer the selected tenant's objects,
  and related objects from other tenants are refused.
- **Fields left out of the edit page could still be saved.** Like the
  classic Django admin's form, saving now only writes the fields the
  edit page shows: fields left out through `exclude`, or missing from
  `edit_main` and `edit_sidebar`, keep their value whatever is sent.

- **The media library was readable without permission.** Any staff
  user could browse the media items and folders. Browsing now needs the
  media model's view or change permission, like other content.
- **Password reset codes could be guessed past the attempt limit.**
  Guesses sent at the same time could each be checked before the failed
  attempts were counted, and in projects with `ATOMIC_REQUESTS` a wrong
  code was not counted at all. Attempts are now checked one at a time
  and always counted.
- **Recent activity showed other tenants' changes.** The dashboard's
  `ActivityLogWidget` listed changes to tenant content from every
  tenant. It now only shows changes to objects in the selected tenant;
  deletions of tenant content cannot be placed in a tenant and are no
  longer shown.

### Fixes

- Moving or deleting media items with an invalid item or folder is
  reported as an error instead of failing on the server.
- Editors with change permission but without add permission can use
  relation pickers again.
- Custom user models without a `username` field can be edited.
- Models whose primary key is not called `id` work in the admin.
- Malformed input, such as an invalid id in a bulk action or a
  relation, is reported as an error instead of failing on the server.
- An `ActivityLog` component no longer answers with a server error when
  requested directly.

**Upgrade notes:** only active staff users can sign in from now on;
everyone is signed out once after upgrading (existing tokens carry no
password binding); SVG and other file types outside the allowlist can no
longer be uploaded — extend `MEDIA_LIBRARY_ALLOWED_EXTENSIONS` if you
need them; and run your deployment through the new Security page's
checklist.

- **A defined public API.** The public modules declare `__all__`, and
  the new Public API docs page lists every public name, the studio and
  site hooks, the settings and the system check IDs — the surface that
  semantic versioning covers from 1.0. Everything else is internal.
  Custom widgets, formats, login backends and token backends are
  documented as not supported in v1.

- **The dashboard widget base class is `DashboardWidget`.**
  `content_studio.dashboard.BaseWidget` is renamed, so it no longer
  shares its name with the form widgets' `content_studio.widgets.BaseWidget`.
  Derived widget IDs are unchanged.

- **`list_display` means what it means in the Django admin.** The
  list view's role mapping moves to `list_item_display` (and its hook
  to `get_list_item_display`, returning a `ListItemDisplay`).
  `list_display` is now an alias of `table_display` — a studio ported
  from the classic admin keeps its columns — and system check
  `content_studio.W010` asks to rename it. A mapping in `list_display`
  is reported by `content_studio.E001`, an overridden
  `get_list_display` (no longer called) by `content_studio.W011`.
  The quickstart examples, which configured the table through
  `list_display`, now use `table_display`.

- **Docs, branding and package metadata.** The documentation site
  adopts the mist grayscale and the Content Studio logo; code samples
  use `ContentStudioSite` and `ModelStudio` (the `AdminSite` and
  `ModelAdmin` names they showed do not exist); the setup guide no
  longer claims `django.contrib.admin` must precede `content_studio`
  (it stays installed for the activity log's `LogEntry`). The package
  now ships classifiers, keywords and project URLs.

- **Django 5.2 is the minimum.** Django 5.0 and 5.1 are out of
  support and were no longer tested; the requirement is now
  `Django>=5.2,<7`.

- **No more stray console scripts.** Installing the package no longer
  adds `test`, `test-cov`, `test-verbose`, `build` and `publish`
  commands to the environment; they pointed at development scripts
  that were never part of the package.

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