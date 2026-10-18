# Command

A searchable list of commands or objects, used for the command palette and the relation pickers.

- `CommandInput` on top, with a placeholder that says what is searched; `CommandEmpty` says what to do when nothing matches.
- `CommandGroup` with a `heading` per kind of result; `CommandShortcut` shows a key combination.
- `CommandDialog` opens it as the command palette (Ctrl or Cmd + K).

The consumer provides the groups and items with their `onSelect`.
