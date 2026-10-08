import { Input } from "@/components/ui/input";

function fallbackDisplay(value: unknown): string {
  if (!value) {
    return "";
  }
  if (typeof value === "object" && "__str__" in value) {
    const str = value.__str__;
    return str ? String(str) : String(value);
  }
  return String(value);
}

export function FallbackWidget({ value }: { value: unknown }) {
  return <Input readOnly value={fallbackDisplay(value)} />;
}
