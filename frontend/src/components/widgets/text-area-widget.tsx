import { Textarea } from "@/components/ui/textarea";
import type { TextAreaWidgetOptions, WidgetProps } from "@/types";

export function TextAreaWidget({
  value,
  onChange,
  options = {},
}: WidgetProps<string, TextAreaWidgetOptions>) {
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
    </div>
  );
}
