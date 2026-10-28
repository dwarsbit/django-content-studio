# UserAvatar

A person as an avatar: their picture, or two initials on the secondary color. Used for the user menu, the activity log and presence (who else has an object open).

- Pass the `name`; the initials are derived from it (first and last word) unless `initials` is given. `src` shows a picture instead.
- 24px by default; change the size with a class (`size-7` in headers, `size-5` in table rows).
- For presence, a ring separates overlapping avatars: `ring-background` for viewing, `ring-warning` for editing, the color of unsaved changes. Always pair it with a tooltip or text that names the user and their state.

The consumer provides the name, and the picture or initials when the user has them.
