# Form

Lays out a field with its label, help text and error, wired to the form's validation.

- One `FormItem` per field: `FormLabel`, the control in `FormControl`, then `FormDescription` and `FormMessage`.
- The description says what the field is for or what format it takes, in `muted-foreground`.
- The message says what is wrong and how to fix it: "Enter a title.", not "Invalid input."
- Errors show after the first submit, not while typing.

The consumer provides the form (`useForm`), the field `name` and a `render` function for the control.
