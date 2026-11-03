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
