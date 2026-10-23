import { describe, expect, it } from "vitest";

import { slugify, stripAccents } from "@/lib/slug";

describe("slugify", () => {
  it("makes slugs the way Django's slugify does", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("  Spaces -- and   hyphens  ")).toBe("spaces-and-hyphens");
    expect(slugify("What's new?")).toBe("whats-new");
    expect(slugify("snake_case stays")).toBe("snake_case-stays");
  });

  it("drops accents and letters without an ASCII form", () => {
    expect(slugify("Café crème")).toBe("cafe-creme");
    expect(slugify("Приве́т world")).toBe("world");
  });

  it("cuts to the maximum length without a trailing hyphen", () => {
    expect(slugify("Hello World", 6)).toBe("hello");
    expect(slugify("Hello World", 50)).toBe("hello-world");
  });
});

describe("stripAccents", () => {
  it("keeps the base letters", () => {
    expect(stripAccents("Ærø Café")).toBe("Ærø Cafe");
  });
});
