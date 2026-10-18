# Popover

Floating content anchored to a trigger, for a small interaction that does not need a page, such as a filter or a date picker.

- Opens on click, closes on a click outside or Escape.
- Keep it small: a few fields and an apply button. Larger tasks go in a `Dialog` or `Sheet`.
- Use `Tooltip` for a hint that needs no interaction.

The consumer provides the trigger, the content and, optionally, `open`/`onOpenChange`.
