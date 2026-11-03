import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useTranslation } from "react-i18next";

import { formatDateTime, parseDateValue } from "@/lib/format-date";
import type { DateTimeFormatOptions } from "@/types";

dayjs.extend(relativeTime);

/**
 * A date and time: relative to now by default ("3 hours ago"), with
 * the exact time on hover; with relative off, the date and time.
 */
export function DatetimeFormat({
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
  const { relative = true, style } = (options ?? {}) as DateTimeFormatOptions;
  const exact = formatDateTime(date, { style, locale: i18n?.language });

  return relative ? (
    <time
      dateTime={String(value)}
      title={exact}
      className="font-normal text-muted-foreground whitespace-nowrap"
    >
      {dayjs(date).fromNow()}
    </time>
  ) : (
    <time dateTime={String(value)} className="whitespace-nowrap">
      {exact}
    </time>
  );
}
