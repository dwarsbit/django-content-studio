import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MultiSelectWidget } from "@/components/widgets/multi-select-widget";
import { FieldType, FieldWidget, type ModelField } from "@/types";

const FIELD: ModelField = {
  type: FieldType.CharField,
  multiple: true,
  choices: [
    ["news", "News"],
    ["tutorials", "Tutorials"],
  ],
  widget_class: FieldWidget.MultiSelectWidget,
};

function setup(initial: string[] = []) {
  const onChange = vi.fn();
  render(<ControlledWidget onChange={onChange} initial={initial} />);
  return { onChange };
}

function ControlledWidget({
  onChange,
  initial,
}: {
  onChange: (next: string[]) => void;
  initial: string[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <MultiSelectWidget
      field={FIELD}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("MultiSelectWidget", () => {
  it("selects and deselects options", async () => {
    const { onChange } = setup();

    const input = screen.getByRole("combobox");
    await userEvent.click(input);

    await userEvent.click(screen.getByRole("option", { name: "News" }));
    expect(onChange).toHaveBeenCalledWith(["news"]);
  });

  it("shows the empty indicator once every option is selected", async () => {
    setup();

    const input = screen.getByRole("combobox");
    await userEvent.click(input);

    await userEvent.click(screen.getByRole("option", { name: "News" }));
    await userEvent.click(screen.getByRole("option", { name: "Tutorials" }));

    expect(
      screen.getByText("widgets.multi_select_widget.no_more_options"),
    ).toBeInTheDocument();
  });
});
