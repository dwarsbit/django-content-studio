# AlertDialog

A dialog that must be answered before the editor can continue, used for every confirmation, such as deleting objects.

- Use it for actions that cannot be undone or lose work; use `Dialog` for anything else.
- Title as a question ("Delete 3 articles?"), the description says what happens.
- `AlertDialogCancel` first, `AlertDialogAction` last; give the action the `destructive` style when it deletes.
- It does not close on a click outside: the editor chooses.

The consumer provides the title, description, the action's label and handler, and `open`/`onOpenChange`.
