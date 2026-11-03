import { useTranslation } from "react-i18next";

import { formatDuration, parseDurationSeconds } from "@/lib/format-duration";
import type { DurationFormatOptions } from "@/types";

/** A duration in words in the editor's language, such as "1h 20m". */
export function DurationFormat({
  value,
  emptyValue,
  options,
}: {
  value: unknown;
  emptyValue?: string | null;
  options?: Record<string, unknown>;
}) {
  const { i18n } = useTranslation();
  const seconds = parseDurationSeconds(value);

  if (seconds === null) {
    return <span>{value ? String(value) : (emptyValue ?? "")}</span>;
  }
  const { style } = (options ?? {}) as DurationFormatOptions;

  return (
    <span className="whitespace-nowrap">
      {formatDuration(seconds, { style, locale: i18n?.language })}
    </span>
  );
}
