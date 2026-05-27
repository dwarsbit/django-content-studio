import { useRef } from "react";

import { Input } from "@/components/ui/input";

export function TimeWidget({
  value,
  onChange,
}: {
  onChange(value: any): void;
  value?: any;
}) {
  const [hours, minutes] = (value ?? "").split(":");
  const minutesRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-1">
      <Input
        value={hours ?? ""}
        maxLength={2}
        max={24}
        inputMode="decimal"
        className="w-14"
        placeholder="HH"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const hours = e.target.value;

          onChange(`${hours}:${minutes ?? ""}`);

          if (hours.length === 2 && minutesRef.current) {
            minutesRef.current.focus();
          }
        }}
      />
      <span>{":"}</span>
      <Input
        value={minutes ?? ""}
        maxLength={2}
        inputMode="decimal"
        className="w-14"
        placeholder="mm"
        ref={minutesRef}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(`${hours ?? ""}:${e.target.value}`)}
      />
    </div>
  );
}
