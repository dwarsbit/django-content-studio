import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialogProvider } from "@/components/confirm-dialog-provider";
import { PresenceAvatars, PresenceIndicator } from "@/components/presence";
import { usePresenceList } from "@/hooks/use-presence";
import { getInitials } from "@/lib/utils";
import { ContentEditorPage } from "@/pages/(studio)/content/[model]/[id]/page";
import type { FormField, Model, PresenceUser } from "@/types";
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
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
}));

const EVA: PresenceUser = {
  id: "2",
  name: "Eva de Jong",
  initials: "",
  avatar: null,
  state: "editing",
};
const NOAH: PresenceUser = {
  id: "3",
  name: "noah",
  initials: "",
  avatar: null,
  state: "viewing",
};

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

function makeModel({ presence = true }: { presence?: boolean } = {}): Model {
  return {
    label: "testapp.article",
    verbose_name: "Article",
    verbose_name_plural: "Articles",
    tenant_field: null,
    admin: {
      is_singleton: false,
      icon: null,
      presence,
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
              { title: "", description: "", fields: [field("title")] },
            ],
          },
        ],
        sidebar: [],
        readonly_fields: [],
        prepopulated_fields: {},
        inlines: [],
      },
      permissions: {
        add_permission: true,
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

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderEditor(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/content/:model/:id", element: <ContentEditorPage /> },
      { path: "/content/:model", element: <div>List</div> },
    ],
    { initialEntries: [path] },
  );

  const view = render(
    <QueryClientProvider client={makeQueryClient()}>
      <ConfirmDialogProvider>
        <RouterProvider router={router} />
      </ConfirmDialogProvider>
    </QueryClientProvider>,
  );

  return { router, ...view };
}

const PRESENCE_URL = "/content/testapp.article/7/presence";

function presenceCalls(state?: string) {
  return httpMock.post.mock.calls.filter(
    ([url, body]) =>
      url === PRESENCE_URL && (state === undefined || body.state === state),
  );
}

describe("Presence on the edit page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    httpMock.get.mockResolvedValue({
      data: { id: 7, title: "Hello", __str__: "Hello" },
    });
    httpMock.post.mockResolvedValue({ data: { users: [EVA, NOAH] } });
    httpMock.delete.mockResolvedValue({});
  });

  it("announces the user and shows the others in the header", async () => {
    useDiscoverMock.mockReturnValue({ data: makeDiscover(makeModel()) });
    renderEditor("/content/testapp.article/7");

    const list = await screen.findByRole("list", { name: "presence.label" });

    expect(list).toHaveTextContent("presence.editing:Eva de Jong");
    expect(list).toHaveTextContent("presence.viewing:noah");
    expect(screen.getByText("EJ")).toBeInTheDocument();
    expect(
      list.querySelector("[data-slot=user-avatar][data-state=editing]"),
    ).toHaveClass("ring-warning");

    const [[, body]] = presenceCalls("viewing");
    expect(body.session).toEqual(expect.any(String));
    expect(body.session.length).toBeGreaterThan(0);
  });

  it("announces editing once the form has unsaved changes", async () => {
    useDiscoverMock.mockReturnValue({ data: makeDiscover(makeModel()) });
    const user = userEvent.setup();
    renderEditor("/content/testapp.article/7");
    const input = await screen.findByDisplayValue("Hello");

    await user.type(input, "!");

    await waitFor(() => expect(presenceCalls("editing")).toHaveLength(1));
    // The same tab keeps its session.
    expect(presenceCalls("editing")[0][1].session).toBe(
      presenceCalls("viewing")[0][1].session,
    );
  });

  it("clears the user's entry when the page is left", async () => {
    useDiscoverMock.mockReturnValue({ data: makeDiscover(makeModel()) });
    const { unmount } = renderEditor("/content/testapp.article/7");
    await waitFor(() => expect(presenceCalls("viewing")).toHaveLength(1));
    const session = presenceCalls("viewing")[0][1].session;

    unmount();

    expect(httpMock.delete).toHaveBeenCalledWith(
      PRESENCE_URL,
      expect.objectContaining({
        params: { session },
        fetchOptions: { keepalive: true },
      }),
    );
  });

  it("stays silent when the studio has no presence", async () => {
    useDiscoverMock.mockReturnValue({
      data: makeDiscover(makeModel({ presence: false })),
    });
    renderEditor("/content/testapp.article/7");
    await screen.findByDisplayValue("Hello");

    expect(presenceCalls()).toHaveLength(0);
    expect(
      screen.queryByRole("list", { name: "presence.label" }),
    ).not.toBeInTheDocument();
  });
});

describe("Presence on the list page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={makeQueryClient()}>
        {children}
      </QueryClientProvider>
    );
  }

  it("asks for the page's objects in one request", async () => {
    httpMock.get.mockResolvedValue({ data: { "7": [EVA] } });

    const { result } = renderHook(
      () => usePresenceList(makeModel(), ["7", "8"]),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toEqual({ "7": [EVA] }));
    expect(httpMock.get).toHaveBeenCalledTimes(1);
    const [url, { params }] = httpMock.get.mock.calls[0];
    expect(url).toBe("/content/testapp.article/presence");
    expect(params.getAll("id")).toEqual(["7", "8"]);
  });

  it("asks nothing without presence or objects", () => {
    renderHook(() => usePresenceList(makeModel({ presence: false }), ["7"]), {
      wrapper,
    });
    renderHook(() => usePresenceList(makeModel(), []), { wrapper });

    expect(httpMock.get).not.toHaveBeenCalled();
  });

  it("marks a row with the users who have it open", () => {
    render(<PresenceIndicator users={[EVA, NOAH]} />);

    expect(
      screen.getByRole("img", {
        name: "presence.editing:Eva de Jong, presence.viewing:noah",
      }),
    ).toBeInTheDocument();
  });

  it("renders nothing when nobody else has the object open", () => {
    const { container } = render(<PresenceIndicator users={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("PresenceAvatars", () => {
  it("collapses the users beyond the maximum into a counter", () => {
    const users = ["Ann", "Bob", "Cas", "Dirk", "Eef"].map(
      (name, index): PresenceUser => ({
        id: String(index),
        name,
        initials: "",
        avatar: null,
        state: "viewing",
      }),
    );

    render(<PresenceAvatars users={users} max={4} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });
});

describe("getInitials", () => {
  it("takes the first and last word, or two letters of one", () => {
    expect(getInitials("Eva de Jong")).toBe("EJ");
    expect(getInitials("noah")).toBe("NO");
    expect(getInitials("  ")).toBe("");
  });
});
