import { describe, expect, it } from "vitest";

import { sizeOf } from "@/components/media-library/file-meta";

describe("sizeOf", () => {
  it("formats the size, which media items store in bytes", () => {
    expect(sizeOf({ size: 2048 })).toBe("2KB");
    expect(sizeOf({ size: 20_150 })).toBe("19.68KB");
    expect(sizeOf({ size: 5 * 1024 * 1024 })).toBe("5MB");
  });

  it("is empty for an unknown size", () => {
    expect(sizeOf({ size: 0 })).toBe("");
    expect(sizeOf({ size: null as unknown as number })).toBe("");
  });
});
