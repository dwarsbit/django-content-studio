import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mediaName } from "@/components/media-library/file-meta";
import { MediaWidget } from "@/components/widgets/media-widget";
import type { MediaItem, ModelField } from "@/types";

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => httpMock,
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: () => ({
    data: {
      media_library: {
        enabled: true,
        folders: false,
        crop: false,
        properties: null,
        models: { media_model: "media.image", folder_model: null },
      },
    },
  }),
}));

vi.mock("@/hooks/use-confirm-dialog", () => ({
  default: () => () => Promise.resolve(true),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
}));

// The picker is not under test; it would fetch the library.
vi.mock("@/components/media-library/select-dialog", () => ({
  SelectDialog: ({ children }: { children: React.ReactNode }) => children,
}));

function makeMediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "media-1",
    folder: null,
    name: "annual-report",
    thumbnail: "/media/annual-report.pdf",
    file: "/media/annual-report.pdf",
    tags: [],
    alt_text: "",
    type: "file",
    size: 2048,
    ...overrides,
  };
}

const field: ModelField = { type: "ForeignKey" as ModelField["type"] };

function renderWidget(value: MediaItem | MediaItem[], props = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onChange = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <MediaWidget
        field={{ ...field, ...props }}
        value={value}
        onChange={onChange}
      />
    </QueryClientProvider>,
  );

  return onChange;
}

beforeEach(() => {
  vi.clearAllMocks();
  httpMock.get.mockResolvedValue({ data: makeMediaItem() });
});

describe("mediaName", () => {
  it("is the item's name", () => {
    expect(mediaName(makeMediaItem())).toBe("annual-report");
  });

  it("falls back to the file name of the URL", () => {
    expect(
      mediaName(makeMediaItem({ name: "", file: "/media/a%20b.pdf?sig=1" })),
    ).toBe("a b.pdf");
  });
});

describe("MediaWidget", () => {
  it("shows the selected file's name", () => {
    renderWidget(makeMediaItem());

    expect(screen.getByText("annual-report")).toBeInTheDocument();
  });

  it("opens the item's details from the thumbnail", async () => {
    renderWidget(makeMediaItem());

    fireEvent.click(
      screen.getByRole("button", {
        name: "widgets.media_widget.show_details:annual-report",
      }),
    );

    await waitFor(() =>
      expect(httpMock.get).toHaveBeenCalledWith("/media-library/items/media-1"),
    );
    expect(
      await screen.findByRole("button", { name: "common.save" }),
    ).toBeInTheDocument();
  });

  it("shows the name as the library has it once the details were opened", async () => {
    httpMock.get.mockResolvedValue({
      data: makeMediaItem({ name: "renamed-report" }),
    });
    renderWidget(makeMediaItem());

    fireEvent.click(
      screen.getByRole("button", {
        name: "widgets.media_widget.show_details:annual-report",
      }),
    );

    expect(
      (await screen.findAllByText("renamed-report")).length,
    ).toBeGreaterThan(0);
  });

  it("clears the field when the item is deleted from its details", async () => {
    httpMock.delete.mockResolvedValue({});
    const onChange = renderWidget(makeMediaItem());

    fireEvent.click(
      screen.getByRole("button", {
        name: "widgets.media_widget.show_details:annual-report",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "common.delete" }),
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
  });

  it("shows file names on the tiles of several items", () => {
    renderWidget(
      [makeMediaItem(), makeMediaItem({ id: "media-2", name: "price-list" })],
      { multiple: true },
    );

    expect(screen.getByText("annual-report")).toBeInTheDocument();
    expect(screen.getByText("price-list")).toBeInTheDocument();
  });
});
