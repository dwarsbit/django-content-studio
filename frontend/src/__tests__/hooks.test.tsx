import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAdminInfo } from "@/hooks/use-admin-info";
import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { useCreateFolder } from "@/hooks/use-create-folder";
import { useCreateMedia } from "@/hooks/use-create-media";
import { useDeleteFolder } from "@/hooks/use-delete-folder";
import { useDeleteMedia } from "@/hooks/use-delete-media";
import { useDiscover } from "@/hooks/use-discover";
import { useEscape } from "@/hooks/use-escape";
import { useFolderPath } from "@/hooks/use-folder-path";
import { useHttp } from "@/hooks/use-http";
import { useListFolder } from "@/hooks/use-list-folder";
import { useListMedia } from "@/hooks/use-list-media";
import { useMe } from "@/hooks/use-me";
import { useRetrieveMedia } from "@/hooks/use-retrieve-media";
import { useUpdateFolder } from "@/hooks/use-update-folder";
import { useUpdateMedia } from "@/hooks/use-update-media";
import { ConfirmDialogContext } from "@/lib/confirm-dialog-context";
import type {
  AdminInfo,
  MediaItem,
  PaginatedResponse,
  SessionUser,
} from "@/types";
import { TokenBackendType } from "@/types";

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  postForm: vi.fn(),
}));

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => httpMock,
}));

const DISCOVER_FIXTURE = {
  dashboard: { widgets: [] },
  extensions: [],
  model_groups: [],
  models: [],
  user_model: "auth.user",
  multitenancy: { enabled: false, tenant_model: null },
  media_library: {
    enabled: true,
    folders: true,
    models: { media_model: "media.image", folder_model: "media.folder" },
  },
};

function makeAdminInfo(overrides: Partial<AdminInfo> = {}): AdminInfo {
  return {
    site_header: "Content Studio",
    site_title: "Content Studio",
    index_title: "Dashboard",
    site_url: "/",
    health_check: null,
    version: "1.0.0-rc.1",
    login_backends: [],
    token_backend: {
      type: TokenBackendType.JsonWebToken,
      config: { ACCESS_TOKEN_LIFETIME: 1800, REFRESH_TOKEN_LIFETIME: 604800 },
    },
    formats: {} as AdminInfo["formats"],
    widgets: {} as AdminInfo["widgets"],
    settings: {
      created_at_attr: "created_at",
      created_by_attr: "created_by",
      edited_at_attr: "edited_at",
      edited_by_attr: "edited_by",
    },
    ...overrides,
  };
}

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

function paginated<T>(results: T[]): PaginatedResponse<T> {
  return {
    pagination: { count: results.length, current: 1, pages: 1 },
    results,
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

  return { Wrapper, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useHttp", () => {
  it("returns the shared axios instance", () => {
    const { result } = renderHook(() => useHttp());

    expect(result.current).toBe(httpMock);
  });
});

describe("useAdminInfo", () => {
  it("fetches the admin info from /info", async () => {
    const info = makeAdminInfo();
    httpMock.get.mockResolvedValue({ data: info });

    const { result } = renderHook(() => useAdminInfo(), {
      wrapper: makeWrapper().Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(info));
    expect(httpMock.get).toHaveBeenCalledWith("/info");
  });
});

describe("useMe", () => {
  it("fetches the session user from /me", async () => {
    const me: SessionUser = {
      id: "1",
      first_name: "Leon",
      last_name: "van der Grient",
      username: "leon",
    };
    httpMock.get.mockResolvedValue({ data: me });

    const { result } = renderHook(() => useMe(), {
      wrapper: makeWrapper().Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(me));
    expect(httpMock.get).toHaveBeenCalledWith("/me");
  });
});

describe("useDiscover", () => {
  it("fetches the discovery document from /discover", async () => {
    httpMock.get.mockResolvedValue({ data: DISCOVER_FIXTURE });

    const { result } = renderHook(() => useDiscover(), {
      wrapper: makeWrapper().Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(DISCOVER_FIXTURE));
    expect(httpMock.get).toHaveBeenCalledWith("/discover");
  });
});

describe("useListMedia", () => {
  it("lists media items once the media model is known", async () => {
    const items = paginated([makeMediaItem()]);
    httpMock.get.mockImplementation((url: string) => {
      if (url === "/discover") {
        return Promise.resolve({ data: DISCOVER_FIXTURE });
      }
      if (url === "/media-library/items") {
        return Promise.resolve({ data: items });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    const { result } = renderHook(
      () =>
        useListMedia({ folder: null, page: 1, filters: { search: undefined } }),
      { wrapper: makeWrapper().Wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual(items));
    expect(httpMock.get).toHaveBeenCalledWith("/media-library/items", {
      params: { folder: "root", search: undefined, page: 1 },
    });
  });

  it("scopes the folder when searching within a folder", async () => {
    httpMock.get.mockImplementation((url: string) => {
      if (url === "/discover") {
        return Promise.resolve({ data: DISCOVER_FIXTURE });
      }
      if (url === "/media-library/items") {
        return Promise.resolve({ data: paginated([]) });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderHook(
      () =>
        useListMedia({
          folder: "folder-1",
          page: 2,
          filters: { search: "photo", searchInFolder: true },
        }),
      { wrapper: makeWrapper().Wrapper },
    );

    await waitFor(() =>
      expect(httpMock.get).toHaveBeenCalledWith("/media-library/items", {
        params: { folder: "folder-1", search: "photo", page: 2 },
      }),
    );
  });

  it("searches across folders when not searching in a folder", async () => {
    httpMock.get.mockImplementation((url: string) => {
      if (url === "/discover") {
        return Promise.resolve({ data: DISCOVER_FIXTURE });
      }
      if (url === "/media-library/items") {
        return Promise.resolve({ data: paginated([]) });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderHook(
      () =>
        useListMedia({
          folder: "folder-1",
          filters: { search: "photo", searchInFolder: false },
        }),
      { wrapper: makeWrapper().Wrapper },
    );

    await waitFor(() =>
      expect(httpMock.get).toHaveBeenCalledWith("/media-library/items", {
        params: { folder: undefined, search: "photo", page: undefined },
      }),
    );
  });
});

describe("useListFolder", () => {
  it("lists folders for a parent", async () => {
    const folders = paginated([
      { id: "folder-1", name: "Blog", parent: null, has_children: false },
    ]);
    httpMock.get.mockResolvedValue({ data: folders });

    const { result } = renderHook(
      () => useListFolder({ parent: null, page: 1 }),
      { wrapper: makeWrapper().Wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual(folders));
    expect(httpMock.get).toHaveBeenCalledWith("/media-library/folders", {
      params: { parent: null, page: 1, limit: 10 },
    });
  });
});

describe("useRetrieveMedia", () => {
  it("retrieves a single media item", async () => {
    const item = makeMediaItem();
    httpMock.get.mockImplementation((url: string) => {
      if (url === "/discover") {
        return Promise.resolve({ data: DISCOVER_FIXTURE });
      }
      if (url === "/media-library/items/media-1") {
        return Promise.resolve({ data: item });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    const { result } = renderHook(() => useRetrieveMedia("media-1"), {
      wrapper: makeWrapper().Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(item));
    expect(httpMock.get).toHaveBeenCalledWith("/media-library/items/media-1");
  });
});

describe("useFolderPath", () => {
  it("fetches the folder path for a folder", async () => {
    const path = [{ name: "Blog", id: "folder-1" }];
    httpMock.get.mockResolvedValue({ data: path });

    const { result } = renderHook(() => useFolderPath("folder-1"), {
      wrapper: makeWrapper().Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(path));
    expect(httpMock.get).toHaveBeenCalledWith("/media-library/folders/path", {
      params: { folder: "folder-1" },
    });
  });
});

describe("useCreateMedia", () => {
  it("uploads a new media item and invalidates the item list", async () => {
    const created = makeMediaItem({ id: "media-2" });
    httpMock.postForm.mockResolvedValue({ data: created });
    const { Wrapper, queryClient } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateMedia(), { wrapper: Wrapper });
    const file = new File(["bytes"], "photo.png", { type: "image/png" });

    let returned: MediaItem | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({
        folder: null,
        name: "photo.png",
        file,
        type: "image",
      });
    });

    expect(returned).toEqual(created);
    expect(httpMock.postForm).toHaveBeenCalledWith(
      "/media-library/items",
      { folder: null, name: "photo.png", file, type: "image" },
      expect.objectContaining({
        headers: { "Content-Type": "multipart/form-data" },
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["media-library", "items"],
    });
  });
});

describe("useUpdateMedia", () => {
  it("patches a media item without the file field", async () => {
    const updated = makeMediaItem({ alt_text: "New alt" });
    httpMock.patch.mockResolvedValue({ data: updated });
    const { Wrapper, queryClient } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateMedia(), { wrapper: Wrapper });

    let returned: MediaItem | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync(makeMediaItem());
    });

    expect(returned).toEqual(updated);
    expect(httpMock.patch).toHaveBeenCalledWith(
      "/media-library/items/media-1",
      expect.not.objectContaining({ file: expect.anything() }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["media-library", "items"],
    });
  });
});

describe("useDeleteMedia", () => {
  it("deletes a media item and invalidates the item list", async () => {
    httpMock.delete.mockResolvedValue({ status: 204 });
    const { Wrapper, queryClient } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteMedia(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("media-1");
    });

    expect(httpMock.delete).toHaveBeenCalledWith(
      "/media-library/items/media-1",
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["media-library", "items"],
    });
  });
});

describe("useCreateFolder", () => {
  it("creates a folder and invalidates folders and paths", async () => {
    httpMock.post.mockResolvedValue({ data: { id: "folder-2" } });
    const { Wrapper, queryClient } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateFolder(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ name: "New folder", parent: null });
    });

    expect(httpMock.post).toHaveBeenCalledWith("/media-library/folders", {
      name: "New folder",
      parent: null,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["media-library", "folders"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["media-library", "folder-path"],
    });
  });
});

describe("useUpdateFolder", () => {
  it("renames a folder and invalidates folders and paths", async () => {
    httpMock.put.mockResolvedValue({ data: { id: "folder-1" } });
    const { Wrapper, queryClient } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateFolder(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "folder-1", name: "Renamed" });
    });

    expect(httpMock.put).toHaveBeenCalledWith(
      "/media-library/folders/folder-1",
      {
        name: "Renamed",
      },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["media-library", "folders"],
    });
  });
});

describe("useDeleteFolder", () => {
  it("deletes a folder and invalidates folders and paths", async () => {
    httpMock.delete.mockResolvedValue({ status: 204 });
    const { Wrapper, queryClient } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteFolder(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync("folder-1");
    });

    expect(httpMock.delete).toHaveBeenCalledWith(
      "/media-library/folders/folder-1",
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["media-library", "folders"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["media-library", "folder-path"],
    });
  });
});

describe("useEscape", () => {
  it("calls the handler on Escape presses and stops after unmount", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useEscape(handler));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handler).toHaveBeenCalledTimes(1);

    unmount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ignores keys other than Escape", () => {
    const handler = vi.fn();
    renderHook(() => useEscape(handler));

    fireEvent.keyDown(window, { key: "Enter" });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("useConfirmDialog", () => {
  it("registers a dialog and resolves true on confirm, false on cancel", async () => {
    const setDialogMock = vi.fn();
    const { result } = renderHook(() => useConfirmDialog(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <ConfirmDialogContext.Provider value={{ setDialog: setDialogMock }}>
          {children}
        </ConfirmDialogContext.Provider>
      ),
    });

    let registered: {
      onOk: () => void;
      onCancel: () => void;
    } | null = null;
    setDialogMock.mockImplementation((dialog) => {
      registered = dialog;
    });

    let confirmed: boolean | undefined;
    const confirmation = result
      .current({ title: "Delete?", description: "Really?" })
      .then((value) => {
        confirmed = value;
      });

    await waitFor(() => expect(registered).not.toBeNull());
    expect(setDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Delete?", description: "Really?" }),
    );

    act(() => {
      registered?.onOk();
    });
    await confirmation;
    expect(confirmed).toBe(true);

    // Second round: cancelling resolves false.
    const cancelConfirmation = result
      .current({ title: "Delete?", description: "Really?" })
      .then((value) => {
        confirmed = value;
      });

    await waitFor(() => expect(setDialogMock).toHaveBeenCalledTimes(2));
    act(() => {
      registered?.onCancel();
    });
    await cancelConfirmation;
    expect(confirmed).toBe(false);
  });
});
