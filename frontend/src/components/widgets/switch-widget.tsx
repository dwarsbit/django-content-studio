import { Switch } from "@/components/ui/switch";
import type { WidgetProps } from "@/types";

export function SwitchWidget({ value, onChange }: WidgetProps<boolean>) {
  return <Switch checked={Boolean(value)} onCheckedChange={onChange} />;
}
