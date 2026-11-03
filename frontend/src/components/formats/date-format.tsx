import { useTranslation } from "react-i18next";
import { PiCalendarBlankBold } from "react-icons/pi";

import { formatDate, parseDateValue } from "@/lib/format-date";
import type { DateFormatOptions } from "@/types";

export function DateFormat({
  value,
  options,
}: {
  value: unknown;
  options?: Record<string, unknown>;
}) {
  const { i18n } = useTranslation();
  const date = parseDateValue(value);

  if (!date) {
    return null;
  }
  const { style } = (options ?? {}) as DateFormatOptions;

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <PiCalendarBlankBold className="text-muted-foreground" />
      {formatDate(date, { style, locale: i18n?.language })}
    </span>
  );
}
