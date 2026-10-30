import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModelListPage } from "@/pages/(studio)/content/[model]/page";
import type { Model, ModelField, PaginatedResponse, Resource } from "@/types";
import { FieldType, FieldWidget } from "@/types";

const httpGetMock = vi.hoisted(() => vi.fn());
const httpPostMock = vi.hoisted(() => vi.fn());
const useDiscoverMock = vi.hoisted(() => vi.fn());
const useAdminInfoMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => ({ get: httpGetMock, post: httpPostMock }),
}));

vi.mock("@/hooks/use-confirm-dialog", () => ({
  default: () => confirmMock,
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: useDiscoverMock,
}));

vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: useAdminInfoMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
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
// Radix Select's listbox uses the pointer capture API, which jsdom
// does not implement.
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
window.HTMLElement.prototype.setPointerCapture = vi.fn();

interface ModelOverrides {
  label?: string;
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
    label: overrides.label ?? "testapp.article",
    verbose_name: "Article",
    verbose_name_plural: "Articles",
    tenant_field: null,
    admin: {
      is_singleton: false,
      icon: null,
      list: {
        per_page: 10,
        description: "",
        display: [
          { name: "title", header: null, format: null },
          { name: "status", header: null, format: null },
        ],
        search: true,
        filter: [],
        sortable_by: null,
        actions: [],
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

const previewedArticles: Resource[] = articles.map((article, i) => ({
  ...article,
  get_body_preview: i === 0 ? "first body" : "second body",
}));

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
      <span data-testid="location-pathname">{location.pathname}</span>
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
        <LocationProbe />
        <Routes>
          <Route
            path="/content/:model"
            element={
              <>
                <ModelListPage />
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
    localStorage.clear();
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

  it("invites creation in the empty state", async () => {
    httpGetMock.mockResolvedValue({ data: makePaginated([]) });
    renderListPage(makeModel());

    expect(
      await screen.findByText("list_view.empty_state"),
    ).toBeInTheDocument();
    // The header and the empty state both offer creation.
    const create = screen.getAllByRole("link", { name: "common.create" });
    expect(create).toHaveLength(2);
    expect(create[1]).toHaveAttribute("href", "/content/testapp.article/new");
  });

  it("offers no create button in the empty state without the add permission", async () => {
    httpGetMock.mockResolvedValue({ data: makePaginated([]) });
    renderListPage(makeModel({ permissions: { add_permission: false } }));

    await screen.findByText("list_view.empty_state");

    expect(
      screen.queryByRole("link", { name: "common.create" }),
    ).not.toBeInTheDocument();
  });

  it("shows a no-results notice that clears the search and filters", async () => {
    httpGetMock.mockResolvedValue({ data: makePaginated([]) });
    const user = userEvent.setup();
    localStorage.setItem(
      "__dcs_list_filters__:testapp.article",
      JSON.stringify({ status: "published" }),
    );
    renderListPage(
      makeModel({
        list: { filter: ["status"] },
        fields: filteredArticleFields,
      }),
      "/content/testapp.article?search=hello",
    );

    expect(await screen.findByText("list_view.no_results")).toBeInTheDocument();
    expect(screen.queryByText("list_view.empty_state")).not.toBeInTheDocument();

    // The toolbar and the empty state both offer clearing; the empty
    // state's also clears the search term.
    await user.click(
      screen.getAllByRole("button", { name: "list_view.clear_all_filters" })[1],
    );

    await waitFor(() => expect(lastRequest().params.search).toBeUndefined());
    expect(lastRequest().params.status).toBeUndefined();
    expect(
      localStorage.getItem("__dcs_list_filters__:testapp.article"),
    ).toBeNull();
    expect(screen.getByTestId("location-search")).not.toHaveTextContent(
      "search=",
    );
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

  it("cycles the ordering when a sortable header is clicked and remembers it", async () => {
    const user = userEvent.setup();
    renderListPage(makeModel());

    const titleHeader = await screen.findByRole("button", { name: "Title" });

    await user.click(titleHeader);
    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ ordering: "title" }),
    );
    expect(localStorage.getItem("__dcs_list_ordering__:testapp.article")).toBe(
      "title",
    );
    expect(screen.getByTestId("location-search")).toHaveTextContent("");

    await user.click(titleHeader);
    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ ordering: "-title" }),
    );
    expect(localStorage.getItem("__dcs_list_ordering__:testapp.article")).toBe(
      "-title",
    );

    await user.click(titleHeader);
    await waitFor(() => expect(lastRequest().params.ordering).toBeNull());
    expect(
      localStorage.getItem("__dcs_list_ordering__:testapp.article"),
    ).toBeNull();
  });

  it("exposes the sort state through aria-sort", async () => {
    const user = userEvent.setup();
    renderListPage(makeModel());

    const title = await screen.findByRole("columnheader", {
      name: "Title",
    });
    expect(title).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: "Title" }));
    expect(title).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: "Title" }));
    expect(title).toHaveAttribute("aria-sort", "descending");

    await user.click(screen.getByRole("button", { name: "Title" }));
    expect(title).toHaveAttribute("aria-sort", "none");

    // Columns that cannot be sorted carry no aria-sort at all.
    expect(
      screen.getByRole("columnheader", { name: "Status" }),
    ).toHaveAttribute("aria-sort", "none");
  });

  it("returns to the first page when the ordering changes", async () => {
    const user = userEvent.setup();
    renderListPage(makeModel(), "/content/testapp.article?page=2");

    await screen.findByText("First Article");
    await user.click(screen.getByRole("button", { name: "Title" }));

    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({
        page: 1,
        ordering: "title",
      }),
    );
    expect(screen.getByTestId("location-search")).not.toHaveTextContent(
      "page=",
    );
  });

  it("returns to the first page when a filter changes", async () => {
    const user = userEvent.setup();
    renderListPage(
      makeModel({
        list: { filter: ["status"], sortable_by: ["title"] },
        fields: filteredArticleFields,
      }),
      "/content/testapp.article?page=2",
    );

    await screen.findByText("First Article");
    await user.click(await screen.findByRole("button", { name: "Status" }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Published" }),
    );

    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({
        page: 1,
        status: "published",
      }),
    );
    expect(screen.getByTestId("location-search")).not.toHaveTextContent(
      "page=",
    );
  });

  it("returns to the first page when the search term changes", async () => {
    const user = userEvent.setup();
    renderListPage(makeModel(), "/content/testapp.article?page=2");

    await screen.findByText("First Article");
    await user.type(
      await screen.findByPlaceholderText("common.search"),
      "hello",
    );

    await waitFor(
      () =>
        expect(lastRequest().params).toMatchObject({
          page: 1,
          search: "hello",
        }),
      { timeout: 2000 },
    );
    expect(screen.getByTestId("location-search")).not.toHaveTextContent(
      "page=",
    );
  });

  it("drops remembered state that no longer matches the model", async () => {
    localStorage.setItem("__dcs_list_ordering__:testapp.article", "removed");
    localStorage.setItem(
      "__dcs_list_filters__:testapp.article",
      JSON.stringify({ status: "published", bogus: "x" }),
    );
    // status is not a sortable_by column, so the ordering would be
    // dropped even if it named a real field.
    renderListPage(
      makeModel({
        list: { sortable_by: ["title"] },
        fields: filteredArticleFields,
      }),
    );

    await screen.findByText("First Article");

    expect(lastRequest().params.ordering).toBeNull();
    expect(lastRequest().params.status).toBeUndefined();
    expect(lastRequest().params.bogus).toBeUndefined();
  });

  it("only offers sorting for columns listed in sortable_by", async () => {
    renderListPage(makeModel({ list: { sortable_by: ["title"] } }));

    await screen.findByText("First Article");

    expect(screen.getByRole("button", { name: "Title" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Status" }),
    ).not.toBeInTheDocument();
  });

  it("renders a header on a column and the raw value on a computed one", async () => {
    httpGetMock.mockResolvedValue({ data: makePaginated(previewedArticles) });
    renderListPage(
      makeModel({
        list: {
          display: [
            { name: "title", header: null, format: null },
            {
              name: "get_body_preview",
              header: "Preview",
              format: null,
            },
          ],
        },
      }),
    );

    await screen.findByText("First Article");

    // The explicit header replaces the verbose name...
    expect(screen.getByText("Preview")).toBeInTheDocument();
    // Field columns keep their verbose name...
    expect(screen.getByText("Title")).toBeInTheDocument();
    // ...and computed columns render their row value without a sort
    // button.
    expect(screen.getByText("first body")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview" }),
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
    // The filter is remembered per content type, not in the URL.
    expect(
      JSON.parse(
        localStorage.getItem("__dcs_list_filters__:testapp.article") ?? "{}",
      ),
    ).toEqual({ status: "published" });
    expect(screen.getByTestId("location-search")).toHaveTextContent("");
  });

  it("loads a remembered filter and clears it with the clear-all button", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "__dcs_list_filters__:testapp.article",
      JSON.stringify({ status: "published" }),
    );
    renderListPage(
      makeModel({
        list: { filter: ["status"], sortable_by: ["title"] },
        fields: filteredArticleFields,
      }),
    );

    await screen.findByText("First Article");
    expect(lastRequest().params).toMatchObject({ status: "published" });

    await user.click(
      screen.getByRole("button", { name: "list_view.clear_all_filters" }),
    );

    await waitFor(() => expect(lastRequest().params.status).toBeUndefined());
    expect(
      localStorage.getItem("__dcs_list_filters__:testapp.article"),
    ).toBeNull();
  });

  it("renders a boolean filter and sends the chosen value to the API", async () => {
    const user = userEvent.setup();
    renderListPage(
      makeModel({
        list: { filter: ["is_published"] },
        fields: {
          ...articleFields,
          is_published: {
            type: FieldType.BooleanField,
            verbose_name: "Published",
          },
        },
      }),
    );

    await user.click(await screen.findByRole("button", { name: /^Published/ }));
    await user.click(
      await screen.findByRole("menuitemradio", {
        name: "list_view.filters.yes",
      }),
    );

    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ is_published: "true" }),
    );
    expect(
      JSON.parse(
        localStorage.getItem("__dcs_list_filters__:testapp.article") ?? "{}",
      ),
    ).toEqual({ is_published: "true" });

    // Choosing "all" removes the filter again.
    await user.click(await screen.findByRole("button", { name: /^Published/ }));
    await user.click(
      await screen.findByRole("menuitemradio", {
        name: "list_view.filters.all",
      }),
    );

    await waitFor(() =>
      expect(lastRequest().params.is_published).toBeUndefined(),
    );
    expect(
      localStorage.getItem("__dcs_list_filters__:testapp.article"),
    ).toBeNull();
  });

  it("renders a number filter and sends the range bounds to the API", async () => {
    const user = userEvent.setup();
    renderListPage(
      makeModel({
        list: { filter: ["views"] },
        fields: {
          ...articleFields,
          views: { type: FieldType.IntegerField, verbose_name: "Views" },
        },
      }),
    );

    await user.click(await screen.findByRole("button", { name: /^Views/ }));
    await user.type(await screen.findByLabelText("list_view.filters.min"), "5");
    await user.type(
      await screen.findByLabelText("list_view.filters.max"),
      "10",
    );
    // Bounds commit on Enter; blur alone would work too.
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({
        views__gte: "5",
        views__lte: "10",
      }),
    );
    expect(
      JSON.parse(
        localStorage.getItem("__dcs_list_filters__:testapp.article") ?? "{}",
      ),
    ).toEqual({ views__gte: "5", views__lte: "10" });
  });

  it("loads a remembered date range and clears it", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "__dcs_list_filters__:testapp.article",
      JSON.stringify({
        published_at__gte: "2026-01-01T00:00",
        published_at__lte: "2026-02-01T23:59",
      }),
    );
    renderListPage(
      makeModel({
        list: { filter: ["published_at"] },
        fields: {
          ...articleFields,
          published_at: {
            type: FieldType.DateTimeField,
            verbose_name: "Published at",
          },
        },
      }),
    );

    await screen.findByText("First Article");
    expect(lastRequest().params).toMatchObject({
      published_at__gte: "2026-01-01T00:00",
      published_at__lte: "2026-02-01T23:59",
    });
    expect(
      screen.getByRole("button", { name: /^Published at/ }),
    ).toHaveTextContent("Jan 1, 2026 – Feb 1, 2026");

    await user.click(screen.getByRole("button", { name: /^Published at/ }));
    await user.click(
      await screen.findByRole("button", { name: "common.clear" }),
    );

    await waitFor(() =>
      expect(lastRequest().params.published_at__gte).toBeUndefined(),
    );
    expect(
      localStorage.getItem("__dcs_list_filters__:testapp.article"),
    ).toBeNull();
  });

  it("renders a foreign key filter and sends the selected id to the API", async () => {
    const user = userEvent.setup();
    httpGetMock.mockImplementation((url: string) =>
      url === "/content/testapp.author/1"
        ? Promise.resolve({ data: { id: "1", __str__: "John Doe" } })
        : Promise.resolve({ data: makePaginated(articles) }),
    );
    httpPostMock.mockResolvedValue({
      data: [{ id: "1", __str__: "John Doe" }],
    });
    renderListPage(
      makeModel({
        list: { filter: ["author"] },
        fields: {
          ...articleFields,
          author: {
            type: FieldType.CharField,
            verbose_name: "Author",
            widget_class: FieldWidget.ForeignKeyWidget,
            related_model: "testapp.author",
          },
        },
      }),
    );

    await user.click(await screen.findByRole("button", { name: /^Author/ }));
    await user.click(await screen.findByText("John Doe"));

    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ author: "1" }),
    );
    expect(
      JSON.parse(
        localStorage.getItem("__dcs_list_filters__:testapp.article") ?? "{}",
      ),
    ).toEqual({ author: "1" });

    // The trigger shows the selected relation, resolved from the API.
    expect(
      await screen.findByRole("button", { name: /Author.*John\s*Doe/ }),
    ).toBeInTheDocument();
  });

  it("renders a many to many filter and sends the selection to the API", async () => {
    const user = userEvent.setup();
    httpGetMock.mockImplementation((url: string) => {
      const id = url.split("/").at(-1);
      return url.startsWith("/content/testapp.category/")
        ? Promise.resolve({ data: { id, __str__: `Category ${id}` } })
        : Promise.resolve({ data: makePaginated(articles) });
    });
    httpPostMock.mockResolvedValue({
      data: [
        { id: "1", __str__: "News" },
        { id: "2", __str__: "Sports" },
      ],
    });
    renderListPage(
      makeModel({
        list: { filter: ["categories"] },
        fields: {
          ...articleFields,
          categories: {
            type: FieldType.CharField,
            verbose_name: "Categories",
            widget_class: FieldWidget.ManyToManyWidget,
            related_model: "testapp.category",
          },
        },
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: /^Categories/ }),
    );
    // The popover stays open while toggling options.
    await user.click(await screen.findByText("News"));
    await user.click(await screen.findByText("Sports"));

    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ categories: "1,2" }),
    );
    expect(
      JSON.parse(
        localStorage.getItem("__dcs_list_filters__:testapp.article") ?? "{}",
      ),
    ).toEqual({ categories: "1,2" });

    // While the modal popover is open the trigger is hidden from the
    // accessibility tree; close it to assert the resolved labels.
    await user.keyboard("{Escape}");
    expect(
      await screen.findByRole("button", {
        name: /Category 1, Category 2/,
      }),
    ).toBeInTheDocument();
  });

  it("navigates to the editor when a row is clicked", async () => {
    const user = userEvent.setup();
    renderListPage(makeModel());

    await user.click(await screen.findByText("First Article"));

    expect(screen.getByTestId("location-pathname")).toHaveTextContent(
      "/content/testapp.article/1",
    );
  });

  it("offers a trash link for models with soft delete configured", async () => {
    renderListPage(
      makeModel({
        list: { filter: [], trash: true },
      }),
    );

    await screen.findByText("First Article");

    expect(
      screen.getByRole("link", { name: /list_view.trash/ }),
    ).toHaveAttribute("href", "/content/testapp.article/trash");
  });

  it("offers no trash link without soft delete", async () => {
    renderListPage(makeModel());

    await screen.findByText("First Article");

    expect(
      screen.queryByRole("link", { name: "list_view.trash" }),
    ).not.toBeInTheDocument();
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
    list_item_display: {
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
    list_item_display: {
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
    localStorage.clear();
  });

  it("renders the table and no toggle when only one view is offered", async () => {
    renderListPage(makeModel());

    expect(await screen.findByText("First Article")).toBeInTheDocument();
    // The table header is the table view's signature.
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.queryByTitle("list_view.list_view")).not.toBeInTheDocument();
  });

  it("switches to the list view through the toggle and remembers the choice", async () => {
    renderListPage(makeModel({ list: { views: ["table", "list"] } }));

    await userEvent.click(await screen.findByTitle("list_view.list_view"));

    // Rows render the resolved list display: title, description, meta.
    expect(await screen.findByText("The first body")).toBeInTheDocument();
    expect(screen.getByText("The second body")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    // The choice is remembered per content type, not in the URL.
    expect(localStorage.getItem("__dcs_list_view__:testapp.article")).toBe(
      "list",
    );
    expect(screen.getByTestId("location-search")).toHaveTextContent("");
  });

  it("shows thumbnails, with a placeholder for items without one", async () => {
    localStorage.setItem("__dcs_list_view__:testapp.article", "list");
    httpGetMock.mockResolvedValue({
      data: makePaginated([
        {
          ...listArticles[0],
          list_item_display: {
            ...listArticles[0].list_item_display!,
            thumbnail: "/media/first.jpg",
          },
        },
        listArticles[1],
      ]),
    });
    renderListPage(makeModel({ list: { views: ["table", "list"] } }));

    await screen.findByText("The first body");
    const [first, second] = screen.getAllByTestId("list-item-thumbnail");
    expect(first.querySelector("img")).toHaveAttribute(
      "src",
      "/media/first.jpg",
    );
    // The item without a thumbnail keeps the slot, without an image.
    expect(second.querySelector("img")).toBeNull();
  });

  it("falls back to the placeholder when a thumbnail fails to load", async () => {
    localStorage.setItem("__dcs_list_view__:testapp.article", "list");
    httpGetMock.mockResolvedValue({
      data: makePaginated([
        {
          ...listArticles[0],
          list_item_display: {
            ...listArticles[0].list_item_display!,
            thumbnail: "/media/missing.jpg",
          },
        },
      ]),
    });
    renderListPage(makeModel({ list: { views: ["table", "list"] } }));

    await screen.findByText("The first body");
    const thumbnail = screen.getByTestId("list-item-thumbnail");
    fireEvent.error(thumbnail.querySelector("img")!);
    expect(thumbnail.querySelector("img")).toBeNull();
  });

  it("reserves no thumbnail slot when no item has a thumbnail", async () => {
    localStorage.setItem("__dcs_list_view__:testapp.article", "list");
    renderListPage(makeModel({ list: { views: ["table", "list"] } }));

    await screen.findByText("The first body");
    expect(screen.queryByTestId("list-item-thumbnail")).not.toBeInTheDocument();
  });

  it("restores a remembered choice for the content type", async () => {
    localStorage.setItem("__dcs_list_view__:testapp.article", "list");
    renderListPage(makeModel({ list: { views: ["table", "list"] } }));

    // The stored choice renders the list view, not the table.
    expect(await screen.findByText("The first body")).toBeInTheDocument();
    expect(screen.queryByText("Title")).not.toBeInTheDocument();
  });

  it("does not carry a choice over to another content type", async () => {
    localStorage.setItem("__dcs_list_view__:testapp.article", "list");
    renderListPage(
      makeModel({
        label: "testapp.note",
        list: { views: ["table", "list"] },
      }),
      "/content/testapp.note",
    );

    // The note starts at its first offered view: the table.
    expect(await screen.findByText("Title")).toBeInTheDocument();
    expect(screen.queryByText("The first body")).not.toBeInTheDocument();
  });

  it("opens the editor when a list row is clicked", async () => {
    localStorage.setItem("__dcs_list_view__:testapp.article", "list");
    renderListPage(
      makeModel({ list: { views: ["table", "list"] } }),
      "/content/testapp.article",
    );

    await userEvent.click(await screen.findByText("First Article"));

    expect(screen.getByTestId("location-pathname")).toHaveTextContent(
      "/content/testapp.article/1",
    );
  });

  it("falls back to the first offered view when the remembered choice is unavailable", async () => {
    // views offers only the table; a remembered "list" is ignored.
    localStorage.setItem("__dcs_list_view__:testapp.article", "list");
    renderListPage(makeModel());

    expect(await screen.findByText("Title")).toBeInTheDocument();
  });

  it("uses the default ordering in the list view when sortable_by is not defined", async () => {
    const user = userEvent.setup();
    localStorage.setItem("__dcs_list_view__:testapp.article", "list");
    localStorage.setItem("__dcs_list_ordering__:testapp.article", "-title");
    renderListPage(makeModel({ list: { views: ["table", "list"] } }));

    await screen.findByText("The first body");

    // The remembered ordering is kept, but not sent: the list view
    // always uses the server's default ordering.
    expect(localStorage.getItem("__dcs_list_ordering__:testapp.article")).toBe(
      "-title",
    );
    expect(lastRequest().params.ordering).toBeNull();

    // The table view picks the ordering back up.
    await user.click(screen.getByTitle("list_view.table_view"));
    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ ordering: "-title" }),
    );
  });

  it("sorts the list view through the sort select when sortable_by is defined", async () => {
    const user = userEvent.setup();
    localStorage.setItem("__dcs_list_view__:testapp.article", "list");
    renderListPage(
      makeModel({ list: { views: ["table", "list"], sortable_by: ["title"] } }),
    );

    await screen.findByText("The first body");
    expect(lastRequest().params.ordering).toBeNull();

    // Choosing a field sorts ascending.
    await user.click(
      screen.getByRole("combobox", { name: "list_view.sort_by" }),
    );
    await user.click(await screen.findByRole("option", { name: "Title" }));

    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ ordering: "title" }),
    );
    expect(localStorage.getItem("__dcs_list_ordering__:testapp.article")).toBe(
      "title",
    );

    // The direction toggle flips to descending.
    await user.click(screen.getByTitle("list_view.sort_descending"));
    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ ordering: "-title" }),
    );
    expect(localStorage.getItem("__dcs_list_ordering__:testapp.article")).toBe(
      "-title",
    );

    // The default option returns to the server's default ordering.
    await user.click(
      screen.getByRole("combobox", { name: "list_view.sort_by" }),
    );
    await user.click(
      await screen.findByRole("option", {
        name: "list_view.default_ordering",
      }),
    );

    await waitFor(() => expect(lastRequest().params.ordering).toBeNull());
    expect(
      localStorage.getItem("__dcs_list_ordering__:testapp.article"),
    ).toBeNull();
  });
});

describe("bulk actions", () => {
  const makeActions = () => [
    {
      id: "delete",
      label: "Delete",
      icon: null,
      confirm: "Delete the selected items?",
      destructive: true,
    },
    {
      id: "publish",
      label: "Publish",
      icon: null,
      confirm: null,
      destructive: false,
    },
  ];

  beforeEach(() => {
    httpGetMock.mockReset();
    httpGetMock.mockResolvedValue({ data: makePaginated(articles) });
    useAdminInfoMock.mockReturnValue({ data: undefined });
    confirmMock.mockReset();
  });

  it("renders no checkboxes without actions", async () => {
    renderListPage(makeModel());

    await screen.findByText("First Article");

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows a checkbox column and the bulk bar while selecting", async () => {
    const user = userEvent.setup();
    renderListPage(makeModel({ list: { actions: makeActions() } }));

    // A select-all checkbox plus one per row.
    expect(await screen.findAllByRole("checkbox")).toHaveLength(3);

    await user.click(screen.getAllByRole("checkbox")[1]);

    expect(screen.getByText("bulk.selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
  });

  it("runs the selected action on the selected ids and clears the bar", async () => {
    const user = userEvent.setup();
    httpPostMock.mockResolvedValue({ data: { count: 1 } });
    renderListPage(makeModel({ list: { actions: makeActions() } }));

    await screen.findByText("First Article");
    await user.click(screen.getAllByRole("checkbox")[1]);
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(httpPostMock).toHaveBeenCalledWith(
        "/content/testapp.article/bulk",
        { action: "publish", ids: ["1"] },
      ),
    );

    expect(await screen.findByText("First Article")).toBeInTheDocument();
    expect(screen.queryByText("bulk.selected")).not.toBeInTheDocument();
  });

  it("asks for confirmation before destructive actions", async () => {
    const user = userEvent.setup();
    confirmMock.mockResolvedValue(false);
    renderListPage(makeModel({ list: { actions: makeActions() } }));

    await screen.findByText("First Article");
    await user.click(screen.getAllByRole("checkbox")[1]);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await waitFor(() => confirmMock.mock.calls.length > 0));
    expect(confirmMock).toHaveBeenCalledWith({
      description: "Delete the selected items?",
    });
    expect(httpPostMock).not.toHaveBeenCalled();
  });

  it("selects all rows through the header checkbox", async () => {
    const user = userEvent.setup();
    renderListPage(makeModel({ list: { actions: makeActions() } }));

    await screen.findByText("First Article");
    await user.click(screen.getAllByRole("checkbox")[0]);

    const checked = screen
      .getAllByRole("checkbox")
      .map((checkbox) => (checkbox as HTMLInputElement).dataset.state);

    expect(checked).toEqual(["checked", "checked", "checked"]);
  });
});

describe("ModelListPage reordering", () => {
  beforeEach(() => {
    httpGetMock.mockReset();
    httpPostMock.mockReset();
    httpGetMock.mockResolvedValue({ data: makePaginated(articles) });
    useAdminInfoMock.mockReturnValue({ data: undefined });
    localStorage.clear();
  });

  const rowTitles = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent);

  it("offers no handles on lists that cannot be reordered", async () => {
    renderListPage(makeModel());

    await screen.findByText("First Article");

    expect(
      screen.queryByRole("button", { name: "reorder.drag" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "reorder.menu" }),
    ).not.toBeInTheDocument();
  });

  it("offers a handle and a move menu per row", async () => {
    renderListPage(makeModel({ list: { reorderable: true } }));

    await screen.findByText("First Article");

    const handles = screen.getAllByRole("button", { name: "reorder.drag" });
    expect(handles).toHaveLength(2);
    expect(handles[0]).not.toHaveAttribute("aria-disabled");
    expect(
      screen.getAllByRole("button", { name: "reorder.menu" }),
    ).toHaveLength(2);
  });

  it("turns reordering off while another ordering is active", async () => {
    localStorage.setItem("__dcs_list_ordering__:testapp.article", "title");
    renderListPage(makeModel({ list: { reorderable: true } }));

    await screen.findByText("First Article");

    const handles = screen.getAllByRole("button", {
      name: "reorder.disabled_ordering",
    });
    expect(handles[0]).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getAllByRole("button", { name: "reorder.menu" })[0],
    ).toBeDisabled();
  });

  it("turns reordering off during a search but not with filters", async () => {
    localStorage.setItem(
      "__dcs_list_filters__:testapp.article",
      JSON.stringify({ status: "published" }),
    );
    const model = makeModel({
      list: { reorderable: true, filter: ["status"] },
      fields: filteredArticleFields,
    });
    const { unmount } = renderListPage(model);

    await screen.findByText("First Article");
    expect(
      screen.getAllByRole("button", { name: "reorder.drag" })[0],
    ).not.toHaveAttribute("aria-disabled");
    unmount();

    renderListPage(model, "/content/testapp.article?search=first");

    await screen.findByText("First Article");
    expect(
      screen.getAllByRole("button", { name: "reorder.disabled_search" })[0],
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("moves a row to the top right away and posts the move", async () => {
    const user = userEvent.setup();
    let resolve: (value: unknown) => void = () => {};
    httpPostMock.mockReturnValue(new Promise((r) => (resolve = r)));
    renderListPage(makeModel({ list: { reorderable: true } }));

    await screen.findByText("First Article");
    await user.click(
      screen.getAllByRole("button", { name: "reorder.menu" })[1],
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "reorder.move_first" }),
    );

    expect(httpPostMock).toHaveBeenCalledWith(
      "/content/testapp.article/2/move",
      { position: "first" },
      { params: {} },
    );
    // The optimistic update, before the server answers.
    await waitFor(() => expect(rowTitles()[0]).toContain("Second Article"));
    // Moving never opens the editor.
    expect(screen.getByTestId("location-pathname")).toHaveTextContent(
      "/content/testapp.article",
    );
    expect(screen.getByTestId("location-pathname")).not.toHaveTextContent(
      "/content/testapp.article/2",
    );

    resolve({ data: {} });
    // The refetch afterwards shows the server's order.
    await waitFor(() => expect(rowTitles()[0]).toContain("First Article"));
  });

  it("moves a row one step and sends the list's filters along", async () => {
    const user = userEvent.setup();
    httpPostMock.mockResolvedValue({ data: {} });
    localStorage.setItem(
      "__dcs_list_filters__:testapp.article",
      JSON.stringify({ status: "published" }),
    );
    renderListPage(
      makeModel({
        list: { reorderable: true, filter: ["status"] },
        fields: filteredArticleFields,
      }),
    );

    await screen.findByText("First Article");
    await user.click(
      screen.getAllByRole("button", { name: "reorder.menu" })[0],
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "reorder.move_down" }),
    );

    expect(httpPostMock).toHaveBeenCalledWith(
      "/content/testapp.article/1/move",
      { position: "down" },
      { params: { status: "published" } },
    );
  });

  it("offers no moves past the ends of the list", async () => {
    const user = userEvent.setup();
    renderListPage(makeModel({ list: { reorderable: true } }));

    await screen.findByText("First Article");
    await user.click(
      screen.getAllByRole("button", { name: "reorder.menu" })[0],
    );

    expect(
      await screen.findByRole("menuitem", { name: "reorder.move_up" }),
    ).toHaveAttribute("data-disabled");
    expect(
      screen.getByRole("menuitem", { name: "reorder.move_first" }),
    ).toHaveAttribute("data-disabled");
    expect(
      screen.getByRole("menuitem", { name: "reorder.move_down" }),
    ).not.toHaveAttribute("data-disabled");
  });

  it("rolls the row back when the move fails", async () => {
    const user = userEvent.setup();
    let reject: (reason: unknown) => void = () => {};
    httpPostMock.mockReturnValue(new Promise((_, r) => (reject = r)));
    renderListPage(makeModel({ list: { reorderable: true } }));

    await screen.findByText("First Article");
    await user.click(
      screen.getAllByRole("button", { name: "reorder.menu" })[0],
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "reorder.move_last" }),
    );

    await waitFor(() => expect(rowTitles()[0]).toContain("Second Article"));

    httpGetMock.mockClear();
    reject({ response: { data: ["The target is not in this list."] } });

    await waitFor(() => expect(rowTitles()[0]).toContain("First Article"));
  });
});
