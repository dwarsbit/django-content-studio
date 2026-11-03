import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ColorFormat } from "@/components/formats/color-format";
import { WidgetRenderer } from "@/components/widgets/renderer";
import type { Model, ModelField, WidgetConfig } from "@/types";
import { FieldType, FieldWidget } from "@/types";

const useAdminInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: useAdminInfoMock,
}));

function renderPicker({
  value = "",
  field = {},
  options,
  onChange = vi.fn(),
}: {
  value?: string;
  field?: Partial<ModelField>;
  options?: Record<string, unknown>;
  onChange?: (value: unknown) => void;
}) {
  const widget: WidgetConfig = { name: FieldWidget.ColorPickerWidget, options };
  const model = {
    label: "testapp.theme",
    fields: { color: { type: FieldType.ColorField, ...field } },
  } as unknown as Model;

  render(
    <WidgetRenderer
      model={model}
      name="color"
      value={value}
      onChange={onChange}
      widget={widget}
    />,
  );
  return onChange;
}

describe("ColorPickerWidget", () => {
  beforeEach(() => {
    useAdminInfoMock.mockReturnValue({ data: { widgets: {} } });
  });

  it("shows an input by default and passes typed text on", () => {
    const onChange = renderPicker({});
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "rgb(51 102 153)" } });

    expect(onChange).toHaveBeenLastCalledWith("rgb(51 102 153)");
  });

  it("converts a typed color to the field's format on blur", () => {
    const onChange = renderPicker({
      value: "rgb(51 102 153)",
      field: { color_format: "hsl" },
    });

    fireEvent.blur(screen.getByRole("textbox"));

    expect(onChange).toHaveBeenLastCalledWith("hsl(210, 50%, 40%)");
  });

  it("leaves text that is not a color for the server to report", () => {
    const onChange = renderPicker({ value: "blue-ish" });

    fireEvent.blur(screen.getByRole("textbox"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("hides the input with show_input=False", () => {
    renderPicker({
      value: "#336699",
      field: { color_format: "rgb" },
      options: { show_input: false },
    });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("rgb(51, 102, 153)")).toBeInTheDocument();
  });

  it("offers the swatches in the field's format", () => {
    const onChange = renderPicker({
      value: "#000000",
      options: { swatches: ["#336699", "hsl(0, 100%, 50%)"] },
    });

    fireEvent.click(screen.getByRole("button", { name: /pick/ }));
    fireEvent.click(screen.getByRole("button", { name: "hsl(0, 100%, 50%)" }));

    expect(onChange).toHaveBeenLastCalledWith("#ff0000");
  });
});

describe("ColorFormat", () => {
  it("shows a swatch with the value", () => {
    const { container } = render(<ColorFormat value="#336699" />);

    expect(screen.getByText("#336699")).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="color-swatch"]'),
    ).toBeInTheDocument();
  });

  it("shows text that is not a color without a swatch", () => {
    const { container } = render(<ColorFormat value="nope" />);

    expect(screen.getByText("nope")).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="color-swatch"]'),
    ).not.toBeInTheDocument();
  });
});
