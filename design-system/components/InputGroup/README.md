# InputGroup

An input with text or buttons attached inside its border, such as a URL path with its prefix or a folder name with a save button.

- `InputGroupAddon` with `align="inline-start"` for a prefix ("https://", "/blog/"), `inline-end` for a suffix or a button; `block-start`/`block-end` above or below a textarea.
- `InputGroupText` for fixed text, `InputGroupButton` (ghost, `xs`) for an action on the value.
- Use `InputGroupInput`/`InputGroupTextarea` inside, not `Input`, so focus and errors style the whole group.

The consumer provides the value, the addons and their actions.
