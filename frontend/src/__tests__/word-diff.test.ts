import { describe, expect, it } from "vitest";

import { diffWords } from "@/lib/word-diff";

describe("diffWords", () => {
  it("marks the words only one text has", () => {
    expect(diffWords("The quick fox", "The slow fox")).toEqual([
      { type: "same", text: "The " },
      { type: "removed", text: "quick" },
      { type: "added", text: "slow" },
      { type: "same", text: " fox" },
    ]);
  });

  it("handles empty texts", () => {
    expect(diffWords("", "New")).toEqual([{ type: "added", text: "New" }]);
    expect(diffWords("Old", "")).toEqual([{ type: "removed", text: "Old" }]);
    expect(diffWords("", "")).toEqual([]);
  });

  it("joins back into both texts", () => {
    const before = "One two three four five";
    const after = "One three four six five seven";
    const parts = diffWords(before, after);

    expect(
      parts
        .filter((part) => part.type !== "added")
        .map((part) => part.text)
        .join(""),
    ).toBe(before);
    expect(
      parts
        .filter((part) => part.type !== "removed")
        .map((part) => part.text)
        .join(""),
    ).toBe(after);
  });

  it("falls back to replacing very long texts whole", () => {
    const before = Array.from({ length: 1000 }, (_, i) => `a${i}`).join(" ");
    const after = Array.from({ length: 1000 }, (_, i) => `b${i}`).join(" ");

    expect(diffWords(before, after).map((part) => part.type)).toEqual([
      "removed",
      "added",
    ]);
  });
});
