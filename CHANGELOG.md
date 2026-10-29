# Changelog

## 1.3.0 (unreleased)

- **Duplicate (save as new).** A studio with `allow_duplication = True`
  offers Duplicate in the edit page's actions menu. It opens the create
  form filled in with a copy of the object; nothing is saved until the
  editor creates it, so the usual validation runs. Field values, foreign
  keys, media, block fields and plain many-to-many fields are copied. The
  primary key, read-only, excluded and non-editable fields, one-to-one
  fields and files are not. Unique slugs and URL paths get the first free
  number suffix (`spring-sale-2`), within the tenant and counting the
  trash; other unique fields start empty. The objects of the inlines in
  `duplicate_inlines` are copied when the duplicate is saved, which is
  also how a many-to-many field with a through model is copied.
  `get_duplicate_initial(request, obj)` adjusts the copy. Duplicating
  needs add permission and view permission on the object, and is not
  available for singletons. The new object's history records that it was
  duplicated, and `content_changed` reports it as created. System checks
  `content_studio.E021` (a `duplicate_inlines` entry that is not in
  `inlines`) and `content_studio.W014` (duplication options without
  effect) report misconfiguration.
- **Export.** A studio with `export_fields` (the columns, like
  `table_display`) or `allow_export = True` (the `table_display` columns)
  offers Export in the list page's toolbar. It downloads every object
  that matches the current search and filters, on all pages, in the
  current order; in the trash, it downloads the trash. The built-in
  Export bulk action, next to Delete, downloads the selected objects
  only. Exports are CSV files, streamed; with the new `excel` extra
  (`pip install "django-content-studio[excel]"`, which installs openpyxl)
  Excel files (`.xlsx`) are offered as well. Headers are the capitalized
  verbose names (or the `TableColumn` header); cells hold the displayed
  values: choice labels, the names of related objects, dates in ISO
  format, Yes or No, rich text without markup. Exporting needs view
  permission and respects the tenant, the trash and `exclude`. Values
  starting with `=`, `+`, `-` or `@` get a leading apostrophe against
  formula injection. Not available for singletons. `"export"` names the
  built-in in an explicit `actions` list. System checks
  `content_studio.E022` (`export_fields` entries that do not resolve) and
  `content_studio.W015` (export options without effect) report
  misconfiguration; `content_studio.E007` also reports a `@bulk_action`
  named `export` that shadows the built-in, and `"export"` in `actions`
  without export.
- **Duplicate warnings for combinations of fields.** The duplicate warning
  on the edit page now also covers `Meta.unique_together` and
  `UniqueConstraint`s over several fields. When the combination of values
  in the form matches another object, the warning shows under the field
  of the combination you edited last and names the other fields. Like the
  warning for unique fields, it is scoped to the tenant, counts objects in
  the trash, leaves out the object you are editing and never blocks
  saving. A constraint's `condition` is applied to both objects; a tenant
  field in the combination is left out, because only objects of the
  current tenant are compared. Functional and deferrable constraints are
  not checked, and an empty value only clashes when the constraint sets
  `nulls_distinct=False` and the database supports it.

- **Presence.** The edit page's header shows the avatars of the other
  editors who have the object open, with a tooltip naming each and
  whether they are viewing or editing it (their form has unsaved
  changes); an editing editor's avatar gets a ring in the warning color.
  The table view and the list view mark the rows of objects someone else
  has open. The admin sends a heartbeat about every 15 seconds while an
  edit page is visible and pauses while the tab is hidden; the list page
  asks for its visible page in one request on the same interval. Leaving
  the page removes the editor; otherwise the entry expires after 45
  seconds. Editors only see presence for objects they may view, within
  the tenant for tenant-scoped models; trashed objects and inlines have
  none. Presence is kept in Django's cache: on by default, turned off
  everywhere with the `PRESENCE` setting or per studio with
  `presence = False`, and stored in the cache named by `PRESENCE_CACHE`
  (default `"default"`). It locks nothing and checks nothing on save.
  System checks `content_studio.E023` (a `PRESENCE_CACHE` that is not in
  `CACHES`), `content_studio.W016` (a `DummyCache`) and, with
  `manage.py check --deploy`, `content_studio.W017` (a per-process
  `LocMemCache`) report caches presence cannot work with. A new
  `UserAvatar` component in the design system shows editors in the user
  menu, the activity logs and presence.
- **Throttles ignore a spoofed `X-Forwarded-For`.** The login and
  password reset limits used the `X-Forwarded-For` header as the client's
  address when Django REST Framework's `NUM_PROXIES` was unset (the
  default), so a client sending a different header with every request was
  never limited. Without `NUM_PROXIES`, they now count per connection
  address (`REMOTE_ADDR`) and ignore the header; with `NUM_PROXIES` set,
  the address the proxies add is used as before. Behind a proxy, set
  `NUM_PROXIES`, or all clients share the proxy's limit.
- **A remembered tenant you can no longer access is replaced.** The
  admin remembers the selected tenant in the browser. When that tenant
  was no longer yours (access revoked, or another user signed in on the
  same browser), every page failed with a permission error until you
  picked another tenant. The admin now checks the remembered tenant
  against your tenants before loading anything and otherwise opens the
  first one. Signing out forgets the selected tenant.

### Security

- **Logging out did not end the session on the server.** Sessions were
  only checked for their signature and expiry: after logging out, a copy
  of the session cookie still renewed the session, a renewed cookie left
  the previous one working, and every renewal granted another week, so
  one copied cookie gave access for as long as it was used. Logging out
  now ends the session on the server, a renewal invalidates the previous
  cookie, and a cookie presented again after its renewal ends the whole
  session. A session now also ends 30 days after logging in, however
  active (the new `MAX_SESSION_LIFETIME` setting; `None` turns it off).
  Ended sessions are recorded in the cache named by the new `TOKEN_CACHE`
  setting (default `"default"`), which must be shared across worker
  processes and servers. Sessions started before the upgrade continue and
  their 30 days count from their last renewal.

- **Relation pickers could search password hashes.** When the related
  model's studio had no `search_fields`, such as the default user
  studio, a relation picker searched every `CharField` of the related
  model, including the user model's `password`. An editor who could view
  users could recover a user's password hash piece by piece. Relation
  pickers now only search the related studio's `search_fields`; without
  them, the picker lists all objects but a search term matches nothing.
  Set `search_fields` on the related model's studio to make its picker
  searchable.

- **The login page's return path could leave the admin.** After
  signing in, the admin went to the path in the login page's `redirect`
  parameter without checking it. With the admin mounted at the site
  root, a crafted link sent a user who signed in to another site
  (`//evil.example`) or ran script in the admin (`javascript:`). The
  admin now only returns to one of its own pages and otherwise opens the
  dashboard; the return path also keeps the page's query string.

- **A media folder could be moved into itself.** Changing a folder's
  parent accepted the folder itself or one of its subfolders, which made
  the folder part of a cycle: it disappeared from the media library's
  folder tree, and deleting it cascaded through the cycle. Moving a
  folder into itself or its subfolders is now rejected with a validation
  error.

- **Inline lists could include a hidden parent's objects.** The inline
  list endpoint checked view permission on one parent but filtered on
  every parent in the request: repeating the parent filter
  (`?article=<hidden>&article=<visible>`) listed the hidden parent's
  inline objects too. Inline lists now take exactly one plain parent
  value and filter on the parent they checked; repeated or
  comma-separated values, lookups and exclusions on the parent field
  are rejected with a 400.

- **Inline objects respect their parent's permissions.** Only the
  inline's list checked that the editor may view the parent object, so
  an editor who could not see an object could still open, edit and
  delete its inline objects, and read their history. Every action on an
  inline object now requires view permission on its parent, including a
  `has_view_permission(request, obj)` that denies that one object.

- **Inline lists showed other tenants' objects.** An inline list looked
  up its parent object without the tenant, so an editor who passed the
  id of another tenant's object got that object's inline rows. The
  parent is now looked up within the selected tenant and outside the
  trash, like the parent's own edit page.

- **A rejected retry could refresh the session in a loop.** When a
  request ran into a 401, the admin refreshed the access token and
  retried the request, but did not recognize the retry as one. If the
  retry ran into a 401 as well, for example behind a proxy that strips
  the `Authorization` header, the admin refreshed and retried again for
  as long as the refresh succeeded, issuing a new refresh token every
  time. The admin now retries a request once; a second 401 ends the
  request with the error.

## 1.2.0 (unreleased)

- **The app shell and the main menu.** Every page shares one header: the
  title on the left, the page's actions on the right and, where a page
  has them, a toolbar row underneath. The main menu sits flush against
  the page, lists the model groups as headings with their models visible,
  and becomes a rail of icons when collapsed or on narrow screens. Icons
  are in the gray family; the `color` of a `ModelGroup` or a
  `MainMenuLink` is no longer shown. `ModelGroup(collapsed=True)` starts
  a group collapsed; the group of the current model always opens.
- **Tables.** The list page's table, inlines and the media library's
  table share one shape: a 40px header on the gray family with
  capitalized labels, 44px rows with a 16px gutter, the object's name
  as the only medium-weight column, numbers right-aligned in tabular
  figures, selected rows on `accent`. Booleans show a check or a dash
  in the text color instead of green and red circles; a user column
  shows the avatar with the name instead of the avatar alone. The media
  library's table uses the admin's checkboxes.
- **The list page.** Search and filters sit in a toolbar under the page
  header; a filter reads "Status is Published" once set, with an inline
  clear. Selecting rows shows a floating bar with the bulk actions
  instead of replacing the filters, in the list view as well as the
  table. The footer counts the objects and the pages; the empty states
  show an icon with the invitation to create or to clear the filters.
  A model with a trash gets "All" and "Trash" tabs under its title,
  with the number of objects in the trash, instead of a Trash button.
- **The edit page.** Form groups and inlines switch through line tabs
  instead of the pill list. Form sets are cards with a small header
  row; labels are capitalized, required fields carry a mark, help text
  sits under the control, read-only fields render as a dashed box, and
  a checkbox field shows its help text under its label. The header says
  "Unsaved changes" while the form is dirty. Inlines sit in a card with
  the title, the count and the add button in its header. The media
  picker is a row with the file, its type and size, and replace and
  remove buttons, instead of a large preview with buttons on hover.
- **The media library.** Folders are a tree on the left, with their
  counts, nested folders behind carets and "New folder" at its foot; a
  breadcrumb above the files repeats the path. Files are cards with the
  thumbnail, or the type icon and extension, on the gray family; a
  checkbox on hover selects a card or a list row for the floating bulk
  bar (move, delete), and a more button holds the file's actions. A
  file opens in a sheet from the right with its preview, Copy URL,
  Download and Move, the name, alt text and tags, and Delete in the
  footer; crop and focal point open in their own dialog from the sheet.
  An empty folder is a dashed drop zone inviting the first upload. The
  media picker in the editor shares the tree and the cards.
- **The dashboard.** The greeting is the page's title, with today's
  date under it. Every widget shares one card anatomy: a header row
  with the title, a muted description and, for a content list of one
  model, "View all"; rows separated by hairlines. The statistic shows
  its trend as a signed percentage colored by sentiment (a negative
  trend is shown too); the activity log shows an avatar, the editor,
  the action and the object with the model and the time under it; a
  scheduled task's status is a badge with a dot, or a spinner while it
  runs. Wide widgets fill the row instead of overflowing it on narrow
  screens.
- **Buttons** are lower and wider: 32px high with 14px of horizontal
  padding (`sm` 28px, `xs` 24px, `lg` 36px, icon buttons 32px), so they
  line up with the toolbar's controls.

- **`FlexField` shows its inputs.** The edit page never received the
  field's schema, so a `FlexField` showed a warning instead of an input
  per property. Inputs are labeled with the property's `title`, or its
  name when it has none.

## 1.1.0 (2026-10-27)

- **Block fields.** `BlockField` stores an ordered list of content
  blocks that editors add (also between two blocks), reorder by dragging
  or with the keyboard, duplicate and remove in the admin, to
  build a page body from predefined blocks such as text and images.
  Define a block as a `Block` subclass with plain model fields, which
  pick the widgets and validate the block's data; blocks are not models
  and need no migrations. `max_num` and `min_num` limit the number of
  blocks, relations in blocks (such as `MediaField`) are stored as
  primary keys and scoped to the tenant, and HTML in blocks is sanitized
  on save. In templates, `{% render_blocks page.sections %}` (from the
  `content_studio` template library) renders each block with its own
  template, with related objects loaded in one query per model. A block
  can have block fields of its own, one level deep, for layouts such as
  columns; editors drag blocks between those lists and the page's own.
  System check `content_studio.E018` reports misconfigured block fields.
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
- **Webhooks in the admin.** The webhooks app registers its own studio:
  editors create webhooks, choosing events and models from lists, and
  copy the secret, which is shown once after creating and after
  **Regenerate secret**. **Trigger now** sends a request without changes
  (event `webhook.triggered`) and reports how the webhook responded. Each
  webhook shows its delivery log, read-only, with **Retry** on failed
  deliveries for one more attempt. Unsafe URLs are refused on save, and
  changes to webhooks themselves never trigger a webhook.
- **A deploy button and a webhooks widget.** `DeployButton`, a
  `MainMenuButton`, triggers the active webhooks (or the ones named in
  `webhooks`) from the main menu, for editors who may change webhooks;
  with multi-tenancy, the current tenant's and the global ones.
  `WebhookDeliveriesWidget` shows each webhook's latest delivery on the
  dashboard. Neither is added to the site by itself.
- **The scheduled tasks widget shows missing values and errors properly.**
  Tasks without a last run, a duration or a next run showed "null" or
  an invalid date; those values are now left out. A failed task shows
  its `error_message`, and the widget no longer depends on another
  widget to format its times.
- **`MultipleChoiceField` shows its options.** The admin's multi-select
  for a `MultipleChoiceField` had no options to choose from: the field's
  `options` were never sent to the admin.
- **Excluded fields stay out of the admin.** Fields in a studio's
  `exclude` are no longer sent to the admin read-only: they are left out
  of the edit page's data entirely.
- **Buttons in the main menu.** The new `MainMenuButton` extension runs
  your code from the admin's main menu: subclass it and implement
  `handle(request)`. It takes a `label`, an `icon`, a `color`, a
  `weight` and a `confirm` question, and `is_visible(request)` decides
  who sees and runs it. Its result is shown like a `Button`'s.
- **Components in the edit page's header.** `edit_header` on a studio
  places components, such as buttons, next to the save button; on an
  inline studio, in the header of the inline object's editor. System
  check `content_studio.E020` reports entries that are not components.
- **`MainMenuLink(weight=...)` orders the menu.** The weight was accepted
  but ignored; the main menu now orders its links and buttons by weight,
  lowest first, keeping equal weights in the order of `extensions`.
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
  `content_studio.E019` reports malformed webhook settings.
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
