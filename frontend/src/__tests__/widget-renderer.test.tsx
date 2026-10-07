import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetRenderer } from "@/components/widgets/renderer";
import type { Model, ModelField } from "@/types";
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

describe("WidgetRenderer", () => {
  beforeEach(() => {
    useAdminInfoMock.mockReset();
  });

  it("renders the widget the admin info maps to the field type", () => {
    useAdminInfoMock.mockReturnValue({
      data: {
        widgets: {
          [FieldType.BooleanField]: { name: FieldWidget.CheckboxWidget },
        },
      },
    });

    render(
      <WidgetRenderer
        model={makeModel({
          is_active: { type: FieldType.BooleanField },
        })}
        name="is_active"
        value={true}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("prefers the field's widget_class over the default mapping", () => {
    useAdminInfoMock.mockReturnValue({
      data: {
        widgets: {
          [FieldType.BooleanField]: { name: FieldWidget.CheckboxWidget },
        },
      },
    });

    render(
      <WidgetRenderer
        model={makeModel({
          is_active: {
            type: FieldType.BooleanField,
            widget_class: FieldWidget.SwitchWidget,
          },
        })}
        name="is_active"
        value={true}
        onChange={vi.fn()}
      />,
    );

    // SwitchWidget is not implemented in the frontend registry: the
    // fallback widget renders the value read-only.
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("readonly");
  });

  it("falls back to a plain input when no widget is known", () => {
    useAdminInfoMock.mockReturnValue({ data: { widgets: {} } });

    render(
      <WidgetRenderer
        model={makeModel({
          title: { type: FieldType.CharField },
        })}
        name="title"
        value=""
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders a select for choice-driven input widgets", () => {
    useAdminInfoMock.mockReturnValue({
      data: {
        widgets: { [FieldType.CharField]: { name: FieldWidget.InputWidget } },
      },
    });

    render(
      <WidgetRenderer
        model={makeModel({
          status: {
            type: FieldType.CharField,
            choices: [
              ["draft", "Draft"],
              ["published", "Published"],
            ],
          },
        })}
        name="status"
        value="draft"
        onChange={vi.fn()}
      />,
    );

    // Radix selects reveal their options only when opened; asserting
    // the trigger is the stable contract.
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("renders the fallback widget for unknown widget classes", () => {
    useAdminInfoMock.mockReturnValue({ data: { widgets: {} } });

    render(
      <WidgetRenderer
        model={makeModel({
          flavor: {
            type: FieldType.CharField,
            // Not implemented in the frontend registry.
            widget_class: FieldWidget.RadioButtonWidget,
          },
        })}
        name="flavor"
        value={{ id: "1", __str__: "Vanilla" }}
        onChange={vi.fn()}
      />,
    );

    // The fallback widget renders the value's display string, read-only.
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("Vanilla");
    expect(input).toHaveAttribute("readonly");
  });
});
