# Toaster

Short messages that confirm an action or report a failure, in the corner of the screen. Place one `Toaster` in the app and call `toast()` to show a message.

- Say what happened, in the past tense: "Article saved.", "Copied to clipboard."
- `toast.success` and `toast.error` for outcomes; `toast.error` also says what to do: "Upload failed. Try a smaller file."
- Toasts disappear on their own: never put the only copy of important information in one. Errors on a form belong next to the field.

The consumer provides one `Toaster` and calls `toast` with the message.
