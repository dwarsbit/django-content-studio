import { Checkbox } from "@/components/ui/checkbox";
import type { WidgetProps } from "@/types";

// Form control wiring forwarded to the primitive: the id associates
// the control with its label, the aria props tie help text and
// errors to it.
type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export function CheckboxWidget({
  value,
  onChange,
  ...control
}: WidgetProps<boolean | "indeterminate"> & ControlProps) {
  return <Checkbox checked={value} onCheckedChange={onChange} {...control} />;
}
