# Select

Picks one value from a short list of choices, such as a status; fields with choices use it by default.

- Use it for up to about 15 options; longer lists and relations use a searchable picker.
- The trigger shows the placeholder in `muted-foreground` until a value is chosen; the open list sits on `popover` with `shadow-lg`.
- Group options with `SelectGroup` and `SelectLabel` when the list has sections.

The consumer provides the options as `SelectItem` children with a `value`, and `value`/`onValueChange`.
