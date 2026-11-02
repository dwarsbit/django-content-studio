import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { widgetRefetchInterval } from "@/pages/(studio)/(dashboard)/_components/refresh";
import { CatchAllPage } from "@/pages/(studio)/[...slug]/page";
import { type DashboardWidget, ExtensionType } from "@/types";

const useDiscoverMock = vi.hoisted(() => vi.fn());
const httpMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/hooks/use-discover", () => ({ useDiscover: useDiscoverMock }));
vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const widget = {
  widget_id: "w-1",
  widget_type: "StatisticWidget",
  name: "QueueLength",
  col_span: 1,
  refresh_interval: 5,
} as DashboardWidget;

function renderAt(url: string) {
  useDiscoverMock.mockReturnValue({
    data: {
      extensions: [
        {
          extension_id: "page-1",
          extension_type: ExtensionType.DashboardPage,
          config: {
            path: "queue/",
            title: "Task queue",
            description: "Live queue stats",
            widgets: [widget],
          },
        },
      ],
    },
  });

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

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    httpMock.get.mockResolvedValue({ data: { title: "Queued", value: 7 } });
  });

  it.each(["/queue", "/queue/"])(
    "shows the title, description and widgets at %s",
    async (url) => {
      renderAt(url);

      expect(
        screen.getByRole("heading", { name: "Task queue" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Live queue stats")).toBeInTheDocument();
      expect(await screen.findByText("Queued")).toBeInTheDocument();
      expect(httpMock.get).toHaveBeenCalledWith("/dashboard/widgets/w-1");
    },
  );

  it("is not found at another path", () => {
    renderAt("/other/");

    expect(screen.getByText("app.not_found")).toBeInTheDocument();
  });
});

describe("widgetRefetchInterval", () => {
  it("turns the refresh interval into milliseconds", () => {
    expect(widgetRefetchInterval(widget)).toBe(5000);
  });

  it("refetches on no timer without an interval", () => {
    expect(widgetRefetchInterval({ ...widget, refresh_interval: null })).toBe(
      false,
    );
    expect(
      widgetRefetchInterval({ ...widget, refresh_interval: undefined }),
    ).toBe(false);
  });
});
