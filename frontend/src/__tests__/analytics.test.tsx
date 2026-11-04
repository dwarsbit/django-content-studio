import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { change, formatDuration } from "@/components/analytics/format";
import { ContentListWidget } from "@/pages/(studio)/(dashboard)/_components/content-list-widget";
import { CatchAllPage } from "@/pages/(studio)/[...slug]/page";
import { type DashboardWidget, ExtensionType } from "@/types";

const useDiscoverMock = vi.hoisted(() => vi.fn());
const httpMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/hooks/use-discover", () => ({ useDiscover: useDiscoverMock }));
vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

const RANGE = {
  start: "2026-10-06T00:00:00+02:00",
  end: "2026-11-05T00:00:00+01:00",
  interval: "day",
};

const config = {
  provider: "Umami",
  metrics: [
    { key: "visitors", label: "Visitors", kind: "number", sign: 1 },
    { key: "pageviews", label: "Pageviews", kind: "number", sign: 1 },
    { key: "bounce_rate", label: "Bounce rate", kind: "percent", sign: -1 },
  ],
  timeseries_metrics: ["visitors", "pageviews"],
  breakdowns: ["pages", "referrers"],
  realtime: true,
  page_path: "analytics/",
};

function discover() {
  useDiscoverMock.mockReturnValue({
    data: {
      extensions: [
        {
          extension_id: "analytics-1",
          extension_type: ExtensionType.AnalyticsExtension,
          config,
        },
        {
          extension_id: "page-1",
          extension_type: ExtensionType.AnalyticsPage,
          config: { path: "analytics/", title: "Analytics", description: "" },
        },
      ],
    },
  });
}

function respond(params: Record<string, string>) {
  const base = { range: RANGE, path: params.path ?? null };

  switch (params.part) {
    case "realtime":
      return { visitors: 3 };
    case "summary":
      return {
        ...base,
        metrics: [
          { key: "visitors", value: 1200, previous: 1000 },
          { key: "pageviews", value: 3400, previous: null },
          { key: "bounce_rate", value: 41.5, previous: 40 },
        ],
        dashboard_url: "https://umami.example.com/websites/1",
      };
    case "timeseries":
      return {
        ...base,
        metric: params.metric,
        points: [{ date: "2026-10-06T00:00:00Z", value: 40, previous: 30 }],
      };
    default:
      return {
        ...base,
        dimension: params.dimension,
        label: params.dimension,
        rows:
          params.dimension === "pages"
            ? [
                {
                  key: "/blog/slow-trains/",
                  label: null,
                  value: 310,
                  object: { model: "blog.post", id: "7", title: "Slow trains" },
                },
              ]
            : [],
      };
  }
}

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="*" element={<CatchAllPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("format", () => {
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(134)).toBe("2m 14s");
    expect(formatDuration(3780)).toBe("1h 3m");
  });

  it("computes the change against the period before", () => {
    expect(change(1200, 1000)).toBe(20);
    expect(change(5, 0)).toBeNull();
    expect(change(5, null)).toBeNull();
  });
});

describe("AnalyticsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    discover();
    httpMock.get.mockImplementation(
      async (_url: string, { params }: { params: Record<string, string> }) => ({
        data: respond(params),
      }),
    );
  });

  it("shows the metrics, the live count and linked top pages", async () => {
    renderAt("/analytics/");

    expect(
      screen.getByRole("heading", { name: "Analytics" }),
    ).toBeInTheDocument();
    expect(
      (await screen.findByText("Slow trains")).closest("a"),
    ).toHaveAttribute("href", "/content/blog.post/7");
    expect(screen.getAllByText("Visitors").length).toBeGreaterThan(0);
    expect(httpMock.get).toHaveBeenCalledWith("/analytics", {
      params: { part: "summary", range: "30d" },
    });
    expect(httpMock.get).toHaveBeenCalledWith("/analytics", {
      params: { part: "realtime" },
    });
    expect(
      await screen.findByRole("link", { name: /analytics.open_in/ }),
    ).toHaveAttribute("href", "https://umami.example.com/websites/1");
  });

  it("filters the report to a page from the URL", async () => {
    renderAt("/analytics/?path=/blog/&range=7d");

    expect(await screen.findByText("/blog/")).toBeInTheDocument();
    expect(httpMock.get).toHaveBeenCalledWith("/analytics", {
      params: { part: "summary", path: "/blog/", range: "7d" },
    });
    // No live count for a single page.
    expect(httpMock.get).not.toHaveBeenCalledWith("/analytics", {
      params: { part: "realtime" },
    });
  });

  it("explains when the provider is unavailable", async () => {
    httpMock.get.mockRejectedValue(new Error("502"));
    renderAt("/analytics/");

    await waitFor(() =>
      expect(screen.getByText("analytics.error")).toBeInTheDocument(),
    );
    expect(screen.getByText("analytics.retry")).toBeInTheDocument();
  });
});

describe("ContentListWidget for analytics", () => {
  it("shows plain rows with a value and a view-all link", async () => {
    useDiscoverMock.mockReturnValue({ data: null });
    httpMock.get.mockResolvedValue({
      data: {
        title: "Top pages",
        view_all: "/analytics/?range=30d",
        content: [
          { model: "", id: "", title: "/about/", value: 120 },
          { model: "blog.post", id: "7", title: "Slow trains", value: 90 },
        ],
      },
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ContentListWidget
            widget={
              {
                widget_id: "w-1",
                widget_type: "ContentListWidget",
                name: "AnalyticsTopPagesWidget",
                col_span: 1,
                refresh_interval: null,
              } as unknown as DashboardWidget
            }
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("/about/")).not.toHaveAttribute("href");
    expect(screen.getByText("Slow trains").closest("a")).toHaveAttribute(
      "href",
      "/content/blog.post/7",
    );
    expect(screen.getByText("120")).toBeInTheDocument();
  });
});
