# TagInput

Free-form tags as removable badges, the widget of `TagField`.

- Enter, a comma or leaving the field adds the typed tag; Backspace in an empty field removes the last one.
- Duplicates are ignored, whatever their case.
- Use `MultiSelect` instead when the tags come from a fixed list.
- `maxTags` caps the number; say so in the field's help text.

The consumer provides `value`/`onChange` (a list of strings) and a placeholder.
