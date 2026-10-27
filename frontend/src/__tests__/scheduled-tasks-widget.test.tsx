import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScheduledTasksWidget } from "@/pages/(studio)/(dashboard)/_components/scheduled-tasks-widget";
import type { DashboardWidget } from "@/types";

const httpMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const widget = {
  widget_id: "w-1",
  widget_type: "ScheduledTasksWidget",
  name: "WebhookDeliveriesWidget",
  col_span: 2,
} as DashboardWidget;

function renderWidget(tasks: object[]) {
  httpMock.get.mockResolvedValue({
    data: { title: "Webhooks", description: "Latest deliveries", tasks },
  });

  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ScheduledTasksWidget widget={widget} />
    </QueryClientProvider>,
  );
}

describe("ScheduledTasksWidget", () => {
  beforeEach(() => vi.clearAllMocks());

  it("leaves out unknown values instead of showing them broken", async () => {
    renderWidget([
      {
        title: "Rebuild the blog",
        description: "https://example.com/hook",
        last_run_at: null,
        next_run_at: null,
        duration: null,
        status: "SCHEDULED",
        error_message: null,
      },
    ]);

    expect(await screen.findByText("Rebuild the blog")).toBeInTheDocument();
    expect(screen.queryByText(/null/)).toBeNull();
    expect(screen.queryByText(/Invalid/)).toBeNull();
    expect(
      screen.queryByText(/dashboard.widgets.scheduled_tasks.next/),
    ).toBeNull();
  });

  it("shows the error of a failed task", async () => {
    renderWidget([
      {
        title: "Rebuild the blog",
        description: "https://example.com/hook",
        last_run_at: "2026-10-27T09:30:12+00:00",
        next_run_at: null,
        duration: null,
        status: "FAILURE",
        error_message: "The webhook responded with 503.",
      },
    ]);

    expect(
      await screen.findByText("The webhook responded with 503."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("dashboard.widgets.scheduled_tasks.status.FAILURE"),
    ).toBeInTheDocument();
  });
});
