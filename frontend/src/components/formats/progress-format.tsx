import { useTranslation } from "react-i18next";

import { formatFieldNumber, toNumber } from "@/lib/format-number";
import type { ProgressFormatOptions } from "@/types";

/** A number as a small meter from 0 to max_value, the number next to it. */
export function ProgressFormat({
  value,
  emptyValue,
  options,
}: {
  value: unknown;
  emptyValue?: string | null;
  options?: Record<string, unknown>;
}) {
  const { i18n } = useTranslation();
  const number = toNumber(value);

  if (number === null) {
    return <span>{emptyValue ?? ""}</span>;
  }
  const { max_value: max = 100 } = (options ?? {}) as ProgressFormatOptions;
  const share = Math.min(100, Math.max(0, (number / max) * 100));

  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={number}
        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-accent"
      >
        <span
          className="block h-full rounded-full bg-foreground/70"
          style={{ width: `${share}%` }}
        />
      </span>
      <span className="tabular-nums text-muted-foreground">
        {formatFieldNumber(number, { locale: i18n?.language })}
      </span>
    </span>
  );
}
