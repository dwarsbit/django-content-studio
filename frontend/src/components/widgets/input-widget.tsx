import { Input } from "@/components/ui/input";
import type { WidgetProps } from "@/types";

export function InputWidget({ value, onChange }: WidgetProps<string>) {
  return (
    <div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
