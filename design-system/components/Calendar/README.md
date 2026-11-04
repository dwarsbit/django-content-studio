# Calendar

A month grid for picking a date or a range, inside the date widgets and the date range filter.

- Show it in a `Popover` from a field that also accepts typed dates; never as the only way to enter one.
- `mode="single"` for a date, `mode="range"` for filters.
- The single arrows step a month, the double arrows a year; neither goes past `startMonth` or `endMonth`.
- The week starts and the month names follow the editor's language.
- `captionLayout="dropdown"` adds month and year selects for dates far from today, such as birth dates.

The consumer provides `mode`, `selected`/`onSelect` and, optionally, `defaultMonth` and disabled dates.
