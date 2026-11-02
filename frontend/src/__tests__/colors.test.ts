import { describe, expect, it } from "vitest";

import { normalizeColor, parseColor } from "@/lib/colors";

// The same cases as tests/test_colors.py: the picker writes what the
// server saves.
describe("normalizeColor", () => {
  it.each([
    ["#F00", "hex", false, "#ff0000"],
    ["#ff000080", "hex", true, "#ff000080"],
    ["rgb(255 0 0 / 50%)", "hex", true, "#ff000080"],
    ["#f00", "hex", true, "#ff0000ff"],
    ["hsl(210deg 50% 40%)", "hex", false, "#336699"],
    ["#336699", "rgb", false, "rgb(51, 102, 153)"],
    ["rgba(10,20,30,.25)", "rgb", true, "rgba(10, 20, 30, 0.25)"],
    ["rgb(100%, 0%, 0%)", "rgb", false, "rgb(255, 0, 0)"],
    ["#ff000080", "rgb", true, "rgba(255, 0, 0, 0.502)"],
    ["#336699", "hsl", false, "hsl(210, 50%, 40%)"],
    ["rgba(10, 20, 30, 0.25)", "hsl", true, "hsla(210, 50%, 7.8%, 0.25)"],
    ["hsl(0.5turn, 100%, 50%)", "hsl", false, "hsl(180, 100%, 50%)"],
    ["hsl(-30, 100%, 50%)", "hsl", false, "hsl(330, 100%, 50%)"],
    ["hsl(359.97, 50%, 50%)", "hsl", false, "hsl(0, 50%, 50%)"],
  ] as const)("%s as %s (alpha %s) is %s", (value, format, alpha, expected) => {
    expect(normalizeColor(value, format, alpha)).toBe(expected);
  });

  it("rejects translucent colors without alpha", () => {
    expect(normalizeColor("#ff000080", "hex", false)).toBeNull();
    expect(normalizeColor("rgba(0, 0, 0, 1)", "hex", false)).toBe("#000000");
  });

  it.each([
    "",
    "red",
    "#ggg",
    "#12345",
    "rgb(256, 0, 0)",
    "rgb(1, 2)",
    "rgb(1 2 3 4)",
    "rgba(0, 0, 0, 2)",
    "hsl(10%, 1%, 1%)",
    "hsl(0, 101%, 50%)",
    "rgb(1px, 2, 3)",
  ])("%j is not a color", (value) => {
    expect(parseColor(value)).toBeNull();
  });
});
