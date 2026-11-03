export type NumberFormat = "compact" | "full" | "percent" | "currency";

export interface NumberFormatOptions {
  format?: NumberFormat;
  // ISO 4217 code, for the "currency" format.
  currency?: string;
  // BCP 47 tag; the browser's language when left out.
  locale?: string;
}

function formatter(
  locale: string | undefined,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, options);
  } catch {
    // An unknown locale or currency: plain grouped digits still read.
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  }
}

/**
 * A statistic as shown on the dashboard, in the editor's language:
 * "compact" shortens large numbers (1.2K, 45.9K, 3.4M), "full" groups
 * the digits (45,940), "percent" reads the value as a percentage (91 is
 * 91%) and "currency" shows an amount, compact from 1,000 on.
 */
export function formatNumber(
  value: number,
  { format = "compact", currency, locale }: NumberFormatOptions = {},
): string {
  switch (format) {
    case "full":
      return formatter(locale, { maximumFractionDigits: 2 }).format(value);
    case "percent":
      return formatter(locale, {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value / 100);
    case "currency":
      if (!currency) {
        return formatNumber(value, { format: "compact", locale });
      }
      return formatter(
        locale,
        Math.abs(value) < 1000
          ? { style: "currency", currency }
          : {
              style: "currency",
              currency,
              notation: "compact",
              maximumFractionDigits: 1,
            },
      ).format(value);
    default:
      return formatter(locale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
  }
}

/**
 * The exact value behind a formatted statistic, for its tooltip and
 * for screen readers.
 */
export function formatExactNumber(
  value: number,
  { format = "compact", currency, locale }: NumberFormatOptions = {},
): string {
  if (format === "percent") {
    return formatNumber(value, { format, locale });
  }
  if (format === "currency" && currency) {
    return formatter(locale, { style: "currency", currency }).format(value);
  }
  return formatter(locale, { maximumFractionDigits: 20 }).format(value);
}

export interface FieldNumberOptions {
  // Digits after the decimal point; up to 2 when left out.
  decimals?: number;
  compact?: boolean;
  style?: "decimal" | "currency" | "percent";
  // ISO 4217 code, for the "currency" style.
  currency?: string;
  // "percent" style: the value is a fraction of one (0.91 is 91%)
  // rather than the percentage (91 is 91%).
  fraction?: boolean;
  // BCP 47 tag; the browser's language when left out.
  locale?: string;
}

/**
 * A field's number as shown on the list page and in read-only fields
 * (NumberFormat, CurrencyFormat, PercentFormat): grouped digits in the
 * editor's language, compact only when asked.
 */
export function formatFieldNumber(
  value: number,
  {
    decimals,
    compact = false,
    style = "decimal",
    currency,
    fraction = false,
    locale,
  }: FieldNumberOptions = {},
): string {
  const options: Intl.NumberFormatOptions =
    decimals === undefined
      ? // A currency keeps its own minor units (cents) when left out.
        style === "currency"
        ? {}
        : { maximumFractionDigits: compact || style === "percent" ? 1 : 2 }
      : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };

  if (style === "currency" && currency) {
    Object.assign(options, { style: "currency", currency });
  }
  if (compact) {
    options.notation = "compact";
  }
  if (style === "percent") {
    options.style = "percent";
    return formatter(locale, options).format(fraction ? value : value / 100);
  }
  return formatter(locale, options).format(value);
}

/**
 * The number a field's value holds: numbers as they are, decimals
 * (sent as strings, such as "12.50") parsed; null for anything else.
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}
