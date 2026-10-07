import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { CheckboxWidget } from "@/components/widgets/checkbox-widget";
import { FallbackWidget } from "@/components/widgets/fallback-widget";
import { InputWidget } from "@/components/widgets/input-widget";
import { TextAreaWidget } from "@/components/widgets/text-area-widget";

describe("InputWidget", () => {
  it("renders the value and reports changes", async () => {
    const onChange = vi.fn();
    render(<InputWidget value="hello" onChange={onChange} />);

    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("hello");

    await userEvent.type(input, "!");

    expect(onChange).toHaveBeenCalledWith("hello!");
  });
});

describe("CheckboxWidget", () => {
  it("renders the value and reports toggles", async () => {
    const onChange = vi.fn();
    render(<CheckboxWidget value={true} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();

    await userEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith(false);
  });
});

function ControlledTextArea() {
  const [value, setValue] = useState("");

  return <TextAreaWidget value={value} onChange={setValue} />;
}

describe("TextAreaWidget", () => {
  it("reports changes", async () => {
    render(<ControlledTextArea />);

    await userEvent.type(screen.getByRole("textbox"), "some text");

    expect(screen.getByRole("textbox")).toHaveValue("some text");
  });
});

describe("FallbackWidget", () => {
  it("renders the display string of related items, read-only", () => {
    render(<FallbackWidget value={{ id: "1", __str__: "A related item" }} />);

    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("A related item");
    expect(input).toHaveAttribute("readonly");
  });

  it("renders plain values", () => {
    render(<FallbackWidget value={42} />);

    expect(screen.getByRole("textbox")).toHaveValue("42");
  });
});
