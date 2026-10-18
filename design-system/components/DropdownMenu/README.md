# DropdownMenu

A menu of actions opened from a button, such as the actions on a table row or the account menu.

- Items are verbs in sentence case: "Duplicate", "Move to trash".
- Group items with `DropdownMenuSeparator`; put the destructive item last, with `variant="destructive"`.
- `DropdownMenuShortcut` shows a key combination; `DropdownMenuCheckboxItem` for a setting that toggles.
- Open it from a `ghost` icon button with an `aria-label`.

The consumer provides the trigger and the items with their `onSelect`.
