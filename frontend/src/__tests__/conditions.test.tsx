import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useEffect } from "react";
import { useForm, type UseFormReturn, useWatch } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FormSet } from "@/components/content-editor/form-set";
import { ResourcePathContext } from "@/components/content-editor/resource-path";
import { Form } from "@/components/ui/form";
import { evaluate } from "@/lib/conditions";
import { InvalidInput } from "@/lib/invalid-input";
import type {
  ConditionTree,
  FormField as IFormField,
  FormSet as IFormSet,
  Model,
  ModelField,
} from "@/types";
import { FieldType, FieldWidget } from "@/types";

import shared from "../../../tests/conditions_cases.json";

const httpMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const useAdminInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => httpMock,
}));

vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: useAdminInfoMock,
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: () => ({ data: { time_zone: "Europe/Amsterdam" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

describe("evaluate", () => {
  it.each(shared.cases)("$name", (testCase) => {
    const server = (testCase as { server?: Record<string, boolean> }).server;

    expect(
      evaluate(
        testCase.tree as ConditionTree,
        testCase.values as Record<string, unknown>,
        {
          now: new Date(testCase.now),
          timeZone: shared.time_zone,
          server: (id) => server?.[id],
        },
      ),
    ).toBe(testCase.expected ?? undefined);
  });

  it("holds without a condition", () => {
    expect(evaluate(null, {}, { now: new Date() })).toBe(true);
  });
});

const fields: Record<string, ModelField> = {
  type: { type: FieldType.CharField, verbose_name: "type" },
  discount: { type: FieldType.CharField, verbose_name: "discount" },
  price: { type: FieldType.CharField, verbose_name: "price" },
  description: { type: FieldType.CharField, verbose_name: "description" },
};

const model = {
  label: "shop.product",
  verbose_name: "Product",
  verbose_name_plural: "Products",
  tenant_field: null,
  admin: {},
  fields,
  unique_sets: [],
} as unknown as Model;

const isSale: ConditionTree = {
  connector: "AND",
  negated: false,
  children: [{ field: "type", lookup: "exact", value: "sale" }],
};

function field(name: string, when: ConditionTree | null = null) {
  return {
    type: "field",
    name,
    label: null,
    readonly: false,
    col_span: 1,
    widget: null,
    when,
  } as IFormField;
}

// The text box of the field with the label.
function input(label: string) {
  return screen
    .getByText(label)
    .closest("[data-slot='form-item']")!
    .querySelector("input")!;
}

function Values() {
  return <output data-testid="values">{JSON.stringify(useWatch())}</output>;
}

let currentForm: UseFormReturn | null = null;

function Harness({
  values,
  children,
}: {
  values: Record<string, unknown>;
  children: ReactNode;
}) {
  const form = useForm({ defaultValues: values });

  useEffect(() => {
    currentForm = form;
  }, [form]);

  return (
    <Form {...form}>
      <form>{children}</form>
      <Values />
    </Form>
  );
}

function renderFormSet(
  formSet: Partial<IFormSet>,
  values: Record<string, unknown> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ResourcePathContext value="/content/shop.product">
        <Harness values={values}>
          <FormSet
            model={model}
            formSet={{ title: "", description: "", fields: [], ...formSet }}
          />
        </Harness>
      </ResourcePathContext>
    </QueryClientProvider>,
  );
}

describe("conditional fields", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAdminInfoMock.mockReturnValue({
      data: {
        formats: {},
        widgets: { [FieldType.CharField]: { name: FieldWidget.InputWidget } },
        settings: {},
      },
    });
  });

  it("shows a field while the condition holds", async () => {
    renderFormSet(
      { fields: [field("type"), field("discount", isSale)] },
      { type: "news", discount: "" },
    );

    expect(screen.queryByText("discount")).not.toBeInTheDocument();

    const type = input("type");
    await userEvent.clear(type);
    await userEvent.type(type, "sale");

    expect(screen.getByText("discount")).toBeInTheDocument();

    await userEvent.type(type, "s");

    expect(screen.queryByText("discount")).not.toBeInTheDocument();
  });

  it("gives a hidden field's column in a layout to the others", () => {
    const { container } = renderFormSet(
      {
        fields: [
          field("type"),
          { columns: 2, fields: [field("price"), field("discount", isSale)] },
        ],
      },
      { type: "news" },
    );

    const row = container.querySelector(
      "[style*='grid-template-columns']",
    ) as HTMLElement;
    expect(row.style.gridTemplateColumns).toBe("repeat(1, minmax(0, 1fr))");
    expect(screen.getByText("price")).toBeInTheDocument();
    expect(screen.queryByText("discount")).not.toBeInTheDocument();
  });

  it("puts unsavable input in a hidden field back", async () => {
    renderFormSet(
      { fields: [field("type"), field("discount", isSale)] },
      { type: "sale", discount: "10%" },
    );

    act(() =>
      currentForm!.setValue(
        "discount",
        new InvalidInput("1O%", "Not a number"),
      ),
    );
    await userEvent.type(input("type"), "s");

    await waitFor(() =>
      expect(screen.getByTestId("values")).toHaveTextContent(
        '"discount":"10%"',
      ),
    );
  });

  it("asks the server for server-side conditions", async () => {
    httpMock.post.mockResolvedValue({ data: { result: true } });
    const passes: ConditionTree = {
      connector: "AND",
      negated: true,
      children: [{ condition: "c1", fields: ["description"] }],
    };

    renderFormSet(
      {
        fields: [
          field("description"),
          {
            type: "component",
            component_type: "Callout",
            component_id: "callout",
            text: "Fails the house style.",
            variant: "warning",
            when: passes,
          } as unknown as IFormField,
        ],
      },
      { description: "Hello", title: "Secret" },
    );

    await waitFor(() =>
      expect(httpMock.post).toHaveBeenCalledWith(
        "/content/shop.product/conditions/c1",
        { values: { description: "Hello" } },
      ),
    );
    expect(screen.queryByTestId("callout")).not.toBeInTheDocument();

    httpMock.post.mockResolvedValue({ data: { result: false } });
    await userEvent.type(input("description"), "!");

    expect(await screen.findByTestId("callout")).toHaveTextContent(
      "Fails the house style.",
    );
  });

  it("hides what a server-side condition guards until it answers", async () => {
    let answer: (value: unknown) => void = () => {};
    httpMock.post.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const fails: ConditionTree = {
      connector: "AND",
      negated: true,
      children: [{ condition: "c1", fields: ["description"] }],
    };

    renderFormSet(
      { fields: [field("description"), field("discount", fails)] },
      { description: "Hello" },
    );

    expect(screen.queryByText("discount")).not.toBeInTheDocument();

    await act(async () => answer({ data: { result: false } }));

    expect(await screen.findByText("discount")).toBeInTheDocument();
  });
});
