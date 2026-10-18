# Label

The name of a form control, linked to it with `htmlFor`.

- Every input, select, checkbox and switch has one; clicking it focuses or toggles the control.
- Sentence case, no colon: "Published at", not "Published At:".
- Required fields are marked by validation, not by an asterisk in the label.
- Inside `Form`, use `FormLabel`, which also turns `destructive` on errors.

The consumer provides the text and `htmlFor`.
