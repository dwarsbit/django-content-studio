# BulkBar

The pill that floats at the foot of the page while rows are selected: the count on the left, the bulk actions, a hairline and a clear button.

- `label` is the count in words ("3 selected"); `clearLabel` names the clear button for screen readers.
- The actions are `ghost` buttons of size `sm` with an icon before the label; a destructive action keeps its label and takes `text-destructive`.
- It sits on `popover` with `shadow-xl`, 20px above the bottom of the page's main area, which is the positioned ancestor it floats in.
- Selection is per page: changing the page, the view or a filter clears it and the bar goes away.

The consumer provides the label, the actions as children and the clear handler.
