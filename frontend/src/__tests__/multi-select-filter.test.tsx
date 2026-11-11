import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MultiSelectFilter } from "@/components/filters/multi-select-filter";
import type { FilterValues } from "@/components/filters/types";
import { FieldType, type Model, type ModelField } from "@/types";

// An IntegerField with choices: the API sends the choice values as
// numbers, while the filter's value is text from the query string.
const FIELD = {
  type: FieldType.IntegerField,
  verbose_name: "status",
  choices: [
    [1, "New"],
    [2, "Paid"],
  ],
} as unknown as ModelField;

function ControlledFilter({
  onChange,
}: {
  onChange: (values: FilterValues) => void;
}) {
  const [values, setValues] = useState<FilterValues>({});

  return (
    <MultiSelectFilter
      field={FIELD}
      name="status"
      model={{} as Model}
      values={values}
      onChange={(changes) => {
        const next = { ...values, ...changes } as FilterValues;
        setValues(next);
        onChange(next);
      }}
    />
  );
}

describe("MultiSelectFilter", () => {
  it("checks and unchecks integer choices", async () => {
    const onChange = vi.fn();
    render(<ControlledFilter onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /status/i }));
    await userEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Paid" }),
    );

    expect(onChange).toHaveBeenLastCalledWith({ "": "2" });
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Paid" }),
    ).toHaveAttribute("aria-checked", "true");

    await userEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Paid" }),
    );

    expect(onChange).toHaveBeenLastCalledWith({ "": null });
  });
});
