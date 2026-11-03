import { Textarea } from "@/components/ui/textarea";
import type { ModelField, TextAreaWidgetOptions, WidgetProps } from "@/types";

import { CharacterCount } from "./character-count";

export function TextAreaWidget({
  field,
  value,
  onChange,
  options = {},
}: { field?: ModelField } & WidgetProps<string, TextAreaWidgetOptions>) {
  const { rows, placeholder } = options;

  return (
    <div>
      <Textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        // The textarea grows with its text, which ignores rows: the
        // minimum height keeps the rows (plus padding and border).
        style={rows ? { minHeight: `calc(${rows}lh + 1rem + 2px)` } : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <CharacterCount
        value={value}
        maxLength={field?.max_length}
        options={options}
      />
    </div>
  );
}
