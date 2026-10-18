# ButtonGroup

Joins related buttons into one control, such as a link field's **Open** and **Copy URL**.

- Group only actions on the same object; two to four buttons.
- Use the same `variant` and `size` for every button in the group, usually `outline`.
- `ButtonGroupText` holds a fixed label or value inside the group; `ButtonGroupSeparator` divides buttons that share a fill.
- `orientation="vertical"` stacks the buttons; keep horizontal in forms.

The consumer provides the buttons and their actions.
