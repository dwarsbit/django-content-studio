# Design plan: shell, menu, list, edit, media library, dashboard

The basis of the admin is good: one mist family, one typeface, calm
surfaces. This plan keeps the tokens and the ShadCN components and
tightens the six areas that editors spend their time in. The prototypes
next to this file show the proposal with the admin's own components, so
the merge is a move of markup, not a rewrite.

Run them with `npm run dev:prototypes` (in `frontend/`), or open the
published build. The "Prototype controls" panel switches screens,
themes and the variants that are still open for discussion.

## Direction

Content Studio is a hybrid: the density and generality of an admin
(any model, tables, filters, bulk actions) with the care of a CMS
(an editor that puts the content first). The design follows from that:

- **One frame for every page.** A 56px page header with the title on
  the left and the actions on the right, an optional toolbar row under
  it, and a scrolling body capped at 1280px. Today every page builds its
  own header at a different height and gutter.
- **Mist first.** Status colors (`success`, `warning`, `destructive`)
  only appear next to a word. Everything else is the gray family: menu
  icons, avatars, booleans, file types. The tinted icons and the
  indigo/emerald avatar in the menu, the green/red boolean checks and
  the blue/amber/pink/emerald file type badges all leave.
- **Sentence case, capitalized.** Django's `verbose_name` is lowercase
  ("articles", "published at"); the admin shows it capitalized
  everywhere (`first-letter:uppercase` on titles, labels, menu items
  and column headers), as the classic admin does.
- **Density where it counts.** Tables and lists get tighter rows (44px)
  and a 16px gutter; forms keep their room (20px between fields).
- **State does not move the page.** Selecting rows shows a floating
  bulk bar instead of swapping the toolbar; filters stay where they are.

## What the audit found

- **App shell**: the list page uses `pr-8 pl-4` and no header border, the
  media library a full-bleed header with a border, the editor a
  breadcrumb header, the dashboard `px-9 pt-16`. Four gutters, four
  header heights. The sidebar is a floating card inside 16px of padding.
- **Main menu**: colored icon chips (blue, pink, slate) and an indigo
  avatar with an emerald "online" dot break the no-hue rule. Group
  labels are collapsible items that look like links. The search field
  looks like an input but opens the palette. `COLORS` maps `mist`,
  `mauve`, `olive` and `taupe` to classes that do not exist in the theme.
- **List view**: lowercase title ("articles"), filter chips at a
  different height than the search input, the view toggle is a
  hand-made control, the bulk bar replaces the filter row (layout
  shift), booleans are green/red circles, numbers are left-aligned, the
  table pads the first column 32px and sets it semibold, no result count.
- **Edit view**: a pill Save button unlike every other button, full-width
  pill tabs for sections and inlines ("General | reviews"), a 24px
  formset title above 13px fields, lowercase labels, the sidebar as
  another bordered card with the same weight as the main column, the
  "Create" button of an inline centered under the table.
- **Media library**: no empty state (0 items shows nothing), the folder
  panel is a 320px list with ".." navigation instead of a tree, the
  breadcrumb is a bare home icon, no selection in the grid (bulk actions
  need the table view), colored type badges on every card.
- **Dashboard**: 64px of top padding, the statistic card is mostly
  empty space, widgets have no shared header anatomy, the activity rows
  mix two text sizes and weights.

## The proposal, per area

### App shell

- `PageHeader` (56px, `border-b`): back button, icon in a 28px mist
  tile, title (`body-large`, semibold, capitalized), inline meta (a
  count, a status badge), actions on the right. Exactly one primary
  button per page.
- `Toolbar`: a row under the header for search, filter chips, sort and
  the view toggle, all at `h-8`. `ml-auto` pushes the view controls right.
- `PageBody`: the scroll container, `max-w-[1280px] mx-auto px-6 py-6`.
- The sidebar sits flush left with a hairline (`border-r
border-sidebar-border`) on `bg-sidebar`; the floating card stays
  available as a variant to compare (control "Sidebar style").
- The multi-tenant banner stays above the page header.

Files: `pages/(studio)/layout.tsx`, a new `components/page-header.tsx`
(PageHeader, Toolbar, PageBody), then each page adopts them.

### Main menu

- Header row at 56px, aligned with the page header: logo mark and site
  name, or the tenant switch (avatar, name, "Tenant", up/down caret).
  A sidebar icon collapses the menu; collapsed, the logo mark expands it.
- Search is a real-looking trigger (`h-8`, border, `⌘K` kbd) that opens
  the palette; collapsed it becomes an icon item.
- Items: 32px, icon 16px in `muted-foreground`, label 13px medium in
  `sidebar-foreground/70`; active: `bg-sidebar-accent`, text and icon in
  the foreground color. No icon chips.
- Model groups are section headings (12px, muted, with a caret on hover
  to collapse) with the models listed under them, so every model is one
  click away. A group can be configured to start collapsed; the group
  holding the current model is always expanded.
- Collapsed: a 56px rail with a separator per group and tooltips.
- User menu: mist avatar (`secondary`), name and username, up/down
  caret; the dropdown keeps the theme toggle, log out and the version.
  The "online" dot goes.
- The studio's `color` option on `MainMenuLink` and groups is no longer
  rendered: icons are mist. The option stays accepted; `COLORS` and its
  four unknown colors go.

Files: `pages/(studio)/_components/main-menu.tsx`, `tenant-selector.tsx`.

### List view

- Header: capitalized title, count in muted tabular figures, "Create"
  primary with a plus. Under it, scope tabs when the model has a trash:
  "All articles" and "Trash" with its count; the trash page is the
  second tab.
- Toolbar: search with a magnifier addon (`InputGroup`), filter chips
  that read "Status is Published" with an inline clear when active,
  "Clear filters" ghost when any filter is set, sort menu (list view),
  `ToggleGroup` for table/list.
- Table: header `bg-muted/60` at 40px, rows 44px, 16px gutter, title
  column medium (not semibold), numbers right-aligned and tabular,
  booleans as a check or a muted dash in the text color, dates muted,
  foreign keys as avatar plus name, selected rows on `accent`, sortable
  headers show a caret on hover. These become the defaults of
  `ui/table.tsx` rather than overrides.
- List (rows) view: title, excerpt, date and the meta badge; a checkbox
  appears on hover so bulk actions work here too.
- Bulk bar: a floating pill above the bottom edge ("2 articles selected
  · Publish · Delete · ×") on `popover` with `shadow-xl`; the toolbar
  stays.
- Footer: "1–8 of 128 articles" on the left, pagination on the right
  (ghost 32px buttons, arrows instead of carets).
- Empty states inside the card: mist icon tile, title, one sentence,
  the action. Filtered: "No results", clear filters.
- Status choices: a secondary badge with a dot (`success` for published,
  `warning` for review, muted for draft). The dot colors need a
  studio-side hint (such as a `status_colors` map on a choice field or a
  format option); until then the plain secondary badge stays.

Files: `pages/(studio)/content/[model]/page.tsx` and `_components/*`,
`ui/table.tsx`, `formats/boolean-format.tsx`, `formats/choice-format.tsx`.

### Edit view

- Header: back arrow, breadcrumb "Articles / Hello, Content Studio"
  (parent muted, current semibold, truncated), status badge, then
  "Edited 2 days ago by Eva" or an "Unsaved changes" indicator with a
  warning dot, "Preview" (when the studio offers one), the more menu
  (duplicate, history, move to trash) and a regular "Save" button.
- Line tabs (underline, left-aligned, a count badge for inlines)
  replace the full-width pill tabs. A `variant="line"` on `ui/tabs.tsx`.
- Form set card: 13px semibold title with a 12px description in a
  header row with a hairline, fields in `p-5 space-y-5`. Labels 13px
  medium, capitalized; hints 12px muted below the control. Required
  fields get a muted asterisk. Read-only fields render as a dashed,
  muted box instead of a disabled input.
- Sidebar (300px): the same cards, no titles for the metadata set;
  checkbox fields as a label with a description; the activity log as a
  list with avatars.
- Inlines: the table inside a card with a header row that holds the
  title, the description and the "Add" button; the drag handle and row
  menu stay. Rows open the dialog editor as today.
- The rich text widget: toolbar in a bordered box that shares the
  focus ring with the content, 13px body at `leading-relaxed`.
- Widgets that look like plain inputs today get a quieter shape:
  the slug with a path prefix addon, media pickers as a row with the
  thumbnail, name, size and "Replace / Remove", many-to-many as chips
  inside the control.

Files: `components/content-editor/header.tsx`, `main.tsx`, `aside.tsx`,
`form-set.tsx`, `form-field.tsx`, `inline.tsx`, `ui/tabs.tsx`, and the
widgets named above.

### Media library

- Header: "Media library", file count, "New folder" outline, "Upload"
  primary. Toolbar: search, Type and Tags chips, grid/list/table toggle.
- A folder tree on the left (208px): "All files" root, folders with
  counts, nested folders with carets, "New folder" at the bottom. The
  breadcrumb above the grid repeats the path and shows the count.
- Grid cards: 4:3 image on `muted`, name 13px medium, "PNG · 1.2 MB"
  muted; a checkbox and a more button appear on hover (the checkbox
  stays when selected); selected cards get the ring. Files without a
  thumbnail show the type icon and the extension in mist.
- List and table views share the row anatomy of the content list.
- The same floating bulk bar: Move, Download, Delete.
- Details open in a sheet from the right: preview, Copy URL / Download
  / Move, name, alt text, tags, a definition list of type, size,
  dimensions, upload date and folder, and Delete at the bottom left of
  the footer. Crop and focal point stay in the dialog they have today
  (not prototyped); the sheet can open it.
- Empty state in a dashed drop zone: "No files yet", the accepted
  types and size, an Upload button. Dragging files over the page shows
  the same dashed frame.

Files: `pages/(studio)/media-library/[model]/page.tsx` and
`_components/*`, `components/media-library/folders.tsx`,
`folder-path.tsx`, `item-card.tsx`, `item-edit.tsx`.

### Dashboard

- No page header: the greeting is the title (`display`, with the wave),
  with a muted line below it for the date and one fact ("2 articles
  waiting for review").
- Widget anatomy shared by every widget: card, header row (13px
  semibold title, 12px muted description, optional "View all" on the
  right), rows at `px-4 py-2.5` separated by hairlines, hover on rows
  that link.
- Statistic: label, 28px tabular value, trend as an icon plus words
  ("+12% this month") in `success` or `destructive` by sentiment.
- Activity: 28px avatar, "Eva changed A quiet week…" with the object as
  a link, model and time muted below.
- Scheduled tasks: title and schedule, status badge with a dot or a
  spinner, meta line with last run, duration and next run, the error in
  `destructive`.
- Grid: four columns at `xl`, two at `md`, `gap-4`; widgets keep their
  `col_span`.

Files: `pages/(studio)/(dashboard)/page.tsx` and `_components/*`.

## What the prototypes cover

- The app shell and main menu, expanded, collapsed and as the rail below
  1024px; single site and multi-tenant (the tenant switch and the
  shared-model banner); a group that starts collapsed.
- The content list as a table and as rows, with live filter chips,
  selection and the bulk bar, filtered and empty states, and the scope
  tabs to the trash.
- The trash: restore per row or in bulk, delete permanently, empty
  trash, empty state.
- The edit page, the create form (empty fields, "Create", no inlines
  yet) and the inline row editor in a dialog, with the sidebar stacked
  under the form below 1024px.
- The media library as a grid, a list and a table, with folders (a
  chip replaces the tree below 768px), type and tag filters, selection,
  the details sheet and the empty drop zone.
- The dashboard with every widget type.
- Light and dark, at 1440px and 900px.

## Shared pieces the prototypes introduce

`prototypes/components.tsx` holds the candidates for `src/components`:
PageHeader, Toolbar, PageBody, SearchInput, FilterChip, ViewToggle,
BulkBar, EmptyState, StatusBadge, BoolMark, UserAvatar, LineTabs,
Field, FormSetCard, Kbd. Each is written against the real primitives.

## Merge sequence

Each step is one pull request that leaves the admin working; the e2e
suite (`frontend/e2e`) runs on every step, and its selectors ("Table
view", "Create", "Sign in") are adjusted where labels change.

1. **Shell and menu.** `PageHeader`, `Toolbar`, `PageBody`; the sidebar
   flush with a hairline; the new main menu (sections, mist icons, user
   menu). Every page gets the header without other changes yet.
2. **Table and formats.** New defaults in `ui/table.tsx`, the boolean
   mark, the dot on choice badges, capitalized labels. This touches the
   content list, inlines and the media table at once.
3. **List view.** Toolbar, filter chips, floating bulk bar, footer with
   the count, empty states, list rows with hover checkboxes.
4. **Edit view.** Header, line tabs, form set cards, labels and hints,
   sidebar, inline header, the widget shapes.
5. **Media library.** Folder tree, grid cards with selection, the
   details sheet, empty state and drop zone.
6. **Dashboard.** Widget anatomy, statistic, activity and tasks.
7. **Design system.** Regenerate `design-system/` (`npm run
build:design-system`), update the README's layout paragraph, add the
   new components (PageHeader, EmptyState, BulkBar, LineTabs) with
   READMEs and previews, and add a changelog entry.

Strings that are new (counts, "Clear filters", "Unsaved changes",
"No files yet", "View all") go into the English and Dutch locales.

## Decisions

Taken on the first round of prototypes:

1. **Sidebar**: flush left with a hairline. The floating card is gone.
2. **Menu icons**: mist only. The studio's `color` option is no longer
   rendered by the main menu (it stays accepted, for compatibility).
3. **Menu groups**: section headings with every model visible, plus a
   studio option to start a group collapsed (`collapsed=True` on the
   group; the active model's group always opens).
4. **Bulk bar**: the floating pill.
5. **Status badges**: plain secondary badges first; how a studio hints
   the dot color is decided separately.
6. **Media details**: the sheet, with crop and focal point in their
   dialog.
7. **Buttons**: lower and wider. `default` 32px high with 14px
   horizontal padding (was 36px and 10px), `sm` 28px and 12px, `xs`
   24px and 10px, `lg` 36px and 18px, `icon` 32px. The prototypes apply
   these through `prototypes.css`; the merge changes `ui/button.tsx`.
8. **Trash**: not a button next to "Create" (it is a place, not an
   action). The list page gets scope tabs under its title, "All
   articles" and "Trash" with the count, which also hold the trash
   page. The same row can later carry saved filters or views.
9. **Menu items with icons** keep the admin's convention: the icon
   after the label.

## Out of scope for now

The login pages, the command palette, dialogs and toasts, the block
widget and the trash page keep their current design; they inherit the
shared pieces (header, table, badges) where they use them.
