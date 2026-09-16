import { Input } from "@/components/ui/input";

export function FallbackWidget({ value }: { value: any }) {
  return <Input readOnly value={value ? value.__str__ || String(value) : ""} />;
}
