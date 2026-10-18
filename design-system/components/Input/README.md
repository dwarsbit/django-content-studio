# Input

A single-line text field, used for every text, number, email and URL field on the edit page.

- Sizes: `default` in forms, `sm` in filters and toolbars, `lg` on the login page.
- Placeholders show an example or hint in `muted-foreground`; they never replace a label.
- Mark errors with `aria-invalid`: the border turns `destructive`. Put the message below the field.

The consumer provides the label, `value`/`onChange` (or `defaultValue`) and validation state.
