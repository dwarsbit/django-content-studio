import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CodeEditor } from "@/components/ui/code-editor";

describe("CodeEditor", () => {
  it("shows the value until CodeMirror loads, then edits it there", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <CodeEditor
        id="snippet"
        aria-label="Snippet"
        language="html"
        value="<p>Hi</p>"
        onChange={onChange}
      />,
    );

    expect(container.querySelector("pre")).toHaveTextContent("<p>Hi</p>");

    const content = await waitFor(() => {
      const element = container.querySelector(".cm-content");
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });

    expect(container.querySelector("pre")).toBeNull();
    expect(content).toHaveAttribute("id", "snippet");
    expect(screen.getByRole("textbox", { name: "Snippet" })).toBe(content);
    expect(content).toHaveTextContent("<p>Hi</p>");

    // A new value from outside replaces the text without an onChange.
    rerender(
      <CodeEditor
        id="snippet"
        aria-label="Snippet"
        language="html"
        value="<p>Bye</p>"
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(content).toHaveTextContent("<p>Bye</p>"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
