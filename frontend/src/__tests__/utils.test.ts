import { describe, expect, it } from "vitest";

import { cn, getErrorMessage, getTimeOfDay } from "@/lib/utils";

describe("cn", () => {
  it("merges tailwind classes", () => {
    const includePadding = false;

    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("p-2", includePadding && "p-4", "m-1")).toBe("p-2 m-1");
  });
});

describe("getErrorMessage", () => {
  it("reads the first item of list-shaped DRF errors", () => {
    const error = { response: { data: ["Something failed"] } };

    expect(getErrorMessage(error)).toBe("Something failed");
  });

  it("reads the detail of object-shaped errors", () => {
    const error = { response: { data: { detail: "Not found" } } };

    expect(getErrorMessage(error)).toBe("Not found");
  });

  it("falls back to a generic message", () => {
    expect(getErrorMessage({})).toBe("Error");
  });
});

describe("getTimeOfDay", () => {
  it("returns a time of day", () => {
    expect(["morning", "afternoon", "evening"]).toContain(getTimeOfDay());
  });
});
