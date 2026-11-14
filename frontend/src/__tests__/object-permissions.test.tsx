import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
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

function mockApi(permissions?: { change: boolean; delete: boolean }) {
  httpMock.get.mockImplementation((url: string) => {
    if (url === "/content/testapp.article/7") {
      return Promise.resolve({
        data: {
          id: 7,
          title: "Hello",
          slug: "hello",
          __str__: "Hello",
          ...(permissions ? { __permissions__: permissions } : {}),
        },
      });
    }

    return Promise.resolve({ data: [] });
  });
}

// The studio may allow the model but refuse one object
// (has_change_permission / has_delete_permission with the object): the
// object's detail carries its own permissions.
describe("Per-object permissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useDiscoverMock.mockReturnValue({ data: makeDiscover(makeModel()) });
  });

  it("edits an object the user may change", async () => {
    mockApi({ change: true, delete: true });
    const user = userEvent.setup();
    renderEditor("/content/testapp.article/7");
    await screen.findByDisplayValue("hello");

    expect(
      screen.getByRole("button", { name: "common.save" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "editor.more_actions" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "common.delete" }),
    ).toBeInTheDocument();
  });

  it("only shows an object the user may not change", async () => {
    mockApi({ change: false, delete: true });
    renderEditor("/content/testapp.article/7");
    await screen.findByText("hello");

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "common.save" })).toBeNull();
  });

  it("offers no Delete for an object the user may not delete", async () => {
    mockApi({ change: true, delete: false });
    const user = userEvent.setup();
    renderEditor("/content/testapp.article/7");
    await screen.findByDisplayValue("hello");
    expect(
      screen.getByRole("button", { name: "common.save" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "editor.more_actions" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "editor.duplicate" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "common.delete" }),
    ).toBeNull();
  });

  it("keeps the model's permissions when the object carries none", async () => {
    mockApi();
    renderEditor("/content/testapp.article/7");
    await screen.findByDisplayValue("hello");

    expect(
      screen.getByRole("button", { name: "common.save" }),
    ).toBeInTheDocument();
  });
});
