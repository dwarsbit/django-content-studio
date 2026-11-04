# CodeEditor

A code editor with line numbers and syntax highlighting (CodeMirror), the editor of `CodeWidget` and `JSONWidget`.

- `language` (`"css"`, `"html"`, `"javascript"` or `"json"`) turns on highlighting; without it the code is plain text. JSON that does not parse is underlined, with a marker in the gutter.
- CodeMirror loads on demand, the first time an editor is shown; until then the value shows as muted monospace text. If it cannot load, a plain text area edits the value.
- Tab indents. Escape, then Tab, moves the focus on.
- The syntax colors are the `code-*` tokens, so the editor follows the light and dark theme.
- It looks like `Textarea`: the input border, a ring on focus and a destructive border with `aria-invalid`.

The consumer provides `value`/`onChange` (a string).
