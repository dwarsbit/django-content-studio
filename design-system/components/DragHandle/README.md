# DragHandle

The grip a row is dragged by in a reorderable list or table. It sits at the start of the row, before any checkbox.

- Pair it with a row menu ("Move to top", "Move to bottom") for moves the pointer cannot make, like to another page.
- When reordering is off, keep the handle and pass `disabled` with a `title` that says why: "Clear the search to reorder". A disabled handle stays focusable so the reason reaches screen readers.
- Give it an `aria-label`; the grip itself has no text.

The consumer provides the drag listeners, `disabled`, `title` and `aria-label`.
