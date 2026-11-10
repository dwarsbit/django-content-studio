import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import { dateRangeBound } from "@/lib/date-range";

describe("dateRangeBound", () => {
  const day = new Date(2026, 1, 1, 15, 0);

  it("bounds a date field by plain dates", () => {
    expect(dateRangeBound(day, "gte", false)).toBe("2026-02-01");
    expect(dateRangeBound(day, "lte", false)).toBe("2026-02-01");
  });

  it("covers the whole day of a date-time field, its last minute too", () => {
    const from = dateRangeBound(day, "gte", true);
    const to = dateRangeBound(day, "lte", true);

    expect(dayjs(from).valueOf()).toBe(new Date(2026, 1, 1).getTime());
    expect(dayjs(to).valueOf()).toBe(
      new Date(2026, 1, 1, 23, 59, 59, 999).getTime(),
    );
    // With the offset, so the server reads the browser's day.
    expect(to).toMatch(/Z$/);
  });
});
