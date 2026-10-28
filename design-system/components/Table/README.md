# Table

Shows objects in rows and columns: the list page's table view, inlines and the media library's table view.

- The header row sits on `muted` with `muted-foreground` labels, 40px high; the first letter of a label is capitalized, so Django's lowercase `verbose_name` reads as a heading.
- Body rows are 44px, separated by `border`, with a 16px gutter at both ends; hovered rows use `muted`, selected rows (`data-state="selected"`) `accent`.
- The first column is the object's name and the only medium-weight cell; everything else keeps the regular weight.
- Align numbers to the right with tabular figures; booleans are a check or a muted dash in the text color, never green or red.
- Keep columns to what editors scan; the edit page holds the rest.

The consumer provides the rows and cells; selection, sorting and pagination live around it.
