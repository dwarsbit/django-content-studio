# Dialog

Asks for a decision or a short input on top of the page, such as confirming a delete.

- Title as a question or a task ("Delete this article?"), in `title-small`.
- The description says what happens and whether it can be undone.
- Footer buttons: the safe choice first (`outline`), the action last; `destructive` when it deletes.

The consumer provides the title, description, footer actions and `open`/`onOpenChange`.
