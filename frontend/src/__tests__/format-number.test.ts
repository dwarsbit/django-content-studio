import { describe, expect, it } from "vitest";

import { formatExactNumber, formatNumber } from "@/lib/format-number";

describe("formatNumber", () => {
  it.each([
    [15, "15"],
    [999, "999"],
    [2000, "2K"],
    [1234, "1.2K"],
    [45940, "45.9K"],
    [1_250_000, "1.3M"],
    [-4500, "-4.5K"],
    [12.34, "12.3"],
  ])("shows %s compact by default as %s", (value, expected) => {
    expect(formatNumber(value, { locale: "en" })).toBe(expected);
  });

  it("follows the locale", () => {
    expect(formatNumber(45940, { locale: "nl" })).toBe("45,9K");
    expect(formatNumber(45940, { locale: "fr" })).toMatch(/^45,9\s?k$/);
    // German has no short form for thousands: it groups the digits.
    expect(formatNumber(45940, { locale: "de" })).toBe("45.940");
    expect(formatNumber(1_250_000, { locale: "de" })).toMatch(/^1,3\s?Mio\.$/);
  });

  it("groups the digits in the full format", () => {
    expect(formatNumber(45940, { format: "full", locale: "en" })).toBe(
      "45,940",
    );
    expect(formatNumber(45940, { format: "full", locale: "nl" })).toBe(
      "45.940",
    );
  });

  it("reads the percent format as a percentage", () => {
    expect(formatNumber(91, { format: "percent", locale: "en" })).toBe("91%");
    expect(formatNumber(12.25, { format: "percent", locale: "en" })).toBe(
      "12.3%",
    );
  });

  it("shows currency, compact from a thousand on", () => {
    expect(
      formatNumber(12.5, { format: "currency", currency: "EUR", locale: "en" }),
    ).toBe("€12.50");
    expect(
      formatNumber(45940, {
        format: "currency",
        currency: "EUR",
        locale: "en",
      }),
    ).toBe("€45.9K");
  });

  it("falls back to compact without a currency", () => {
    expect(formatNumber(45940, { format: "currency", locale: "en" })).toBe(
      "45.9K",
    );
  });

  it("survives an unknown locale", () => {
    expect(() =>
      formatNumber(45940, { locale: "not a locale!" }),
    ).not.toThrow();
  });
});

describe("formatExactNumber", () => {
  it("shows every digit", () => {
    expect(formatExactNumber(45940, { locale: "en" })).toBe("45,940");
    expect(formatExactNumber(1234.5678, { locale: "en" })).toBe("1,234.5678");
    expect(
      formatExactNumber(45940, {
        format: "currency",
        currency: "EUR",
        locale: "en",
      }),
    ).toBe("€45,940.00");
  });
});
