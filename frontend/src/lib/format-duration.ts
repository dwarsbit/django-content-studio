import type { DurationStyle } from "@/types";

/**
 * Seconds of a DurationField value as the API writes it:
 * "[-]D HH:MM:SS[.ffffff]" or "HH:MM:SS" (Django's duration_string).
 * Null for anything else.
 */
export function parseDurationSeconds(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const match =
    /^(?:(-?\d+) (?:days?, )?)?(\d+):(\d{1,2}):(\d{1,2})(?:\.\d+)?$/.exec(
      value.trim(),
    );

  if (!match) {
    return null;
  }
  const [, days = "0", hours, minutes, seconds] = match;

  return (
    Number(days) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds)
  );
}

const UNITS = [
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
] as const;

/**
 * A duration in the locale's words: "1h 20m" (narrow), "1 hr, 20 min"
 * (short) or "1 hour, 20 minutes" (long). Units that are 0 are left
 * out; no duration at all is 0 minutes.
 */
export function formatDuration(
  totalSeconds: number,
  { style = "narrow", locale }: { style?: DurationStyle; locale?: string } = {},
): string {
  const sign = totalSeconds < 0 ? "-" : "";
  let rest = Math.abs(Math.trunc(totalSeconds));
  const parts: string[] = [];

  for (const [unit, size] of UNITS) {
    const amount = Math.floor(rest / size);
    rest -= amount * size;

    if (amount) {
      parts.push(
        new Intl.NumberFormat(locale, {
          style: "unit",
          unit,
          unitDisplay: style,
        }).format(amount),
      );
    }
  }

  if (parts.length === 0) {
    parts.push(
      new Intl.NumberFormat(locale, {
        style: "unit",
        unit: "minute",
        unitDisplay: style,
      }).format(0),
    );
  }
  const list = new Intl.ListFormat(locale, { type: "unit", style }).format(
    parts,
  );

  return `${sign}${list}`;
}
