import { Textarea } from "@/components/ui/textarea";
import type { WidgetProps } from "@/types";

export function TextAreaWidget({ value, onChange }: WidgetProps<string>) {
  return (
    <div>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
