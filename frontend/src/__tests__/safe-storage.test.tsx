import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/components/theme-provider";
import { safeStorage } from "@/lib/safe-storage";

// Safari with "Block all cookies" throws on every access to localStorage.
function blockStorage() {
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  });
}

describe("safeStorage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("reads, writes and removes items", () => {
    safeStorage.set("key", "value");
    expect(safeStorage.get("key")).toBe("value");

    safeStorage.remove("key");
    expect(safeStorage.get("key")).toBeNull();
  });

  it("never throws when the browser blocks storage", () => {
    blockStorage();

    expect(safeStorage.get("key")).toBeNull();
    expect(() => safeStorage.set("key", "value")).not.toThrow();
    expect(() => safeStorage.remove("key")).not.toThrow();
  });

  it("lets the admin render when the browser blocks storage", () => {
    blockStorage();

    render(
      <ThemeProvider defaultTheme="light">
        <span>admin</span>
      </ThemeProvider>,
    );

    expect(screen.getByText("admin")).toBeInTheDocument();
  });
});
