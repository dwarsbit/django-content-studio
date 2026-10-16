import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MediaLibraryPage } from "@/pages/(studio)/media-library/[model]/page";
import type { MediaItem, PaginatedResponse } from "@/types";

const httpGetMock = vi.hoisted(() => vi.fn());
const useDiscoverMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => ({ get: httpGetMock }),
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: useDiscoverMock,
}));

vi.mock("@/hooks/use-media-upload", () => ({
  useMediaUpload: () => ({ uploads: [], start: vi.fn() }),
}));

vi.mock("@/hooks/use-media-tags", () => ({
  useMediaTags: () => ({ data: ["News", "Sports"] }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

// ui/pagination.tsx unwraps a nested `default` from react-paginate's UMD
// build; that shape does not survive vite-node's CommonJS interop in
// tests, so the vendor component is stubbed with the same
// nested-default shape.
vi.mock("react-paginate", () => {
  const ReactPaginateStub = ({ pageCount }: { pageCount: number }) => (
    <ul role="navigation" aria-label="Pagination">
      {Array.from({ length: pageCount }, (_, index) => (
        <li key={index}>{index + 1}</li>
      ))}
    </ul>
  );

  return { default: { default: ReactPaginateStub } };
});

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const DISCOVER_FIXTURE = {
  dashboard: { widgets: [] },
  extensions: [],
  model_groups: [],
  models: [],
  user_model: "auth.user",
  multitenancy: { enabled: false, tenant_model: null },
  media_library: {
    enabled: true,
    folders: false,
    crop: false,
    focal_point: null,
    models: { media_model: "media.image", folder_model: null },
  },
};

const items: MediaItem[] = [
  {
    id: "1",
    folder: null,
    name: "photo.jpg",
    thumbnail: "/t.jpg",
    file: "/f.jpg",
    tags: ["News"],
    alt_text: "",
    type: "image",
    size: 1024,
  },
  {
    id: "2",
    folder: null,
    name: "clip.mp4",
    thumbnail: "",
    file: "/f.mp4",
    tags: [],
    alt_text: "",
    type: "video",
    size: 2048,
  },
];

function makePaginated(results: MediaItem[]): PaginatedResponse<MediaItem> {
  return {
    pagination: { count: results.length, current: 1, pages: 1 },
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

  return <span data-testid="location-search">{location.search}</span>;
}

function renderMediaLibrary(initialEntry = "/media-library") {
  useDiscoverMock.mockReturnValue({ data: DISCOVER_FIXTURE });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <Routes>
          <Route path="/media-library" element={<MediaLibraryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MediaLibraryPage", () => {
  beforeEach(() => {
    httpGetMock.mockReset();
    httpGetMock.mockImplementation((url: string) => {
      if (url === "/media-library/items") {
        return Promise.resolve({ data: makePaginated(items) });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    localStorage.clear();
  });

  it("renders the grid by default and remembers a view switch", async () => {
    const user = userEvent.setup();
    renderMediaLibrary();

    await screen.findByText("photo.jpg");
    expect(screen.getByTestId("location-search")).toHaveTextContent("");

    await user.click(screen.getByTitle("media_library.table_view"));

    // The table is the table view's signature.
    expect(
      screen.getByRole("columnheader", { name: "media_library.columns.name" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem("__dcs_media_view__:media.image")).toBe(
      "table",
    );
    expect(screen.getByTestId("location-search")).toHaveTextContent("");
  });

  it("restores a remembered view", async () => {
    localStorage.setItem("__dcs_media_view__:media.image", "table");
    renderMediaLibrary();

    expect(
      await screen.findByRole("columnheader", {
        name: "media_library.columns.name",
      }),
    ).toBeInTheDocument();
  });

  it("drops a remembered view that is no longer offered", async () => {
    localStorage.setItem("__dcs_media_view__:media.image", "bogus");
    renderMediaLibrary();

    // The grid is the fallback.
    await screen.findByText("photo.jpg");
    expect(
      screen.queryByRole("columnheader", {
        name: "media_library.columns.name",
      }),
    ).not.toBeInTheDocument();
  });

  it("remembers the type filter and returns to the first page", async () => {
    const user = userEvent.setup();
    renderMediaLibrary("/media-library?page=2");

    await screen.findByText("photo.jpg");

    await user.click(
      screen.getByRole("button", { name: "media_library.filters.type" }),
    );
    await user.click(
      await screen.findByRole("menuitemcheckbox", {
        name: "media_library.file_types.image",
      }),
    );

    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({
        page: 1,
        type: "image",
      }),
    );
    expect(
      JSON.parse(
        localStorage.getItem("__dcs_media_filters__:media.image") ?? "{}",
      ),
    ).toEqual({ type: "image" });
    expect(screen.getByTestId("location-search")).not.toHaveTextContent(
      "page=",
    );
  });

  it("remembers the tags filter", async () => {
    const user = userEvent.setup();
    renderMediaLibrary();

    await screen.findByText("photo.jpg");

    await user.click(screen.getByPlaceholderText("media_library.filters.tags"));
    await user.click(await screen.findByRole("option", { name: "News" }));

    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ tags: "News" }),
    );
    expect(
      JSON.parse(
        localStorage.getItem("__dcs_media_filters__:media.image") ?? "{}",
      ),
    ).toEqual({ tags: "News" });
  });

  it("remembers the table ordering", async () => {
    const user = userEvent.setup();
    localStorage.setItem("__dcs_media_view__:media.image", "table");
    renderMediaLibrary();

    const name = await screen.findByRole("columnheader", {
      name: "media_library.columns.name",
    });
    expect(name).toHaveAttribute("aria-sort", "none");

    await user.click(
      screen.getByRole("button", { name: "media_library.columns.name" }),
    );

    await waitFor(() =>
      expect(lastRequest().params).toMatchObject({ ordering: "name" }),
    );
    expect(name).toHaveAttribute("aria-sort", "ascending");
    expect(localStorage.getItem("__dcs_media_ordering__:media.image")).toBe(
      "name",
    );
    expect(screen.getByTestId("location-search")).toHaveTextContent("");
  });

  it("keeps the search term in the URL and returns to the first page", async () => {
    const user = userEvent.setup();
    renderMediaLibrary("/media-library?page=2");

    await screen.findByText("photo.jpg");

    await user.type(
      await screen.findByPlaceholderText("common.search"),
      "photo",
    );

    await waitFor(
      () =>
        expect(lastRequest().params).toMatchObject({
          page: 1,
          search: "photo",
        }),
      { timeout: 2000 },
    );
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "search=photo",
    );
    expect(screen.getByTestId("location-search")).not.toHaveTextContent(
      "page=",
    );
  });

  it("drops remembered filters that no longer apply", async () => {
    localStorage.setItem(
      "__dcs_media_filters__:media.image",
      JSON.stringify({ type: "bogus", tags: "News" }),
    );
    renderMediaLibrary();

    await screen.findByText("photo.jpg");

    // The bogus type is dropped; the tags survive.
    expect(lastRequest().params.type).toBeUndefined();
    expect(lastRequest().params).toMatchObject({ tags: "News" });
  });
});
