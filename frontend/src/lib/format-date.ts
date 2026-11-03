import type { DateStyle } from "@/types";

/**
 * A date or datetime value as a Date. A plain date ("2026-10-09") is
 * read as that day where the editor is, not as midnight UTC, so it
 * never shows as the day before; null when the value is not a date.
 */
export function parseDateValue(value: unknown): Date | null {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = plain
    ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]))
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function dateTimeFormatter(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    // An unknown locale: the browser's own still reads.
    return new Intl.DateTimeFormat(undefined, options);
  }
}

/** A date in the editor's language: "short", "medium" or "long". */
export function formatDate(
  date: Date,
  { style = "medium", locale }: { style?: DateStyle; locale?: string } = {},
): string {
  return dateTimeFormatter(locale, { dateStyle: style }).format(date);
}

/** A date and time (hours and minutes) in the editor's language. */
export function formatDateTime(
  date: Date,
  { style = "medium", locale }: { style?: DateStyle; locale?: string } = {},
): string {
  return dateTimeFormatter(locale, {
    dateStyle: style,
    timeStyle: "short",
  }).format(date);
}
