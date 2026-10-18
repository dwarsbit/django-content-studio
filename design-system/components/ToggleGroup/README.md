# ToggleGroup

A row of toggles where one (`type="single"`) or several (`type="multiple"`) are on, such as a field with three to five choices or the table/list switch.

- Prefer it over `Select` when every choice fits on one line and seeing them all helps.
- Labels are short nouns in sentence case: "Draft", "Review", "Published".
- `variant="outline"` in forms, `default` in toolbars.

The consumer provides `type`, the items with their `value`, and `value`/`onValueChange`.
