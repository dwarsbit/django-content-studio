# EmptyState

What a list, a grid or a table shows instead of rows: an icon in a mist tile, a short title, one line of explanation and one action.

- A truly empty list invites creation ("Create", "Upload media"); a list that search or filters empty says nothing matches and offers "Clear all filters".
- `icon` is the model's icon or, while filters hide everything, the funnel; the tile stays in the mist family.
- `title` is optional: the list page uses the description alone, the media library a title and a description.
- The action is one button, `primary` for creation and `outline` for clearing.
- Give it `className` to add a frame, such as the media library's dashed drop zone.

The consumer provides the copy and the action; the component centers them with 64px of vertical padding.
