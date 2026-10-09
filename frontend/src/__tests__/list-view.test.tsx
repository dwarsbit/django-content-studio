import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModelListPage } from "@/pages/(studio)/content/[model]/page";
import type { Model, ModelField, PaginatedResponse, Resource } from "@/types";
import { FieldType, FieldWidget } from "@/types";

const httpGetMock = vi.hoisted(() => vi.fn());
const useDiscoverMock = vi.hoisted(() => vi.fn());
const useAdminInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => ({ get: httpGetMock }),
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: useDiscoverMock,
}));

vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: useAdminInfoMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// ui/pagination.tsx unwraps a nested `default` from react-paginate's UMD
// build; that shape does not survive vite-node's CommonJS interop in tests,
// so the vendor component is stubbed with the same nested-default shape.
// The app's Pagination wrapper (single-page gate, forcePage, page mapping)
// stays real.
vi.mock("react-paginate", () => {
  const ReactPaginateStub = ({
    pageCount,
    forcePage,
    onPageChange,
  }: {
    pageCount: number;
    forcePage?: number;
    onPageChange(selected: { selected: number }): void;
  }) => (
    <ul role="navigation" aria-label="Pagination">
      {Array.from({ length: pageCount }, (_, index) => (
        <li key={index}>
          <a
            role="button"
            aria-label={`Page ${index + 1}`}
            aria-current={index === forcePage ? "page" : undefined}
            onClick={() => onPageChange({ selected: index })}
          >
            {index + 1}
          </a>
        </li>
      ))}
    </ul>
  );

  return { default: { default: ReactPaginateStub } };
});

window.HTMLElement.prototype.scrollIntoView = vi.fn();

interface ModelOverrides {
  list?: Partial<Model["admin"]["list"]>;
  permissions?: Partial<Model["admin"]["permissions"]>;
  fields?: Record<string, ModelField>;
}

const articleFields: Record<string, ModelField> = {
  title: { type: FieldType.CharField, verbose_name: "Title" },
  status: {
    type: FieldType.CharField,
    verbose_name: "Status",
    choices: [
      ["draft", "Draft"],
      ["published", "Published"],
    ],
  },
};

// A CharField with choices and an InputWidget renders MultiSelectFilter.
const filterableStatusField: ModelField = {
  type: FieldType.CharField,
  verbose_name: "Status",
  widget_class: FieldWidget.InputWidget,
  choices: [
    ["draft", "Draft"],
    ["published", "Published"],
  ],
};

const filteredArticleFields: Record<string, ModelField> = {
  ...articleFields,
  status: filterableStatusField,
};

function makeModel(overrides: ModelOverrides = {}): Model {
  return {
    label: "testapp.article",
    verbose_name: "Article",
    verbose_name_plural: "Articles",
    tenant_field: null,
    admin: {
      is_singleton: false,
      format_mapping: {},
      widget_mapping: {},
      icon: null,
      list: {
        per_page: 10,
        description: "",
        display: [
          { name: "title", description: "Title", empty_value: null },
          { name: "status", description: "Status", empty_value: null },
        ],
        search: true,
        filter: [],
        sortable_by: null,
        ...overrides.list,
      },
      edit: { main: [], sidebar: [], inlines: [] },
      permissions: {
        add_permission: true,
        change_permission: true,
        delete_permission: true,
        view_permission: true,
        ...overrides.permissions,
      },
    },
    fields: overrides.fields ?? articleFields,
  };
}

const articles: Resource[] = [
  {
    id: "1",
    __str__: "First Article",
    title: "First Article",
    status: "draft",
  },
  {
    id: "2",
    __str__: "Second Article",
    title: "Second Article",
    status: "published",
  },
];

function makePaginated(
  results: Resource[],
  pagination: Partial<PaginatedResponse<Resource>["pagination"]> = {},
): PaginatedResponse<Resource> {
  return {
    pagination: { count: results.length, current: 1, pages: 1, ...pagination },
    results,
  };
}

function lastRequest(): { url: string; params: Record<string, unknown> } {
  const call = httpGetMock.mock.calls.at(-1) as
    [string, { params?: Record<string, unknown> }?] | undefined;
  if (!call) {
    throw new Error("expected http.get to have been called");
  }
  return { url: call[0], params: call[1]?.params ?? {} };
}

function LocationProbe() {
  const location = useLocation();

  return (
    <>
      <span data-testid="location-search">{location.search}</span>
      <span data-testid="location-hash">{location.hash}</span>
    </>
  );
}

function renderListPage(
  model: Model,
  initialEntry = "/content/testapp.article",
) {
  useDiscoverMock.mockReturnValue({ data: { models: [model] } });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/content/:model"
            element={
              <>
                <ModelListPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ModelListPage", () => {
  beforeEach(() => {
    httpGetMock.mockReset();
    httpGetMock.mockResolvedValue({ data: makePaginated(articles) });
    useAdminInfoMock.mockReturnValue({ data: undefined });
  });

  it("renders a row per result with the configured list columns", async () => {
    renderListPage(makeModel());

    expect(await screen.findByText("First Article")).toBeInTheDocument();
    expect(screen.getByText("Second Article")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    // Choice fields render the choice label, not the raw value.
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();

    expect(lastRequest().url).toBe("/content/testapp.article");
    expect(lastRequest().params).toMatchObject({ page: 1 });
  });

  it("shows the empty state when the response has no results", async () => {
    httpGetMock.mockResolvedValue({ data: makePaginated([]) });
    renderListPage(makeModel());

    expect(
      await screen.findByText("list_view.empty_state"),
    ).toBeInTheDocument();
  });

  it("sends the search term to the API when the search input changes", async () => {
    const user = userEvent.setup();
    renderListPage(makeModel());

    await user.type(
      await screen.findByPlaceholderText("common.search"),
      "hello",
    );

    // The search input is debounced for 300ms.
    await waitFor(
      () => expect(lastRequest().params).toMatchObject({ search: "hello" }),
      { timeout: 2000 },
    );
  });

  it("does not render the search input when search is disabled", async () => {
    renderListPage(makeModel({ list: { search: false } }));

    await screen.findByText("First Article");

    expect(
      screen.queryByPlaceholderText("common.search"),
    ).not.toBeInTheDocument();
  });

  it("cycles the ordering parameter when a sortable header is clicked", async () => {
    const user = userEvent.setup();
    renderListPage(makeModel());

    const titleHeader = await screen.findByRole("button", { name: "Title" });

    await user.click(titleHeader);
    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ ordering: "title" }),
    );

    await user.click(titleHeader);
    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ ordering: "-title" }),
    );

    await user.click(titleHeader);
    await waitFor(() => expect(lastRequest().params.ordering).toBeNull());
  });

  it("only offers sorting for columns listed in sortable_by", async () => {
    renderListPage(makeModel({ list: { sortable_by: ["title"] } }));

    await screen.findByText("First Article");

    expect(screen.getByRole("button", { name: "Title" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Status" }),
    ).not.toBeInTheDocument();
  });

  it("renders pagination for multi-page responses and requests the next page", async () => {
    const user = userEvent.setup();
    httpGetMock.mockResolvedValue({
      data: makePaginated(articles, { count: 25, current: 1, pages: 3 }),
    });
    renderListPage(makeModel());

    await user.click(await screen.findByRole("button", { name: "Page 2" }));

    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ page: 2 }),
    );
    expect(screen.getByTestId("location-search")).toHaveTextContent("page=2");
  });

  it("does not render pagination for single-page responses", async () => {
    renderListPage(makeModel());

    await screen.findByText("First Article");

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("renders a filter control and sends the applied filter to the API", async () => {
    const user = userEvent.setup();
    renderListPage(
      makeModel({
        list: { filter: ["status"], sortable_by: ["title"] },
        fields: filteredArticleFields,
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Status" }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Published" }),
    );

    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ status: "published" }),
    );
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "filters.status=published",
    );
  });

  it("loads a filter from the URL and clears it with the clear-all button", async () => {
    const user = userEvent.setup();
    renderListPage(
      makeModel({
        list: { filter: ["status"], sortable_by: ["title"] },
        fields: filteredArticleFields,
      }),
      "/content/testapp.article?filters.status=published",
    );

    await screen.findByText("First Article");
    expect(lastRequest().params).toMatchObject({ status: "published" });

    await user.click(
      screen.getByRole("button", { name: "list_view.clear_all_filters" }),
    );

    await waitFor(() => expect(lastRequest().params.status).toBeUndefined());
    expect(screen.getByTestId("location-search")).not.toHaveTextContent(
      "filters.status",
    );
  });

  it("navigates to the editor when a row is clicked", async () => {
    const user = userEvent.setup();
    renderListPage(makeModel());

    await user.click(await screen.findByText("First Article"));

    expect(screen.getByTestId("location-hash")).toHaveTextContent(
      "#editor:testapp.article:1",
    );
  });

  it("hides the create button without the add permission", async () => {
    renderListPage(makeModel({ permissions: { add_permission: false } }));

    await screen.findByText("First Article");

    expect(
      screen.queryByRole("link", { name: "common.create" }),
    ).not.toBeInTheDocument();
  });

  it("shows the create button with the add permission", async () => {
    renderListPage(makeModel());

    expect(
      await screen.findByRole("link", { name: "common.create" }),
    ).toBeInTheDocument();
  });
});

const listArticles: Resource[] = [
  {
    id: "1",
    __str__: "First Article",
    title: "First Article",
    status: "draft",
    list_display: {
      title: "First Article",
      description: "The first body",
      meta: "Draft",
    },
  },
  {
    id: "2",
    __str__: "Second Article",
    title: "Second Article",
    status: "published",
    list_display: {
      title: "Second Article",
      description: "The second body",
      meta: "Published",
    },
  },
];

describe("ModelListPage views", () => {
  beforeEach(() => {
    httpGetMock.mockReset();
    httpGetMock.mockResolvedValue({ data: makePaginated(listArticles) });
    useAdminInfoMock.mockReturnValue({ data: undefined });
  });

  it("renders the table and no toggle when only one view is offered", async () => {
    renderListPage(makeModel());

    expect(await screen.findByText("First Article")).toBeInTheDocument();
    // The table header is the table view's signature.
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.queryByTitle("list_view.list_view")).not.toBeInTheDocument();
  });

  it("switches to the list view through the toggle and keeps it in the URL", async () => {
    renderListPage(makeModel({ list: { views: ["table", "list"] } }));

    await userEvent.click(await screen.findByTitle("list_view.list_view"));

    // Rows render the resolved list display: title, description, meta.
    expect(await screen.findByText("The first body")).toBeInTheDocument();
    expect(screen.getByText("The second body")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "view=list",
    );
  });

  it("opens the editor when a list row is clicked", async () => {
    renderListPage(
      makeModel({ list: { views: ["table", "list"] } }),
      "/content/testapp.article?view=list",
    );

    await userEvent.click(await screen.findByText("First Article"));

    expect(screen.getByTestId("location-hash")).toHaveTextContent(
      "editor:testapp.article:1",
    );
  });

  it("falls back to the first offered view when the URL asks for another", async () => {
    // views offers only the table; ?view=list is ignored.
    renderListPage(makeModel(), "/content/testapp.article?view=list");

    expect(await screen.findByText("Title")).toBeInTheDocument();
  });
});
