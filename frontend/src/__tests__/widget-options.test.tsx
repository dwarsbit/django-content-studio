import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetRenderer } from "@/components/widgets/renderer";
import { getDateLimits } from "@/lib/date-limits";
import type { Model, ModelField, WidgetConfig } from "@/types";
import { FieldType, FieldWidget } from "@/types";

const useAdminInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: useAdminInfoMock,
}));

function makeModel(fields: Record<string, ModelField>) {
  return {
    label: "testapp.article",
    verbose_name: "Article",
    verbose_name_plural: "Articles",
    tenant_field: null,
    admin: {},
    fields,
  } as unknown as Model;
}

function renderWidget(
  type: FieldType,
  widget: WidgetConfig | null,
  value: unknown = "",
) {
  return render(
    <WidgetRenderer
      model={makeModel({ field: { type } })}
      name="field"
      value={value}
      onChange={vi.fn()}
      widget={widget}
    />,
  );
}

describe("widget options", () => {
  beforeEach(() => {
    useAdminInfoMock.mockReset();
    useAdminInfoMock.mockReturnValue({ data: { widgets: {} } });
  });

  it("passes the default mapping's options to the widget", () => {
    useAdminInfoMock.mockReturnValue({
      data: {
        widgets: {
          [FieldType.CharField]: {
            name: FieldWidget.InputWidget,
            options: { placeholder: "Untitled" },
          },
        },
      },
    });

    renderWidget(FieldType.CharField, null);

    expect(screen.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      "Untitled",
    );
  });

  it("uses the override's options instead of the default mapping's", () => {
    useAdminInfoMock.mockReturnValue({
      data: {
        widgets: {
          [FieldType.CharField]: {
            name: FieldWidget.InputWidget,
            options: { placeholder: "Untitled" },
          },
        },
      },
    });

    renderWidget(FieldType.CharField, { name: FieldWidget.InputWidget });

    expect(screen.getByRole("textbox")).not.toHaveAttribute("placeholder");
  });

  it("renders an input's prefix and suffix around the value", () => {
    renderWidget(FieldType.CharField, {
      name: FieldWidget.InputWidget,
      options: { prefix: "€", suffix: "incl. VAT" },
    });

    expect(screen.getByText("€")).toBeInTheDocument();
    expect(screen.getByText("incl. VAT")).toBeInTheDocument();
  });

  it("makes an input with number limits a number input", () => {
    renderWidget(
      FieldType.IntegerField,
      {
        name: FieldWidget.InputWidget,
        options: { min_value: 0, max_value: 10, step: 2 },
      },
      4,
    );

    const input = screen.getByRole("spinbutton");
    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("max", "10");
    expect(input).toHaveAttribute("step", "2");
  });

  it("gives a textarea its rows and placeholder", () => {
    renderWidget(FieldType.TextField, {
      name: FieldWidget.TextAreaWidget,
      options: { rows: 6, placeholder: "Summary" },
    });

    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveAttribute("rows", "6");
    expect(textarea).toHaveAttribute("placeholder", "Summary");
  });

  it("shows only the rich text features it was given", () => {
    renderWidget(FieldType.TextField, {
      name: FieldWidget.RichTextWidget,
      options: { features: ["bold", "italic"] },
    });

    expect(
      screen.getByLabelText("widgets.rich_text_widget.bold"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("widgets.rich_text_widget.italic"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("widgets.rich_text_widget.underline"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("widgets.rich_text_widget.bullet_list"),
    ).not.toBeInTheDocument();
    // No block types: no heading menu.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows every rich text feature without a feature list", () => {
    renderWidget(FieldType.TextField, { name: FieldWidget.RichTextWidget });

    expect(
      screen.getByLabelText("widgets.rich_text_widget.underline"),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("strips rich text the features leave out", () => {
    renderWidget(
      FieldType.TextField,
      { name: FieldWidget.RichTextWidget, options: { features: ["bold"] } },
      "<h2>Title</h2><p><strong>bold</strong> <em>italic</em></p>",
    );

    const content = document.querySelector(".rich-text-field")!;
    expect(content.querySelector("strong")).not.toBeNull();
    expect(content.querySelector("h2")).toBeNull();
    expect(content.querySelector("em")).toBeNull();
  });
});

describe("getDateLimits", () => {
  it("disables the days outside the limits", () => {
    const limits = getDateLimits({
      min_date: "2026-01-10",
      max_date: "2026-02-20",
    });

    expect(limits.disabled).toEqual([
      { before: new Date(2026, 0, 10) },
      { after: new Date(2026, 1, 20) },
    ]);
    expect(limits.startMonth).toEqual(new Date(2026, 0, 10));
    expect(limits.endMonth).toEqual(new Date(2026, 1, 20));
  });

  it("limits nothing without options", () => {
    expect(getDateLimits()).toEqual({
      disabled: undefined,
      startMonth: undefined,
      endMonth: undefined,
    });
  });
});
