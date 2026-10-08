import { Input } from "@/components/ui/input";
import type { WidgetProps } from "@/types";

export function SlugWidget({ value, onChange }: WidgetProps<string>) {
  return (
    <div>
      <Input
        value={value}
        onChange={(e) =>
          onChange(e.target.value.toLowerCase().replace(/[^0-9a-z_-]/g, "-"))
        }
      />
    </div>
  );
}
