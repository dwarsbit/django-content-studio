import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityLogWidget } from "@/pages/(studio)/(dashboard)/_components/activity-log-widget";
import { ContentListWidget } from "@/pages/(studio)/(dashboard)/_components/content-list-widget";
import { StatisticWidget } from "@/pages/(studio)/(dashboard)/_components/statistic-widget";
import { type DashboardWidget } from "@/types";

const httpMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));
vi.mock("@/hooks/use-discover", () => ({
  useDiscover: () => ({ data: null }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

const widget = (widget_type: string) =>
  ({
    widget_id: "w-1",
    widget_type,
    name: widget_type,
    col_span: 1,
    refresh_interval: null,
  }) as unknown as DashboardWidget;

function renderWidget(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StatisticWidget", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the value compact, with the exact value on hover", async () => {
    httpMock.get.mockResolvedValue({
      data: { title: "Total views", value: 45940 },
    });
    renderWidget(<StatisticWidget widget={widget("StatisticWidget")} />);

    const value = await screen.findByTitle("45,940");
    expect(value).toHaveTextContent("45.9K");
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });

  it("shows the trend with its label, the footnote and the sparkline", async () => {
    httpMock.get.mockResolvedValue({
      data: {
        title: "Published",
        value: 5,
        trend: "25.0",
        trend_sentiment: "positive",
        trend_label: "vs previous 30 days",
        footnote: "3 drafts",
        series: [1, 3, 2, 5],
      },
    });
    const { container } = renderWidget(
      <StatisticWidget widget={widget("StatisticWidget")} />,
    );

    expect(await screen.findByText("25%")).toHaveClass("text-success");
    expect(
      screen.getByText("vs previous 30 days · 3 drafts"),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="sparkline"]'),
    ).toBeInTheDocument();
  });

  it("draws a meter against max_value and honours the format", async () => {
    httpMock.get.mockResolvedValue({
      data: {
        title: "Rating",
        value: 91,
        number_format: "percent",
        max_value: 100,
      },
    });
    renderWidget(<StatisticWidget widget={widget("StatisticWidget")} />);

    expect(await screen.findByTitle("91%")).toHaveTextContent("91%");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "91");
  });
});

describe("ContentListWidget", () => {
  it("shows the optional status, thumbnail and time", async () => {
    httpMock.get.mockResolvedValue({
      data: {
        title: "Latest articles",
        content: [
          {
            model: "blog.article",
            id: "1",
            title: "The last ferry",
            status: "Published",
            status_variant: "success",
            thumbnail: "/media/ferry.jpg",
            timestamp: new Date().toISOString(),
          },
          { model: "blog.article", id: "2", title: "Bare item" },
        ],
      },
    });
    const { container } = renderWidget(
      <ContentListWidget widget={widget("ContentListWidget")} />,
    );

    expect(await screen.findByText("Published")).toHaveClass("text-success");
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelectorAll("time")).toHaveLength(1);
    expect(screen.getByText("Bare item")).toBeInTheDocument();
  });
});

describe("ActivityLogWidget", () => {
  it("groups by day and uses the user's initials", async () => {
    httpMock.get.mockResolvedValue({
      data: [
        {
          id: 1,
          action_flag: 1,
          action_time: new Date().toISOString(),
          object_id: "1",
          object_model: "blog.article",
          object_repr: "Slow trains",
          user: { __str__: "Maya Lindqvist" },
        },
      ],
    });
    renderWidget(<ActivityLogWidget widget={widget("ActivityLogWidget")} />);

    expect(
      await screen.findByText("dashboard.widgets.activity_log.today"),
    ).toBeInTheDocument();
    expect(screen.getByText("ML")).toBeInTheDocument();
  });
});
