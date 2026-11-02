import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Callout } from "@/components/form-components/callout";
import { Subtitle } from "@/components/form-components/subtitle";
import { Text } from "@/components/form-components/text";
import { Title } from "@/components/form-components/title";
import { Form } from "@/components/ui/form";
import type { FormField, Model } from "@/types";

const httpMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));

const model = {
  label: "testapp.article",
  admin: { is_singleton: false },
} as unknown as Model;

function makeField(overrides: Partial<FormField> = {}): FormField {
  return {
    type: "component",
    name: "",
    label: null,
    readonly: false,
    col_span: 1,
    widget: null,
    component_id: "0f1e2d3c",
    component_type: "Text",
    copy: false,
    icon: "",
    text: "Some text",
    per_object: false,
    ...overrides,
  };
}

function Harness({ id, children }: { id: string | null; children: ReactNode }) {
  const form = useForm({ defaultValues: { id } });

  return <Form {...form}>{children}</Form>;
}

function renderWith(node: ReactNode, id: string | null = "abc-123") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Harness id={id}>{node}</Harness>
    </QueryClientProvider>,
  );
}

describe("text components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a title and subtitle as plain text", () => {
    renderWith(
      <>
        <Title
          model={model}
          formField={makeField({ component_type: "Title", text: "**Main**" })}
        />
        <Subtitle
          model={model}
          formField={makeField({ component_type: "Subtitle", text: "Sub" })}
        />
      </>,
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "**Main**" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 4, name: "Sub" }),
    ).toBeInTheDocument();
    expect(httpMock.get).not.toHaveBeenCalled();
  });

  it("renders text as Markdown, without raw HTML", () => {
    const { container } = renderWith(
      <Text
        model={model}
        formField={makeField({
          text: "Read **the guide** at [the docs](https://example.com).\n\n- one\n- two\n\n<img src=x onerror=alert(1)>",
        })}
      />,
    );

    expect(screen.getByText("the guide").tagName).toBe("STRONG");
    const link = screen.getByRole("link", { name: "the docs" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
  });

  it("drops unsafe link URLs", () => {
    renderWith(
      <Text
        model={model}
        formField={makeField({ text: "[click](javascript:alert(1))" })}
      />,
    );

    const link = screen.queryByRole("link", { name: "click" });
    expect(link?.getAttribute("href") ?? "").not.toMatch(/javascript/i);
  });

  it("fetches per-object text for the saved object", async () => {
    httpMock.get.mockResolvedValue({ data: { text: "**3** words" } });

    renderWith(
      <Text
        model={model}
        formField={makeField({ text: null, per_object: true })}
      />,
    );

    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(httpMock.get).toHaveBeenCalledWith(
      "/content/testapp.article/abc-123/components/0f1e2d3c",
    );
  });

  it("shows no per-object text on the create form", () => {
    const { container } = renderWith(
      <Text
        model={model}
        formField={makeField({ text: null, per_object: true })}
      />,
      null,
    );

    expect(container).toBeEmptyDOMElement();
    expect(httpMock.get).not.toHaveBeenCalled();
  });

  it("renders a callout with its title, variant and default icon", () => {
    renderWith(
      <Callout
        model={model}
        formField={makeField({
          component_type: "Callout",
          text: "Changes go *live*.",
          title: "Heads up",
          variant: "warning",
        })}
      />,
    );

    const callout = screen.getByTestId("callout");
    expect(callout).toHaveAttribute("role", "note");
    expect(callout.className).toContain("text-warning");
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("live").tagName).toBe("EM");
    expect(callout.querySelector("svg")).not.toBeNull();
  });

  it("replaces the callout's icon with an icon class", () => {
    renderWith(
      <Callout
        model={model}
        formField={makeField({
          component_type: "Callout",
          variant: "danger",
          icon: "ph-bold ph-lightning",
        })}
      />,
    );

    const callout = screen.getByTestId("callout");
    expect(callout.className).toContain("text-destructive");
    expect(callout.querySelector("svg")).toBeNull();
    expect(callout.querySelector(".ph-lightning")).not.toBeNull();
  });
});
