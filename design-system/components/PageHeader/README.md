# PageHeader

The bar at the top of every page: 56px high, a hairline under it, the title on the left and the page's actions on the right. `Toolbar` and `PageBody` complete the page.

- `title` is the page's name in sentence case, capitalized by the component; `icon` puts the page's icon in a mist tile before it; `meta` sits inline after the title (a count, a status badge); `description` adds a muted second line.
- `actions` holds the buttons: exactly one `primary` button per page, the rest `outline` or `ghost`.
- `back` takes a ghost icon button for pages that lead back to a list.
- `heading` is `h1` by default; a dialog that carries its own title passes `div`.
- Rows under the bar go in as children: a `Toolbar` for search, filter chips, sort and view toggles, all 32px high, with `ml-auto` pushing the view controls right.
- `PageBody` is the scroll container: content capped at 1280px with 24px of padding.

The consumer provides the title, the actions and the page's rows; the header, toolbar and body share the 1280px width so their edges line up.
