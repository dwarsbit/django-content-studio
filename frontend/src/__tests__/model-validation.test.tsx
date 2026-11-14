import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialogProvider } from "@/components/confirm-dialog-provider";
import { ContentEditorPage } from "@/pages/(studio)/content/[model]/[id]/page";
import type { FormField, Model } from "@/types";
import { FieldType, FieldWidget } from "@/types";

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
const useDiscoverMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => httpMock,
}));

vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: () => ({
    data: {
      formats: {},
      widgets: {
        [FieldType.CharField]: { name: FieldWidget.InputWidget },
        [FieldType.SlugField]: { name: FieldWidget.InputWidget },
      },
      settings: {
        created_at_attr: "created_at",
        created_by_attr: "created_by",
        edited_at_attr: "edited_at",
        edited_by_attr: "edited_by",
      },
    },
  }),
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: useDiscoverMock,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { object?: string }) =>
      options?.object ? `${key}:${options.object}` : key,
  }),
}));

function field(name: string): FormField {
  return {
    type: "field",
    name,
    label: null,
    readonly: false,
    col_span: 1,
    widget: null,
    component_id: "",
    component_type: "LinkButton",
    copy: false,
    icon: "",
  };
}

function makeModel({
  duplicate = true,
  addPermission = true,
}: { duplicate?: boolean; addPermission?: boolean } = {}): Model {
  return {
    label: "testapp.article",
    verbose_name: "Article",
    verbose_name_plural: "Articles",
    tenant_field: null,
    admin: {
      is_singleton: false,
      icon: null,
      list: {
        per_page: 10,
        description: "",
        display: [],
        search: false,
        filter: [],
        sortable_by: null,
        actions: [],
      },
      edit: {
        main: [
          {
            label: "",
            formsets: [
              {
                title: "",
                description: "",
                fields: [field("title"), field("slug")],
              },
            ],
          },
        ],
        sidebar: [],
        readonly_fields: [],
        prepopulated_fields: { slug: ["title"] },
        duplicate,
        inlines: [],
      },
      permissions: {
        add_permission: addPermission,
        change_permission: true,
        delete_permission: true,
        view_permission: true,
      },
    },
    fields: {
      id: {
        type: FieldType.IntegerField,
        primary_key: true,
        readonly: true,
        verbose_name: "ID",
      },
      title: {
        type: FieldType.CharField,
        verbose_name: "Title",
        default: "",
      },
      slug: {
        type: FieldType.SlugField,
        verbose_name: "Slug",
        default: "",
        max_length: 50,
      },
    },
  };
}

function makeDiscover(model: Model) {
  return {
    dashboard: { widgets: [] },
    extensions: [],
    model_groups: [],
    models: [model],
    user_model: "auth.User",
    multitenancy: { enabled: false, tenant_model: null },
    media_library: {
      enabled: false,
      folders: false,
      models: { media_model: null, folder_model: null },
    },
  };
}

function renderEditor(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/content/:model/new", element: <ContentEditorPage /> },
      { path: "/content/:model/:id", element: <ContentEditorPage /> },
    ],
    { initialEntries: [path] },
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ConfirmDialogProvider>
        <RouterProvider router={router} />
      </ConfirmDialogProvider>
    </QueryClientProvider>,
  );

  return router;
}

function mockApi() {
  httpMock.get.mockImplementation((url: string) => {
    if (url === "/content/testapp.article/7/duplicate") {
      return Promise.resolve({
        data: {
          initial: { title: "Hello", slug: "hello-2" },
          source: { id: 7, __str__: "Hello" },
        },
      });
    }

    if (url === "/content/testapp.article/7") {
      return Promise.resolve({
        data: { id: 7, title: "Hello", slug: "hello", __str__: "Hello" },
      });
    }

    return Promise.resolve({ data: [] });
  });
}

function badRequest(data: unknown) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("Request failed", "400", config, null, {
    status: 400,
    statusText: "",
    headers: {},
    config,
    data,
  });
}

async function save() {
  const user = userEvent.setup();
  renderEditor("/content/testapp.article/7");
  await screen.findByDisplayValue("hello");
  await user.click(screen.getByRole("button", { name: "common.save" }));
  return user;
}

describe("Model validation errors", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useDiscoverMock.mockReturnValue({ data: makeDiscover(makeModel()) });
    mockApi();
  });

  it("shows non-field errors above the form", async () => {
    httpMock.put.mockRejectedValue(
      badRequest({
        non_field_errors: ["The slug must start with the title.", "Not now."],
        title: ["Too short."],
      }),
    );

    await save();

    const alert = await screen.findByTestId("non-field-errors");
    expect(
      within(alert).getByText("The slug must start with the title."),
    ).toBeInTheDocument();
    expect(within(alert).getByText("Not now.")).toBeInTheDocument();
    expect(screen.getByText("Too short.")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalled();
  });

  it("clears them when the next save succeeds", async () => {
    httpMock.put.mockRejectedValueOnce(
      badRequest({ non_field_errors: ["Not now."] }),
    );
    httpMock.put.mockResolvedValueOnce({
      data: { id: 7, title: "Hello", slug: "hello", __str__: "Hello" },
    });

    const user = await save();
    await screen.findByTestId("non-field-errors");

    await user.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() =>
      expect(screen.queryByTestId("non-field-errors")).not.toBeInTheDocument(),
    );
    expect(httpMock.put).toHaveBeenCalledTimes(2);
  });
});
