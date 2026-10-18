# Toggle

A two-state button that stays pressed, such as bold in the rich text toolbar.

- Use it for a setting that applies while it is on; use `Switch` for a setting that is saved, and `Checkbox` in forms.
- `variant="outline"` when it stands alone, `default` (no border) inside a toolbar.
- Icon-only toggles need an `aria-label`.
- The pressed state uses `accent` and `accent-foreground`.

The consumer provides `pressed`/`onPressedChange` and the label or icon.
