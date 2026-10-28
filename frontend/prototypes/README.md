# Design prototypes

Clickable prototypes of the admin's main screens, built from the admin's
own components (`src/components/ui`), styles (`src/index.css`) and
icons, with mock data. They are the reference for the redesign
described in [PLAN.md](./PLAN.md); nothing in here ships with the
package.

```bash
npm run dev:prototypes     # http://localhost:5174/
npm run build:prototypes   # static build in prototypes/dist (git-ignored)
```

The "Prototype controls" panel (bottom right) switches the screen, the
theme, the main menu state, single site versus multi-tenant, and the
states of the current screen (selected rows, filters, empty lists, an
unsaved form). Below 1024px the main menu becomes the rail and the edit
page stacks its sidebar.

| File             | What it holds                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `app.tsx`        | Hash routes, the settings and the controls panel                                                                                       |
| `shell.tsx`      | The app shell and the main menu                                                                                                        |
| `components.tsx` | The shared pieces: page header, toolbar, filter chips, bulk bar, empty state, line tabs, form fields. Candidates for `src/components`. |
| `data.ts`        | Mock articles, media, folders, activity and tasks                                                                                      |
| `screens/`       | Dashboard, content list, trash, edit (also the create form and the inline row dialog) and media library                                |
| `prototypes.css` | Prototype-only styles, including the proposed button sizes                                                                             |

The admin's `Input` is always controlled, so the prototypes use the
small `TextInput` and `GroupTextInput` wrappers to keep their text.
