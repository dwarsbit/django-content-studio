import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useUpload } from "@/hooks/use-upload";
import type { MediaItem } from "@/types";

const createMediaMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-create-media", () => ({
  useCreateMedia: () => ({ mutateAsync: createMediaMock }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn(), loading: vi.fn() },
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

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return Wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useUpload", () => {
  it("uploads every file and returns the created media items", async () => {
    createMediaMock.mockImplementation(({ name, type }) =>
      Promise.resolve(makeMediaItem({ id: `media-${name}`, type })),
    );

    const { result } = renderHook(() => useUpload(), {
      wrapper: makeWrapper(),
    });

    let uploaded: unknown;
    await act(async () => {
      uploaded = await result.current([
        new File(["a"], "a.png", { type: "image/png" }),
        new File(["b"], "b.png", { type: "image/png" }),
      ]);
    });

    expect(createMediaMock).toHaveBeenCalledTimes(2);
    expect(createMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "a.png", type: "image" }),
    );
    expect((uploaded as MediaItem[]).map((item) => item.id)).toEqual([
      "media-a.png",
      "media-b.png",
    ]);
  });

  it("classifies non-image files as file uploads", async () => {
    createMediaMock.mockResolvedValue(makeMediaItem());

    const { result } = renderHook(() => useUpload(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current([
        new File(["x"], "doc.pdf", { type: "application/pdf" }),
      ]);
    });

    expect(createMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "doc.pdf", type: "file" }),
    );
  });

  it("toasts and skips files that fail to upload", async () => {
    createMediaMock.mockRejectedValue({
      response: { data: ["Upload failed"] },
    });

    const { result } = renderHook(() => useUpload(), {
      wrapper: makeWrapper(),
    });

    let uploaded: unknown;
    await act(async () => {
      uploaded = await result.current([
        new File(["a"], "a.png", { type: "image/png" }),
      ]);
    });

    expect(toastErrorMock).toHaveBeenCalledWith("Upload failed");
    expect(uploaded).toEqual([undefined]);
  });
});
