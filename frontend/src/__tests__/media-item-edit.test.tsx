import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ItemEdit } from "@/components/media-library/item-edit";
import type { MediaItem } from "@/types";

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
const useDiscoverMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => httpMock,
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: useDiscoverMock,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function makeMediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "media-1",
    folder: null,
    name: "photo.png",
    thumbnail: "/media/thumbs/photo.png",
    file: "/media/photo.png",
    tags: [],
    alt_text: "A photo",
    type: "image",
    size: 2048,
    ...overrides,
  };
}

function discoverWith(
  mediaLibrary: { crop: boolean; focal_point: string | null },
  item: MediaItem,
) {
  useDiscoverMock.mockReturnValue({
    data: {
      media_library: {
        enabled: true,
        folders: false,
        models: { media_model: "media.image", folder_model: null },
        ...mediaLibrary,
      },
    },
  });
  httpMock.get.mockImplementation((url: string) =>
    url === "/media-library/items/media-1"
      ? Promise.resolve({ data: item })
      : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
}

function renderEdit() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ItemEdit itemId="media-1" open onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  httpMock.patch.mockResolvedValue({ data: makeMediaItem() });
  httpMock.post.mockResolvedValue({ data: makeMediaItem() });
});

describe("ItemEdit", () => {
  it("shows a plain preview without crop or focal point", async () => {
    discoverWith({ crop: false, focal_point: null }, makeMediaItem());
    renderEdit();

    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());

    // The crop and focal point editors are not offered.
    expect(screen.queryByText("media_library.crop")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("media_library.focal_point.set"),
    ).not.toBeInTheDocument();
  });

  it("offers crop and focal point tabs when both are enabled", async () => {
    discoverWith({ crop: true, focal_point: "focal_point" }, makeMediaItem());
    renderEdit();

    // The image dialog opens from the sheet's Crop button.
    fireEvent.click(
      await screen.findByRole("button", { name: "media_library.crop" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: "media_library.crop" }),
      ).toBeInTheDocument(),
    );

    expect(
      screen.getByRole("tab", { name: "media_library.focal_point.title" }),
    ).toBeInTheDocument();
  });

  it("saves the focal point under its attribute name", async () => {
    discoverWith({ crop: false, focal_point: "focal_point" }, makeMediaItem());
    renderEdit();

    // The focal point is set in the image dialog, opened from the sheet.
    fireEvent.click(
      await screen.findByRole("button", {
        name: "media_library.focal_point.title",
      }),
    );
    const overlay = await screen.findByLabelText(
      "media_library.focal_point.set",
    );

    // A click at the quarter point of a 200x100 area sets the focus
    // point at 25% / 50%.
    const rect = { left: 0, top: 0, width: 200, height: 100 } as DOMRect;
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue(rect);

    fireEvent.click(overlay, { clientX: 50, clientY: 50 });

    // Closing the dialog keeps the point; saving the sheet sends it.
    fireEvent.click(screen.getByRole("button", { name: "common.done" }));
    fireEvent.click(await screen.findByRole("button", { name: "common.save" }));

    await waitFor(() => expect(httpMock.patch).toHaveBeenCalled());

    const payload = httpMock.patch.mock.calls[0][1];
    expect(payload.focal_point).toEqual({ x: 25, y: 50 });
  });

  it("clears a focal point on remove and saves null", async () => {
    const item = {
      ...makeMediaItem(),
      focal_point: { x: 10, y: 20 },
    } as unknown as MediaItem;
    discoverWith({ crop: false, focal_point: "focal_point" }, item);
    renderEdit();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "media_library.focal_point.title",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "media_library.focal_point.remove",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "common.done" }));
    fireEvent.click(await screen.findByRole("button", { name: "common.save" }));

    await waitFor(() => expect(httpMock.patch).toHaveBeenCalled());

    const payload = httpMock.patch.mock.calls[0][1];
    expect(payload.focal_point).toBeNull();
  });

  it("does not call the crop endpoint without a crop selection", async () => {
    discoverWith({ crop: true, focal_point: null }, makeMediaItem());
    renderEdit();

    fireEvent.click(await screen.findByRole("button", { name: "common.save" }));

    await waitFor(() => expect(httpMock.patch).toHaveBeenCalled());

    expect(httpMock.post).not.toHaveBeenCalledWith(
      "/media-library/items/media-1/crop",
      expect.anything(),
    );
  });
});
