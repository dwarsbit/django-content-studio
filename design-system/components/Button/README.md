# Button

Triggers an action: saving, deleting, opening a dialog. Variants rank the actions on a page.

- `variant="default"` (`primary` fill) for the one main action per view, such as **Save**.
- `outline` and `secondary` for other actions; `ghost` for actions in toolbars, menus and table rows; `link` for navigation that looks like text.
- `destructive` only for actions that delete, always behind a confirmation dialog.
- `size`: `default` in forms, `sm` and `xs` in dense toolbars and tables, the `icon*` sizes for icon-only buttons (give them an `aria-label`).
- `isLoading` shows a spinner and disables the button while a request runs; keep the label.
- Labels are verbs in sentence case: "Save", "Delete", "Copy URL". No exclamation marks.

The consumer provides the label (children), `onClick` or `type="submit"`, and `asChild` with a link element for navigation.
