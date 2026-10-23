import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FormField } from "@/components/content-editor/form-field";
import { ResourcePathContext } from "@/components/content-editor/resource-path";
import { Form } from "@/components/ui/form";
import type { FormField as IFormField, Model, ModelField } from "@/types";
import { FieldType, FieldWidget } from "@/types";

const httpMock = vi.hoisted(() => ({ get: vi.fn() }));
const useAdminInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => httpMock,
}));

vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: useAdminInfoMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const adminInfo = {
  formats: {},
  widgets: { [FieldType.CharField]: { name: FieldWidget.InputWidget } },
  settings: {},
};

const fields: Record<string, ModelField> = {
  title: { type: FieldType.CharField, verbose_name: "title" },
  slug: { type: FieldType.SlugField, verbose_name: "slug", unique: true },
};

const model = {
  label: "blog.article",
  verbose_name: "Article",
  verbose_name_plural: "Articles",
  tenant_field: null,
  admin: {},
  fields,
} as unknown as Model;

function formField(name: string, overrides: Partial<IFormField> = {}) {
  return {
    type: "field",
    name,
    label: null,
    readonly: false,
    col_span: 1,
    widget: null,
    ...overrides,
  } as IFormField;
}

function Harness({
  values,
  children,
}: {
  values: Record<string, unknown>;
  children: ReactNode;
}) {
  const form = useForm({ defaultValues: values });

  return <Form {...form}>{children}</Form>;
}

function renderField(
  values: Record<string, unknown>,
  field: IFormField = formField("slug"),
  resourcePath?: string,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ResourcePathContext value={resourcePath ?? null}>
        <Harness values={values}>
          <FormField formField={field} model={model} />
        </Harness>
      </ResourcePathContext>
    </QueryClientProvider>,
  );
}

describe("UniqueWarning", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAdminInfoMock.mockReturnValue({ data: adminInfo });
  });

  it("warns when another object uses the value", async () => {
    httpMock.get.mockResolvedValue({
      data: { exists: true, id: 2, __str__: "Hello World" },
    });

    renderField({ slug: "hello-world" });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "editor.unique_warning",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "editor.unique_warning_hint",
    );
    expect(httpMock.get).toHaveBeenCalledWith(
      "/content/blog.article/unique-check",
      { params: { field: "slug", value: "hello-world", exclude: undefined } },
    );
  });

  it("excludes the object being edited and uses the editor's resource path", async () => {
    httpMock.get.mockResolvedValue({ data: { exists: false } });

    renderField(
      { id: "7", slug: "hello-world" },
      formField("slug"),
      "/inlines/blog.page/blog.article",
    );

    await waitFor(() =>
      expect(httpMock.get).toHaveBeenCalledWith(
        "/inlines/blog.page/blog.article/unique-check",
        { params: { field: "slug", value: "hello-world", exclude: "7" } },
      ),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not describe objects the editor may not view", async () => {
    httpMock.get.mockResolvedValue({ data: { exists: true } });

    renderField({ slug: "hello-world" });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "editor.unique_warning_hidden",
    );
  });

  it("mentions trashed objects", async () => {
    httpMock.get.mockResolvedValue({
      data: { exists: true, id: 2, __str__: "Old", trashed: true },
    });

    renderField({ slug: "old" });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "editor.unique_warning_trashed",
    );
  });

  it("hides the warning once the value is changed to a free one", async () => {
    httpMock.get.mockImplementation(
      async (_url: string, { params }: { params: { value: string } }) => ({
        data:
          params.value === "hello-world"
            ? { exists: true, id: 2, __str__: "Hello World" }
            : { exists: false },
      }),
    );

    renderField({ slug: "hello-world" });

    await screen.findByRole("status");

    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "hello-world-2");

    // Hidden right away while typing, and stays hidden after the check.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(httpMock.get).toHaveBeenCalledWith(expect.any(String), {
        params: expect.objectContaining({ value: "hello-world-2" }),
      }),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("debounces typing into a single check", async () => {
    httpMock.get.mockResolvedValue({ data: { exists: false } });

    renderField({ slug: "" });

    await userEvent.type(screen.getByRole("textbox"), "news");

    await waitFor(() => expect(httpMock.get).toHaveBeenCalledTimes(1));
    expect(httpMock.get).toHaveBeenCalledWith(expect.any(String), {
      params: expect.objectContaining({ value: "news" }),
    });
  });

  it("skips empty values", async () => {
    renderField({ slug: "" });

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(httpMock.get).not.toHaveBeenCalled();
  });

  it("does not check fields without unique or read-only fields", async () => {
    renderField({ title: "Hello" }, formField("title"));
    renderField({ slug: "hello" }, formField("slug", { readonly: true }));

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(httpMock.get).not.toHaveBeenCalled();
  });
});
