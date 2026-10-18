# DebouncedInput

An `Input` that reports its value half a second after typing stops, for search boxes that query as you type.

- Use it for search and filters, never for form fields that are saved.
- `onChange` receives the text, not the event.
- Pair it with a placeholder that says what is searched: "Search media".

The consumer provides the initial `value` and `onChange`.
