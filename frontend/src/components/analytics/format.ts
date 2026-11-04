import { formatExactNumber, formatNumber } from "@/lib/format-number";
import type { AnalyticsMetric } from "@/types";

import type { Interval } from "./data";

/** Seconds as "2m 14s", "45s" or "1h 3m". */
export function formatDuration(seconds: number) {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

type Kind = AnalyticsMetric["kind"];

export function formatMetric(kind: Kind, value: number, locale?: string) {
  if (kind === "percent") {
    return formatNumber(value, { format: "percent", locale });
  }
  if (kind === "duration") return formatDuration(value);
  return formatNumber(value, { locale });
}

export function exactMetric(kind: Kind, value: number, locale?: string) {
  return kind === "number"
    ? formatExactNumber(value, { locale })
    : formatMetric(kind, value, locale);
}

/** The change against the previous period, in percent; null if unknown. */
export function change(value: number, previous: number | null) {
  if (previous == null || previous === 0) return null;
  return Math.round(((value - previous) / previous) * 1000) / 10;
}

/** A bucket's label on the chart's axis. */
export function formatBucket(
  date: Date,
  interval: Interval,
  locale?: string,
  long = false,
) {
  const options: Intl.DateTimeFormatOptions =
    interval === "hour"
      ? long
        ? { weekday: "short", hour: "2-digit", minute: "2-digit" }
        : { hour: "2-digit", minute: "2-digit" }
      : interval === "day"
        ? long
          ? { weekday: "short", month: "short", day: "numeric" }
          : { month: "short", day: "numeric" }
        : { month: "short", year: "numeric" };

  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}
