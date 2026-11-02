# Alert

A message inside the page about the current task, such as a saved change or a rejected upload.

- `default` for information and confirmations, `success` for a good outcome, `warning` for something to keep in mind, `destructive` for errors.
- The title says what happened; the description says what to do next. No apologies.

The consumer provides the title and description. For short confirmations after an action, the admin uses toasts instead.
