import { Checkbox } from "@/components/ui/checkbox";
import type { WidgetProps } from "@/types";

export function CheckboxWidget({
  value,
  onChange,
}: WidgetProps<boolean | "indeterminate">) {
  return <Checkbox checked={value} onCheckedChange={onChange} />;
}
