import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationsMenuItem } from "@/components/notifications/menu-item";
import { NotificationToasts } from "@/components/notifications/toasts";
import { setToastsEnabled } from "@/hooks/use-notifications";
import { NotificationsPage } from "@/pages/(studio)/notifications/page";
import { NotificationSettingsPage } from "@/pages/(studio)/notifications/settings/page";

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  }),
);

vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));
vi.mock("@/hooks/use-discover", () => ({
  useDiscover: () => ({
    data: {
      notifications: { enabled: true, retention: 90, unread_retention: null },
      model_groups: [
        {
          name: "blog",
          label: "Blog",
          models: ["blog.article", "blog.settings"],
        },
      ],
      models: [
        {
          label: "blog.article",
          verbose_name: "article",
          verbose_name_plural: "articles",
          admin: { is_singleton: false },
        },
        {
          label: "blog.settings",
          verbose_name: "site settings",
          verbose_name_plural: "site settings",
          admin: { is_singleton: true },
        },
      ],
    },
  }),
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.count !== undefined ? `${key}:${options.count}` : key,
  }),
}));

function notification(id: number, fields: Record<string, unknown> = {}) {
  return {
    id,
    event: "content.updated",
    level: "info",
    actor: { id: 2, name: "Anna de Vries", initials: "AV", avatar: null },
    model: "blog.article",
    object_id: String(id),
    object_repr: `Article ${id}`,
    exists: true,
    url: "",
    title: "",
    body: "",
    objects: [],
    count: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    read: false,
    ...fields,
  };
}

function renderWithRouter(element: React.ReactElement, path = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: "/", element },
      { path: "*", element: <div>elsewhere</div> },
    ],
    { initialEntries: [path] },
  );

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

let status = { unread: 0, latest: null as string | null };
let list: ReturnType<typeof notification>[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  status = { unread: 0, latest: null };
  list = [];
  setToastsEnabled(true);
  httpMock.get.mockImplementation(
    async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === "/notifications/status") {
        return { data: status };
      }

      if (url === "/notifications") {
        const filter = config?.params?.filter;
        return {
          data: {
            results: filter === "all" ? list : list.filter((n) => !n.read),
            next: null,
          },
        };
      }

      throw new Error(`unexpected GET ${url}`);
    },
  );
  httpMock.post.mockResolvedValue({ data: { unread: 0 } });
});

afterEach(() => {
  focusManager.setFocused(undefined);
  vi.useRealTimers();
});

describe("the main menu item", () => {
  it("puts the unread count in its name and hides the badge", async () => {
    status = { unread: 4, latest: new Date().toISOString() };
    renderWithRouter(<NotificationsMenuItem collapsed={false} />);

    const item = await screen.findByRole("button", {
      name: "notifications.label_unread:4",
    });
    const badge = within(item).getByTestId("notifications-badge");

    expect(badge).toHaveTextContent("4");
    expect(badge).toHaveAttribute("aria-hidden");
  });

  it("shows 99+ beyond 99", async () => {
    status = { unread: 150, latest: new Date().toISOString() };
    renderWithRouter(<NotificationsMenuItem collapsed={false} />);

    expect(await screen.findByTestId("notifications-badge")).toHaveTextContent(
      "99+",
    );
  });

  it("is named Notifications without unread ones", async () => {
    renderWithRouter(<NotificationsMenuItem collapsed={false} />);

    await waitFor(() => expect(httpMock.get).toHaveBeenCalled());
    expect(
      screen.getByRole("button", { name: "notifications.title" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("notifications-badge")).toBeNull();
  });
});

describe("the popover", () => {
  it("lists unread notifications, switches to all and marks as read", async () => {
    const user = userEvent.setup();
    list = [notification(1), notification(2, { read: true })];
    status = { unread: 1, latest: list[0].updated_at };
    renderWithRouter(<NotificationsMenuItem collapsed={false} />);

    await user.click(
      await screen.findByRole("button", {
        name: "notifications.label_unread:1",
      }),
    );

    const dialog = await screen.findByRole("dialog");
    // One accessible sentence per row, unread ones say so.
    const row = await within(dialog).findByRole("link", {
      name: /notifications\.content\.updated.*notifications\.unread/,
    });
    expect(row).toHaveAttribute("href", "/content/blog.article/1");
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(1);

    await user.click(
      within(dialog).getByRole("tab", { name: "notifications.all_tab" }),
    );
    await waitFor(() =>
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(2),
    );
    expect(httpMock.get).toHaveBeenCalledWith(
      "/notifications",
      expect.objectContaining({
        params: expect.objectContaining({ filter: "all" }),
      }),
    );

    await user.click(
      within(dialog).getByRole("button", {
        name: "notifications.mark_read_label",
      }),
    );
    expect(httpMock.post).toHaveBeenCalledWith("/notifications/read", {
      ids: [1],
    });

    await user.click(
      within(dialog).getByRole("button", {
        name: "notifications.mark_all_read",
      }),
    );
    expect(httpMock.post).toHaveBeenCalledWith("/notifications/read", {
      before: status.latest,
    });
  });
});

describe("polling", () => {
  it("polls every 30 seconds, and not while the tab is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithRouter(<NotificationsMenuItem collapsed={false} />);

    const polls = () =>
      httpMock.get.mock.calls.filter(([url]) => url === "/notifications/status")
        .length;

    await waitFor(() => expect(polls()).toBe(1));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(polls()).toBe(2);

    act(() => focusManager.setFocused(false));
    await act(() => vi.advanceTimersByTimeAsync(90_000));
    expect(polls()).toBe(2);
  });
});

describe("toasts", () => {
  // The first poll has answered.
  async function loaded(queryClient: QueryClient) {
    await waitFor(() =>
      expect(
        queryClient.getQueryData(["notifications", "", "status"]),
      ).toBeDefined(),
    );
  }

  async function poll(queryClient: QueryClient, next: typeof status) {
    status = next;
    await act(() =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    );
  }

  it("never toasts the notifications there on load", async () => {
    list = [notification(1)];
    status = { unread: 1, latest: list[0].updated_at };
    renderWithRouter(<NotificationToasts />);

    await waitFor(() => expect(httpMock.get).toHaveBeenCalled());
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("toasts what a later poll brings", async () => {
    status = { unread: 0, latest: null };
    const { queryClient } = renderWithRouter(<NotificationToasts />);
    await loaded(queryClient);

    list = [
      notification(1),
      notification(2, {
        level: "warning",
        event: "blog.failed",
        title: "Build failed",
        model: null,
        object_id: null,
      }),
    ];
    await poll(queryClient, { unread: 2, latest: new Date().toISOString() });

    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
    expect(toastMock.warning).toHaveBeenCalledWith(
      "Build failed",
      expect.anything(),
    );
  });

  it("collapses more than three into one toast", async () => {
    const { queryClient } = renderWithRouter(<NotificationToasts />);
    await loaded(queryClient);

    list = [1, 2, 3, 4, 5].map((id) => notification(id));
    await poll(queryClient, { unread: 5, latest: new Date().toISOString() });

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        "notifications.toast_many:5",
        expect.anything(),
      ),
    );
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when this browser turned toasts off", async () => {
    setToastsEnabled(false);
    const { queryClient } = renderWithRouter(<NotificationToasts />);
    await loaded(queryClient);

    list = [notification(1)];
    await poll(queryClient, { unread: 1, latest: new Date().toISOString() });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(toastMock).not.toHaveBeenCalled();
  });
});

describe("the settings page", () => {
  beforeEach(() => {
    httpMock.get.mockImplementation(async (url: string) => {
      if (url === "/notifications/settings") {
        return {
          data: {
            models: [
              {
                model: "blog.article",
                scope: "all",
                events: {
                  created: false,
                  updated: true,
                  deleted: true,
                  restored: true,
                },
                default: false,
              },
              {
                model: "blog.settings",
                scope: "mine",
                events: { updated: true },
                default: true,
              },
            ],
            events: [
              {
                key: "blog.failed",
                label: "Build failed",
                description: "",
                level: "error",
                required: true,
                enabled: true,
              },
            ],
            follows: [
              {
                model: "blog.article",
                id: "7",
                repr: "Spring menu",
                created_at: new Date().toISOString(),
              },
            ],
          },
        };
      }

      throw new Error(`unexpected GET ${url}`);
    });
    httpMock.put.mockResolvedValue({ data: null });
    httpMock.delete.mockResolvedValue({ data: null });
  });

  it("saves a row of the grid as it changes", async () => {
    const user = userEvent.setup();
    renderWithRouter(<NotificationSettingsPage />);

    await user.click(
      await screen.findByRole("checkbox", {
        name: "notifications.settings.cell_label",
        checked: false,
      }),
    );

    expect(httpMock.put).toHaveBeenCalledWith(
      "/notifications/settings/models/blog.article",
      {
        scope: "all",
        events: { created: true, updated: true, deleted: true, restored: true },
      },
    );
    expect(
      await screen.findByText("notifications.settings.saved"),
    ).toBeInTheDocument();
  });

  it("shows a singleton's Updated only and required events disabled", async () => {
    renderWithRouter(<NotificationSettingsPage />);

    expect(
      await screen.findByText("notifications.settings.one_object"),
    ).toBeInTheDocument();
    // Article: four, site settings: one.
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    expect(screen.getByRole("switch", { name: "Build failed" })).toBeDisabled();
  });

  it("unfollows", async () => {
    const user = userEvent.setup();
    renderWithRouter(<NotificationSettingsPage />);

    await user.click(
      await screen.findByRole("button", {
        name: "notifications.settings.unfollow_label",
      }),
    );

    expect(httpMock.delete).toHaveBeenCalledWith("/notifications/follow", {
      params: { model: "blog.article", id: "7" },
    });
    await waitFor(() => expect(screen.queryByText("Spring menu")).toBeNull());
  });
});

describe("the notifications page", () => {
  // The rows on screen, by where they lead.
  const rows = () =>
    screen
      .queryAllByRole("link", { name: /notifications\.content/ })
      .map((link) => link.getAttribute("href"));

  beforeEach(() => {
    list = [
      notification(1),
      notification(2, { event: "content.deleted", object_repr: "Old menu" }),
    ];
    httpMock.get.mockImplementation(
      async (url: string, config?: { params?: Record<string, unknown> }) => {
        if (url === "/notifications/status") {
          return { data: status };
        }

        if (url === "/notifications/filters") {
          return {
            data: {
              models: ["blog.article"],
              events: [
                { key: "blog.failed", label: "Build failed" },
                { key: "content.deleted", label: null },
              ],
            },
          };
        }

        if (url === "/notifications") {
          const params = config?.params ?? {};
          const results = list.filter(
            (n) =>
              (!params.event || n.event === params.event) &&
              (!params.q ||
                n.object_repr
                  .toLowerCase()
                  .includes(String(params.q).toLowerCase())),
          );
          return { data: { results, next: null } };
        }

        throw new Error(`unexpected GET ${url}`);
      },
    );
  });

  it("sends the filters in the URL with the list request", async () => {
    renderWithRouter(
      <NotificationsPage />,
      "/?search=old&event=content.deleted&model=blog.article",
    );

    await waitFor(() => expect(rows()).toEqual(["/content/blog.article/2"]));
    expect(httpMock.get).toHaveBeenCalledWith("/notifications", {
      params: {
        filter: "unread",
        q: "old",
        model: "blog.article",
        event: "content.deleted",
        offset: 0,
        limit: 20,
      },
    });
    expect(
      screen.getByRole("combobox", { name: "notifications.filters.event" }),
    ).toHaveTextContent("notifications.filters.deleted");
    expect(
      screen.getByRole("combobox", { name: "notifications.filters.model" }),
    ).toHaveTextContent("articles");
  });

  it("searches as the editor types", async () => {
    const user = userEvent.setup();
    renderWithRouter(<NotificationsPage />);

    await waitFor(() => expect(rows()).toHaveLength(2));
    await user.type(screen.getByPlaceholderText("common.search"), "old");

    await waitFor(() => expect(rows()).toEqual(["/content/blog.article/2"]));
  });

  it("offers to clear filters that match nothing", async () => {
    const user = userEvent.setup();
    renderWithRouter(<NotificationsPage />, "/?search=nothing");

    expect(
      await screen.findByText("notifications.empty_filtered_title"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "notifications.clear_filters" }),
    );

    await waitFor(() => expect(rows()).toHaveLength(2));
  });
});

describe("the digest switch", () => {
  function settings(digest: unknown) {
    httpMock.get.mockImplementation(async (url: string) => {
      if (url === "/notifications/settings") {
        return { data: { models: [], events: [], follows: [], digest } };
      }

      throw new Error(`unexpected GET ${url}`);
    });
    httpMock.put.mockResolvedValue({ data: null });
  }

  it("turns the email digest off", async () => {
    settings({ enabled: true, email: "bob@example.com" });
    const user = userEvent.setup();
    renderWithRouter(<NotificationSettingsPage />);

    await user.click(
      await screen.findByRole("switch", {
        name: "notifications.settings.digest_title",
      }),
    );

    expect(httpMock.put).toHaveBeenCalledWith(
      "/notifications/settings/digest",
      { enabled: false },
    );
  });

  it("is disabled without an email address and absent when off", async () => {
    settings({ enabled: true, email: "" });
    const { unmount } = renderWithRouter(<NotificationSettingsPage />);

    expect(
      await screen.findByRole("switch", {
        name: "notifications.settings.digest_title",
      }),
    ).toBeDisabled();
    expect(
      screen.getByText("notifications.settings.digest_no_email"),
    ).toBeInTheDocument();
    unmount();

    settings(null);
    renderWithRouter(<NotificationSettingsPage />);

    expect(
      await screen.findByText("notifications.settings.followed_title"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("switch", {
        name: "notifications.settings.digest_title",
      }),
    ).toBeNull();
  });
});
