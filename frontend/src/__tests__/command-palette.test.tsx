import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "@/components/command-palette";
import type { Model } from "@/types";

const httpMock = vi.hoisted(() => ({ get: vi.fn() }));
const useDiscoverMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const logoutMock = vi.hoisted(() => vi.fn());
const setThemeMock = vi.hoisted(() => vi.fn());

// jsdom does not implement scrolling, which cmdk calls for the
// highlighted item.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => httpMock,
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: useDiscoverMock,
}));

vi.mock("@/auth", () => ({
  useAuth: () => ({ logout: logoutMock }),
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "light", setTheme: setThemeMock }),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNavigate: () => navigateMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options && "model" in options ? `${key}:${options.model}` : key,
    i18n: { language: "en" },
  }),
}));

function makeModel(
  label: string,
  overrides: Partial<Model["admin"]> = {},
): Model {
  return {
    label,
    verbose_name: label.split(".")[1],
    verbose_name_plural: label.split(".")[1],
    tenant_field: null,
    admin: {
      is_singleton: false,
      icon: null,
      list: {
        per_page: 10,
        description: "",
        display: [],
        search: true,
        filter: [],
        sortable_by: null,
        actions: [],
      },
      edit: { main: [], sidebar: [], inlines: [] },
      permissions: {
        add_permission: true,
        change_permission: true,
        delete_permission: true,
        view_permission: true,
      },
      ...overrides,
    },
    fields: {},
  };
}

const article = makeModel("testapp.article", {
  list: { ...makeModel("x").admin.list, trash: true },
});
const category = makeModel("testapp.category", {
  permissions: {
    add_permission: false,
    change_permission: true,
    delete_permission: true,
    view_permission: true,
  },
});

function makeDiscover(models: Model[]) {
  return {
    dashboard: { widgets: [] },
    extensions: [],
    model_groups: [],
    models,
    user_model: "auth.User",
    multitenancy: { enabled: false, tenant_model: null },
    media_library: {
      enabled: true,
      folders: false,
      models: { media_model: null, folder_model: null },
    },
  };
}

function renderPalette(open = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CommandPalette open={open} onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDiscoverMock.mockReturnValue({
      data: makeDiscover([article, category]),
    });
    httpMock.get.mockReset();
    httpMock.get.mockResolvedValue({ data: [] });
  });

  it("offers navigation, create and trash entries with permission gating", async () => {
    renderPalette();

    // Navigation: dashboard, media library and both models.
    expect(await screen.findByText("main_menu.dashboard")).toBeInTheDocument();
    expect(screen.getByText("main_menu.media_library")).toBeInTheDocument();
    expect(screen.getByText("article")).toBeInTheDocument();
    expect(screen.getByText("category")).toBeInTheDocument();

    // Create: only models with add permission.
    expect(screen.getByText("palette.create_item:article")).toBeInTheDocument();
    expect(
      screen.queryByText("palette.create_item:category"),
    ).not.toBeInTheDocument();

    // Trash: only models with soft delete configured.
    expect(screen.getByText("palette.trash_item:article")).toBeInTheDocument();
    expect(
      screen.queryByText("palette.trash_item:category"),
    ).not.toBeInTheDocument();

    // Theme and logout are offered too.
    expect(screen.getByText("palette.theme_light")).toBeInTheDocument();
    expect(screen.getByText("palette.logout")).toBeInTheDocument();
  });

  it("navigates on select and closes", async () => {
    const onOpenChange = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <CommandPalette open onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.click(await screen.findByText("article"));

    expect(navigateMock).toHaveBeenCalledWith("/content/testapp.article");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("filters static entries as the term is typed", async () => {
    renderPalette();
    const user = userEvent.setup();

    await user.type(
      await screen.findByPlaceholderText("palette.placeholder"),
      "cate",
    );

    expect(screen.queryByText("article")).not.toBeInTheDocument();
    expect(screen.getByText("category")).toBeInTheDocument();
    // A term under the search length does not hit the endpoint.
    expect(httpMock.get).not.toHaveBeenCalled();
  });

  it("searches objects through the search endpoint when the term is long enough", async () => {
    httpMock.get.mockResolvedValue({
      data: [
        {
          model: "testapp.article",
          verbose_name: "articles",
          icon: null,
          results: [{ id: "7", title: "Needle in an article" }],
        },
      ],
    });
    renderPalette();
    const user = userEvent.setup();

    await user.type(
      await screen.findByPlaceholderText("palette.placeholder"),
      "needle",
    );

    // The query is debounced.
    await waitFor(
      () =>
        expect(httpMock.get).toHaveBeenCalledWith("/search", {
          params: { search: "needle" },
        }),
      { timeout: 2000 },
    );

    const item = await screen.findByText("Needle in an article");
    await user.click(item);

    expect(navigateMock).toHaveBeenCalledWith("/content/testapp.article/7");
  });

  it("runs logout and theme actions", async () => {
    renderPalette();
    const user = userEvent.setup();

    await user.click(await screen.findByText("palette.theme_dark"));
    expect(setThemeMock).toHaveBeenCalledWith("dark");

    await user.click(await screen.findByText("palette.logout"));
    expect(logoutMock).toHaveBeenCalled();
  });
});
