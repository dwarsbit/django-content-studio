# ColorPicker

A color swatch that opens a picker, the widget of `ColorField` (`ColorPickerWidget`).

- `format` (`"hex"`, `"rgb"` or `"hsl"`) is the notation it writes; `alpha` adds a transparency slider.
- With `showInput` (the default), a text input next to the swatch takes a typed or pasted color in any of the three notations; it is converted to `format` when the input loses focus.
- Without the input, the trigger shows the swatch and the value, like the date picker.
- `swatches` are preset colors below the picker, such as a brand palette; the current one is ringed.
- Translucent colors show over a checkerboard.

The consumer provides `value`/`onChange` (a color string, `""` for none).
