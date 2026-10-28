# Tabs

Switches between views of the same object without leaving the page, such as an edit page's form set groups.

- Labels are one or two words in sentence case.
- The list sits on `accent`; the active tab lifts to `background`.

The consumer provides a `TabsTrigger` and a `TabsContent` per tab, matched by `value`.

- `TabsList variant="line"` draws an underline under the active tab on a hairline, left-aligned: the sections of a page, such as the edit page's form groups and inlines. The default pill list switches views inside a control.
