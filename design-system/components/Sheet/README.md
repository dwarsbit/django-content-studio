# Sheet

A panel that slides in from an edge of the screen for a task beside the page, such as details or a short form.

- `side="right"` by default; `left` for navigation on small screens.
- Header with a `SheetTitle` and an optional `SheetDescription`; actions in `SheetFooter`.
- Use `Dialog` for decisions and short questions; a sheet is for content the editor reads or edits while the page stays in view.

The consumer provides the content, `side` and `open`/`onOpenChange`.
