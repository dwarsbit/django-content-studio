import { Switch } from "@/components/ui/switch";
import type { WidgetProps } from "@/types";

// Form control wiring forwarded to the primitive: the id associates
// the control with its label, the aria props tie help text and
// errors to it.
type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export function SwitchWidget({
  value,
  onChange,
  ...control
}: WidgetProps<boolean> & ControlProps) {
  return (
    <Switch checked={Boolean(value)} onCheckedChange={onChange} {...control} />
  );
}
