import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FormField } from "@/components/content-editor/form-field";
import { Form } from "@/components/ui/form";
import type {
  FormField as IFormField,
  Model,
  ModelField,
  UniqueSet,
} from "@/types";
import { FieldType, FieldWidget } from "@/types";

const httpMock = vi.hoisted(() => ({ get: vi.fn() }));
const useAdminInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => httpMock,
}));

vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: useAdminInfoMock,
}));

// The key followed by its interpolated values, so tests see both.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${values.fieldName} | ${values.otherFields}` : key,
    i18n: { language: "en" },
  }),
}));

const adminInfo = {
  formats: {},
  widgets: { [FieldType.CharField]: { name: FieldWidget.InputWidget } },
  settings: {},
};

const fields: Record<string, ModelField> = {
  slug: { type: FieldType.CharField, verbose_name: "slug" },
  language: { type: FieldType.CharField, verbose_name: "language" },
  edition: { type: FieldType.CharField, verbose_name: "edition" },
  published: { type: FieldType.BooleanField, verbose_name: "published" },
};

const together: UniqueSet = {
  id: "unique_together:slug,language,edition",
  fields: ["slug", "language", "edition"],
};

function modelWith(uniqueSets: UniqueSet[]) {
  return {
    label: "blog.article",
    verbose_name: "Article",
    verbose_name_plural: "Articles",
    tenant_field: null,
    admin: {},
    fields,
    unique_sets: uniqueSets,
  } as unknown as Model;
}

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

function renderFields(
  values: Record<string, unknown>,
  formFields: IFormField[] = [
    formField("slug"),
    formField("language"),
    formField("edition"),
  ],
  uniqueSets: UniqueSet[] = [together],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const model = modelWith(uniqueSets);

  return render(
    <QueryClientProvider client={queryClient}>
      <Harness values={values}>
        {formFields.map((field) => (
          <FormField key={field.name} formField={field} model={model} />
        ))}
      </Harness>
    </QueryClientProvider>,
  );
}

const clash = { data: { exists: true, id: 2, __str__: "Spring" } };

describe("UniqueSetWarning", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAdminInfoMock.mockReturnValue({ data: adminInfo });
  });

  it("checks the combination once and warns under the set's last field", async () => {
    httpMock.get.mockResolvedValue(clash);

    renderFields({ slug: "spring", language: "en", edition: "1" });

    const warning = await screen.findByRole("status");
    expect(warning).toHaveTextContent(
      "editor.unique_set_warning edition | slug and language",
    );
    expect(warning).toHaveTextContent("editor.unique_set_warning_hint");
    expect(screen.getByTestId("unique-warning-edition")).toBe(warning);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(httpMock.get).toHaveBeenCalledTimes(1);
    expect(httpMock.get).toHaveBeenCalledWith(
      "/content/blog.article/unique-check",
      {
        params: {
          set: together.id,
          values: JSON.stringify({
            slug: "spring",
            language: "en",
            edition: "1",
          }),
          exclude: undefined,
        },
      },
    );
  });

  it("moves the warning to the field edited last", async () => {
    httpMock.get.mockResolvedValue(clash);

    renderFields({ id: "7", slug: "spring", language: "e", edition: "1" });

    await userEvent.type(screen.getAllByRole("textbox")[1], "n");

    expect(
      await screen.findByTestId("unique-warning-language"),
    ).toHaveTextContent(
      "editor.unique_set_warning language | slug and edition",
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(httpMock.get).toHaveBeenLastCalledWith(expect.any(String), {
      params: expect.objectContaining({ exclude: "7" }),
    });
  });

  it("shows the warning under a rendered field of the set", async () => {
    httpMock.get.mockResolvedValue(clash);

    // The set's last field is not on the form; the server takes its
    // value from the object being edited.
    renderFields({ id: "7", slug: "spring", language: "en" }, [
      formField("slug"),
      formField("language"),
    ]);

    expect(await screen.findByTestId("unique-warning-language")).toBeVisible();
    expect(httpMock.get).toHaveBeenCalledWith(expect.any(String), {
      params: expect.objectContaining({
        values: JSON.stringify({ slug: "spring", language: "en" }),
      }),
    });
  });

  it("sends the condition's fields", async () => {
    httpMock.get.mockResolvedValue(clash);
    const conditional: UniqueSet = {
      id: "constraint:published_slug",
      fields: ["slug", "language"],
      condition_fields: ["published"],
    };

    renderFields(
      { slug: "spring", language: "en", published: true },
      [formField("slug"), formField("language")],
      [conditional],
    );

    await screen.findByRole("status");
    expect(httpMock.get).toHaveBeenCalledWith(expect.any(String), {
      params: expect.objectContaining({
        values: JSON.stringify({
          slug: "spring",
          language: "en",
          published: "true",
        }),
      }),
    });
  });

  it("skips combinations with an empty value", async () => {
    renderFields({ slug: "spring", language: "", edition: "1" });

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(httpMock.get).not.toHaveBeenCalled();
  });

  it("checks empty values when nulls are equal", async () => {
    httpMock.get.mockResolvedValue({ data: { exists: false } });

    renderFields({ slug: "spring", language: "", edition: "1" }, undefined, [
      { ...together, nulls_equal: true },
    ]);

    await waitFor(() => expect(httpMock.get).toHaveBeenCalledTimes(1));
  });

  it("uses the single-field messages when one field is left", async () => {
    httpMock.get.mockResolvedValue({ data: { exists: true, trashed: false } });

    // A set with the tenant field, which the server leaves out.
    renderFields(
      { slug: "spring" },
      [formField("slug")],
      [{ id: "constraint:slug_per_site", fields: ["slug"] }],
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "editor.unique_warning_hidden slug",
    );
  });

  it("mentions trashed objects and hides objects the editor may not view", async () => {
    httpMock.get.mockResolvedValueOnce({
      data: { exists: true, id: 2, __str__: "Old", trashed: true },
    });

    const { unmount } = renderFields({
      slug: "a",
      language: "en",
      edition: "1",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "editor.unique_set_warning_trashed",
    );
    unmount();

    httpMock.get.mockResolvedValueOnce({ data: { exists: true } });
    renderFields({ slug: "b", language: "en", edition: "1" });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "editor.unique_set_warning_hidden",
    );
  });

  it("hides the warning while the combination changes and on read-only fields", async () => {
    httpMock.get.mockImplementation(
      async (_url: string, { params }: { params: { values: string } }) =>
        params.values.includes('"spring"')
          ? clash
          : { data: { exists: false } },
    );

    renderFields({ slug: "spring", language: "en", edition: "1" }, [
      formField("slug"),
      formField("language"),
      formField("edition", { readonly: true }),
    ]);

    // Read-only, the last field shows no warning: the one before does.
    const input = screen.getAllByRole("textbox")[0];
    expect(await screen.findByTestId("unique-warning-language")).toBeVisible();

    await userEvent.type(input, "s");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(httpMock.get).toHaveBeenLastCalledWith(expect.any(String), {
        params: expect.objectContaining({
          values: expect.stringContaining('"springs"'),
        }),
      }),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
