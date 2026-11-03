# Badge

A short label for status or counts, such as "Published" or "3 tags", in `small` type.

- `default` (`primary`) for the main status, `secondary` for neutral states such as "Draft", `outline` for counts and metadata, `destructive` for removed or failed items.
- `tone` colors a status value: `gray`, `blue`, `green`, `yellow`, `red` or `purple`, tinted backgrounds tuned for light and dark. It overrides the variant's colors; BadgeFormat uses it for choices such as "Published" (green) or "Archived" (gray).
- One or two words. Status colors always come with a word, never color alone.

The consumer provides the text.
