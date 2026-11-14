import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({
  toast: toastMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { object?: string; name?: string }) =>
      options?.name
        ? `${key}:${options.name}`
        : options?.object
          ? `${key}:${options.object}`
          : key,
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
    label: "auth.user",
    verbose_name: "User",
    verbose_name_plural: "Users",
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

function mockApi(canSetPassword?: boolean) {
  httpMock.get.mockImplementation((url: string) => {
    if (url === "/content/auth.user/7") {
      return Promise.resolve({
        data: {
          id: 7,
          title: "maya",
          slug: "maya-lindqvist",
          __str__: "maya",
          ...(canSetPassword === undefined
            ? {}
            : { __user__: { can_set_password: canSetPassword } }),
        },
      });
    }

    return Promise.resolve({ data: [] });
  });
}

async function openDialog() {
  const user = userEvent.setup();
  renderEditor("/content/auth.user/7");
  await screen.findByDisplayValue("maya-lindqvist");
  await user.click(screen.getByRole("button", { name: "editor.more_actions" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "users.set_password.menu" }),
  );
  await screen.findByRole("dialog");

  return user;
}

describe("Set password", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useDiscoverMock.mockReturnValue({ data: makeDiscover(makeModel()) });
  });

  it("is offered when the user may set the password", async () => {
    mockApi(true);
    const user = userEvent.setup();
    renderEditor("/content/auth.user/7");
    await screen.findByDisplayValue("maya-lindqvist");

    await user.click(
      screen.getByRole("button", { name: "editor.more_actions" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "users.set_password.menu" }),
    ).toBeInTheDocument();
  });

  it("is not offered otherwise", async () => {
    mockApi(false);
    const user = userEvent.setup();
    renderEditor("/content/auth.user/7");
    await screen.findByDisplayValue("maya-lindqvist");

    await user.click(
      screen.getByRole("button", { name: "editor.more_actions" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "editor.duplicate" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "users.set_password.menu" }),
    ).toBeNull();
  });

  it("sets the typed password", async () => {
    mockApi(true);
    httpMock.post.mockResolvedValue({ data: null });
    const user = await openDialog();

    await user.type(
      screen.getByLabelText("users.set_password.new"),
      "New-Secret-42",
    );
    await user.type(
      screen.getByLabelText("users.set_password.confirm"),
      "New-Secret-42",
    );
    await user.click(
      screen.getByRole("button", { name: "users.set_password.submit" }),
    );

    await waitFor(() =>
      expect(httpMock.post).toHaveBeenCalledWith(
        "/content/auth.user/7/password",
        { password: "New-Secret-42" },
      ),
    );
    expect(toastMock.success).toHaveBeenCalledWith(
      "users.set_password.done:maya",
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("asks for the same password twice", async () => {
    mockApi(true);
    const user = await openDialog();

    await user.type(screen.getByLabelText("users.set_password.new"), "one");
    await user.type(screen.getByLabelText("users.set_password.confirm"), "two");
    await user.click(
      screen.getByRole("button", { name: "users.set_password.submit" }),
    );

    expect(
      await screen.findByText("users.set_password.mismatch"),
    ).toBeInTheDocument();
    expect(httpMock.post).not.toHaveBeenCalled();
  });

  it("shows the validators' messages", async () => {
    mockApi(true);
    httpMock.post.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { password: ["This password is too common."] },
      },
    });
    const user = await openDialog();

    await user.type(screen.getByLabelText("users.set_password.new"), "secret");
    await user.type(
      screen.getByLabelText("users.set_password.confirm"),
      "secret",
    );
    await user.click(
      screen.getByRole("button", { name: "users.set_password.submit" }),
    );

    expect(
      await screen.findByText("This password is too common."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("generates a password and shows it", async () => {
    mockApi(true);
    const user = await openDialog();

    await user.click(
      screen.getByRole("button", { name: "users.set_password.generate" }),
    );

    const input = screen.getByLabelText(
      "users.set_password.new",
    ) as HTMLInputElement;
    const confirm = screen.getByLabelText(
      "users.set_password.confirm",
    ) as HTMLInputElement;

    expect(input.value).toMatch(/^[a-zA-Z2-9]{5}(-[a-zA-Z2-9]{5}){3}$/);
    expect(confirm.value).toBe(input.value);
    expect(input.type).toBe("text");
    expect(
      screen.getByRole("button", { name: "users.set_password.copy" }),
    ).toBeInTheDocument();
  });
});
