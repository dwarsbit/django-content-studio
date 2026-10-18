# Pagination

Moves between the pages of a list: previous, next and the page numbers around the current one.

- Place it below the list, aligned with the table's start.
- The current page uses the `secondary` fill; the others are `ghost`.
- It hides itself when there is only one page.

The consumer provides `current`, `pages` and `onPageChange` (pages count from 1).
