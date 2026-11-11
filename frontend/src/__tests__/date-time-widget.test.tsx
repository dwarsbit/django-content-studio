import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DateTimeWidget } from "@/components/widgets/date-time-widget";
import { FieldType, type ModelField } from "@/types";

const FIELD = {
  type: FieldType.DateTimeField,
  required: false,
} as ModelField;

function ControlledWidget({
  initial,
  onChange,
}: {
  initial: string | null;
  onChange: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <DateTimeWidget
      field={FIELD}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

async function toggle() {
  const trigger = screen.getAllByRole("button")[0];
  await userEvent.click(trigger);
  await userEvent.keyboard("{Escape}");
}

describe("DateTimeWidget", () => {
  it("leaves the value alone when the picker opens and closes", async () => {
    const onChange = vi.fn();
    render(
      <ControlledWidget initial="2026-11-10T14:30:45Z" onChange={onChange} />,
    );

    await toggle();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("sends the picked time as an instant with its offset", async () => {
    const onChange = vi.fn();
    render(
      <ControlledWidget initial="2026-11-10T14:30:00Z" onChange={onChange} />,
    );
    const local = dayjs("2026-11-10T14:30:00Z");

    await userEvent.click(screen.getAllByRole("button")[0]);
    const minutes = screen.getByPlaceholderText("mm");
    await userEvent.clear(minutes);
    await userEvent.type(minutes, "45");
    await userEvent.keyboard("{Escape}");

    expect(onChange).toHaveBeenCalledTimes(1);
    const sent = onChange.mock.calls[0][0] as string;
    // An offset, so the server reads the editor's instant whatever its
    // own time zone.
    expect(sent).toMatch(/[+-]\d{2}:\d{2}$|Z$/);
    expect(dayjs(sent).valueOf()).toBe(local.minute(45).second(0).valueOf());
  });

  it("stays cleared when the picker opens and closes after a clear", async () => {
    const onChange = vi.fn();
    render(
      <ControlledWidget initial="2026-11-10T14:30:00Z" onChange={onChange} />,
    );

    await userEvent.click(screen.getAllByRole("button")[0]);
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenLastCalledWith(null);

    await toggle();

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
