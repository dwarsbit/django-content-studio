import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDownloadErrorMessage, getDownloadFilename } from "@/lib/download";
import { ModelListPage } from "@/pages/(studio)/content/[model]/page";
import { ContentTrashPage } from "@/pages/(studio)/content/[model]/trash/page";
import type {
  BulkAction,
  ExportFormat,
  Model,
  PaginatedResponse,
  Resource,
} from "@/types";
import { FieldType } from "@/types";

const httpGetMock = vi.hoisted(() => vi.fn());
const httpPostMock = vi.hoisted(() => vi.fn());
const useDiscoverMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => ({ get: httpGetMock, post: httpPostMock }),
}));

vi.mock("@/hooks/use-confirm-dialog", () => ({
  default: () => vi.fn(),
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: useDiscoverMock,
}));

vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: () => ({ data: undefined }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

// See list-view.test.tsx: the vendor pagination is stubbed.
vi.mock("react-paginate", () => ({
  default: { default: () => null },
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
window.HTMLElement.prototype.setPointerCapture = vi.fn();

const exportAction: BulkAction = {
  id: "export",
  label: "Export",
  icon: "ph-bold ph-download-simple",
  confirm: null,
  destructive: false,
  formats: ["csv"],
};

function makeModel(
  formats: ExportFormat[] | null,
  actions: BulkAction[] = [],
): Model {
  return {
    label: "testapp.event",
    verbose_name: "Event",
    verbose_name_plural: "Events",
    tenant_field: null,
    admin: {
      is_singleton: false,
      icon: null,
      list: {
        per_page: 10,
        description: "",
        display: [{ name: "title", header: null, format: null }],
        search: true,
        filter: [],
        sortable_by: null,
        trash: true,
        export: formats ? { formats } : null,
        actions,
      },
      edit: { main: [], sidebar: [], inlines: [] },
      permissions: {
        add_permission: true,
        change_permission: true,
        delete_permission: true,
        view_permission: true,
      },
    },
    fields: { title: { type: FieldType.CharField, verbose_name: "Title" } },
  };
}

const events: Resource[] = [
  { id: "1", __str__: "Spring concert", title: "Spring concert" },
  { id: "2", __str__: "Summer fair", title: "Summer fair" },
];

function paginated(results: Resource[]): PaginatedResponse<Resource> {
  return {
    pagination: { count: results.length, current: 1, pages: 1 },
    results,
  };
}

const download = {
  data: new Blob(["title\n"]),
  headers: {
    "content-disposition": 'attachment; filename="events-2026-10-28.csv"',
  },
};

function renderPage(model: Model, path = "/content/testapp.event") {
  useDiscoverMock.mockReturnValue({ data: { models: [model] } });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/content/:model" element={<ModelListPage />} />
          <Route path="/content/:model/trash" element={<ContentTrashPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("getDownloadFilename", () => {
  it("reads the quoted file name", () => {
    expect(
      getDownloadFilename('attachment; filename="events.csv"', "x.csv"),
    ).toBe("events.csv");
  });

  it("prefers the encoded file name", () => {
    expect(
      getDownloadFilename(
        "attachment; filename*=utf-8''caf%C3%A9s.csv",
        "x.csv",
      ),
    ).toBe("cafés.csv");
  });

  it("reads an unquoted file name", () => {
    expect(getDownloadFilename("attachment; filename=events.csv", "x")).toBe(
      "events.csv",
    );
  });

  it("falls back without a header", () => {
    expect(getDownloadFilename(undefined, "event.csv")).toBe("event.csv");
    expect(getDownloadFilename("attachment", "event.csv")).toBe("event.csv");
  });
});

describe("getDownloadErrorMessage", () => {
  it("reads the detail from a blob body", async () => {
    const error = {
      response: {
        data: new Blob([JSON.stringify({ detail: "Not allowed." })]),
      },
    };

    expect(await getDownloadErrorMessage(error)).toBe("Not allowed.");
  });

  it("reads the first message of a list", async () => {
    const error = {
      response: { data: new Blob([JSON.stringify(["Unknown format."])]) },
    };

    expect(await getDownloadErrorMessage(error)).toBe("Unknown format.");
  });

  it("falls back for other bodies", async () => {
    expect(
      await getDownloadErrorMessage({ response: { data: new Blob(["<h1>"]) } }),
    ).toBe("Error");
    expect(await getDownloadErrorMessage(new Error("network"))).toBe("Error");
  });
});

describe("export", () => {
  const createObjectURL = vi.fn(() => "blob:export");
  const click = vi.fn();
  let downloads: string[] = [];

  beforeEach(() => {
    httpGetMock.mockReset();
    httpPostMock.mockReset();
    toastErrorMock.mockReset();
    localStorage.clear();
    downloads = [];
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      click();
      downloads.push(this.download);
    });
    httpGetMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/export") ? download : { data: paginated(events) },
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function exportCall() {
    return httpGetMock.mock.calls.find(([url]) =>
      (url as string).endsWith("/export"),
    ) as [string, { params: Record<string, unknown>; responseType: string }];
  }

  it("offers no export when the studio does not", async () => {
    renderPage(makeModel(null));

    await screen.findByText("Spring concert");

    expect(
      screen.queryByRole("button", { name: "export.button" }),
    ).not.toBeInTheDocument();
  });

  it("downloads the list with its search, filters and ordering", async () => {
    const user = userEvent.setup();
    localStorage.setItem("__dcs_list_ordering__:testapp.event", "-title");
    renderPage(makeModel(["csv"]), "/content/testapp.event?search=spring");

    await screen.findByText("Spring concert");
    await user.click(screen.getByRole("button", { name: "export.button" }));

    await waitFor(() => expect(downloads).toEqual(["events-2026-10-28.csv"]));
    const [url, config] = exportCall();
    expect(url).toBe("/content/testapp.event/export");
    expect(config.responseType).toBe("blob");
    expect(config.params).toMatchObject({
      search: "spring",
      ordering: "-title",
      export_format: "csv",
    });
    expect(config.params.page).toBeUndefined();
  });

  it("offers the formats in a menu when Excel is available", async () => {
    const user = userEvent.setup();
    renderPage(makeModel(["csv", "xlsx"]));

    await screen.findByText("Spring concert");
    await user.click(screen.getByRole("button", { name: "export.button" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "export.xlsx" }),
    );

    await waitFor(() => expect(exportCall()).toBeDefined());
    expect(exportCall()[1].params.export_format).toBe("xlsx");
  });

  it("shows the server's message when the download fails", async () => {
    const user = userEvent.setup();
    httpGetMock.mockImplementation((url: string) =>
      url.endsWith("/export")
        ? Promise.reject({
            response: {
              data: new Blob([JSON.stringify({ detail: "No export." })]),
            },
          })
        : Promise.resolve({ data: paginated(events) }),
    );
    renderPage(makeModel(["csv"]));

    await screen.findByText("Spring concert");
    await user.click(screen.getByRole("button", { name: "export.button" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("No export."),
    );
    expect(downloads).toEqual([]);
  });

  it("exports the selected rows through the bulk bar", async () => {
    const user = userEvent.setup();
    httpPostMock.mockResolvedValue(download);
    renderPage(makeModel(["csv"], [exportAction]));

    await screen.findByText("Spring concert");
    await user.click(screen.getAllByRole("checkbox")[2]);
    // The built-in's label comes from the admin's own translations.
    const bar = document.querySelector<HTMLElement>("[data-slot=bulk-bar]")!;
    await user.click(
      within(bar).getByRole("button", { name: "export.button" }),
    );

    await waitFor(() =>
      expect(httpPostMock).toHaveBeenCalledWith(
        "/content/testapp.event/bulk",
        { action: "export", ids: ["2"], export_format: "csv" },
        { params: { ordering: undefined }, responseType: "blob" },
      ),
    );
    await waitFor(() => expect(downloads).toEqual(["events-2026-10-28.csv"]));
    // The selection stays for further actions.
    expect(screen.getByText("bulk.selected")).toBeInTheDocument();
  });

  it("exports the trash from the trash page", async () => {
    const user = userEvent.setup();
    httpGetMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/export") ? download : { data: paginated(events) },
      ),
    );
    renderPage(makeModel(["csv"]), "/content/testapp.event/trash");

    await user.click(
      await screen.findByRole("button", { name: "export.button" }),
    );

    await waitFor(() => expect(exportCall()).toBeDefined());
    expect(exportCall()[1].params).toMatchObject({
      export_format: "csv",
      export_scope: "trash",
    });
  });
});
