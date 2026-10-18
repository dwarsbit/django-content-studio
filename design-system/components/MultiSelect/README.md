# MultiSelect

Picks several values from a list, shown as removable badges, such as the categories of an article or a multiple choice field.

- Use it from about six options; below that, a row of `Checkbox`es or a `ToggleGroup` shows every choice at once.
- `options` hold `{ value, label }`; `groupBy` groups them, `onSearch` loads them from the server.
- `emptyIndicator` says what to do when nothing matches: "No categories found."
- `maxSelected` caps the selection; tell the editor the limit in the field's help text.

The consumer provides `options` (or `onSearch`), `value`/`onChange` and a placeholder.
