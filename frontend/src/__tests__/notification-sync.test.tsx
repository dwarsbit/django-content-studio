import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationSync } from "@/components/notifications/sync";
import {
  announceChange,
  isPollLeader,
  setPollLeader,
  syncName,
  TAB_ID,
} from "@/lib/notification-sync";
import { NotificationsWidget } from "@/pages/(studio)/(dashboard)/_components/notifications-widget";
import { DashboardWidgetType } from "@/types";

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));
vi.mock("@/hooks/use-discover", () => ({
  useDiscover: () => ({
    data: {
      notifications: { enabled: true, retention: 90 },
      models: [
        {
          label: "blog.article",
          verbose_name: "article",
          verbose_name_plural: "articles",
          admin: { is_singleton: false },
        },
      ],
    },
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.count !== undefined ? `${key}:${options.count}` : key,
  }),
}));

// A Web Locks stand-in: the lock is granted unless another tab holds it.
function mockLocks({ heldElsewhere = false } = {}) {
  const lock = {
    requests: 0,
    releases: 0,
    aborts: 0,
  };

  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request(
        _name: string,
        options: { signal: AbortSignal },
        callback: () => Promise<void>,
      ) {
        lock.requests += 1;

        return new Promise<void>((resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            lock.aborts += 1;
            reject(new DOMException("Aborted", "AbortError"));
          });

          if (!heldElsewhere) {
            callback().then(() => {
              lock.releases += 1;
              resolve();
            });
          }
        });
      },
    },
  });

  return lock;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function renderWithClient(element: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter([{ path: "/", element }]);

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

// Another tab: a channel of its own, recording what it hears.
function otherTab() {
  const channel = new BroadcastChannel(syncName(""));
  const heard: unknown[] = [];
  channel.onmessage = (event) => heard.push(event.data);

  return { channel, heard };
}

let status = { unread: 0, latest: null as string | null };

beforeEach(() => {
  vi.clearAllMocks();
  status = { unread: 2, latest: "2026-11-02T10:00:00Z" };
  httpMock.get.mockImplementation(async (url: string) => {
    if (url === "/notifications/status") {
      return { data: status };
    }

    if (url.startsWith("/dashboard/widgets/")) {
      return {
        data: {
          title: "Notifications",
          description: "Your latest notifications",
          unread: 1,
          results: [
            {
              id: 1,
              event: "content.updated",
              level: "info",
              actor: { id: 2, name: "Anna", initials: "AN", avatar: null },
              model: "blog.article",
              object_id: "1",
              object_repr: "Article 1",
              exists: true,
              url: "",
              title: "",
              body: "",
              objects: [],
              count: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              read: false,
            },
          ],
        },
      };
    }

    throw new Error(`unexpected GET ${url}`);
  });
  setVisibility("visible");
});

afterEach(() => {
  // @ts-expect-error -- remove the stand-in again
  delete navigator.locks;
  setPollLeader(true);
});

describe("the polling tab", () => {
  it("polls in every tab without Web Locks", async () => {
    renderWithClient(<NotificationSync />);

    await waitFor(() => expect(httpMock.get).toHaveBeenCalled());
    expect(isPollLeader()).toBe(true);
  });

  it("leads while visible and steps down when hidden", async () => {
    const lock = mockLocks();
    renderWithClient(<NotificationSync />);

    await waitFor(() => expect(isPollLeader()).toBe(true));
    expect(lock.requests).toBe(1);

    act(() => setVisibility("hidden"));
    expect(isPollLeader()).toBe(false);
    await waitFor(() => expect(lock.releases).toBe(1));

    act(() => setVisibility("visible"));
    await waitFor(() => expect(isPollLeader()).toBe(true));
    expect(lock.requests).toBe(2);
  });

  it("follows while another tab holds the lock, and stops waiting when hidden", async () => {
    const lock = mockLocks({ heldElsewhere: true });
    renderWithClient(<NotificationSync />);

    await waitFor(() => expect(lock.requests).toBe(1));
    expect(isPollLeader()).toBe(false);

    act(() => setVisibility("hidden"));
    expect(lock.aborts).toBe(1);
  });

  it("shares its polls with the other tabs while it leads", async () => {
    mockLocks();
    const other = otherTab();
    renderWithClient(<NotificationSync />);

    await waitFor(() =>
      expect(other.heard).toContainEqual({
        type: "status",
        from: TAB_ID,
        status,
      }),
    );
    other.channel.close();
  });

  it("takes the leading tab's status instead of polling", async () => {
    mockLocks({ heldElsewhere: true });
    const other = otherTab();
    const { queryClient } = renderWithClient(<NotificationSync />);

    await waitFor(() => expect(httpMock.get).toHaveBeenCalledTimes(1));
    other.channel.postMessage({
      type: "status",
      from: "another-tab",
      status: { unread: 7, latest: "2026-11-02T11:00:00Z" },
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(["notifications", "", "status"])).toEqual(
        { unread: 7, latest: "2026-11-02T11:00:00Z" },
      ),
    );
    // A follower does not share what it was told.
    expect(other.heard).toHaveLength(0);
    other.channel.close();
  });

  it("reloads when another tab changed the notifications", async () => {
    mockLocks({ heldElsewhere: true });
    renderWithClient(<NotificationSync />);

    await waitFor(() => expect(httpMock.get).toHaveBeenCalledTimes(1));
    const other = new BroadcastChannel(syncName(""));
    other.postMessage({ type: "changed", from: "another-tab" });

    await waitFor(() => expect(httpMock.get).toHaveBeenCalledTimes(2));
    other.close();
  });

  it("announces a change to the other tabs", async () => {
    const other = otherTab();
    announceChange("");

    await waitFor(() =>
      expect(other.heard).toContainEqual({ type: "changed", from: TAB_ID }),
    );
    other.channel.close();
  });
});

describe("the dashboard widget", () => {
  it("shows the latest notifications and the unread count", async () => {
    renderWithClient(
      <NotificationsWidget
        widget={{
          name: "NotificationsWidget",
          widget_type: DashboardWidgetType.NotificationsWidget,
          widget_id: "w1",
          col_span: 2,
        }}
      />,
    );

    expect(
      await screen.findByRole("link", {
        name: /notifications\.content\.updated.*notifications\.unread/,
      }),
    ).toHaveAttribute("href", "/content/blog.article/1");
    expect(
      await screen.findByLabelText("notifications.widget_unread:2"),
    ).toHaveTextContent("2");
    expect(
      screen.getByRole("button", { name: "notifications.mark_all_read" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("link", { name: /dashboard\.view_all/ }),
    ).toHaveAttribute("href", "/notifications");
  });
});
