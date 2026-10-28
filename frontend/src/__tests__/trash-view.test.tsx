import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContentTrashPage } from "@/pages/(studio)/content/[model]/trash/page";
import type { Model, ModelField, PaginatedResponse, Resource } from "@/types";
import { FieldType } from "@/types";

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));
const useDiscoverMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/hooks/use-http", () => ({
  useHttp: () => httpMock,
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: useDiscoverMock,
}));

vi.mock("@/hooks/use-confirm-dialog", () => ({
  default: () => confirmMock,
}));

vi.mock("sonner", () => ({
  toast: toastMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options && "model" in options ? `${key}:${options.model}` : key,
    i18n: { language: "en" },
  }),
}));

const noteFields: Record<string, ModelField> = {
  title: { type: FieldType.CharField, verbose_name: "Title" },
};

function makeModel(overrides: Partial<Model["admin"]> = {}): Model {
  return {
    label: "testapp.note",
    verbose_name: "Note",
    verbose_name_plural: "Notes",
    tenant_field: null,
    admin: {
      is_singleton: false,
      icon: null,
      list: {
        per_page: 10,
        description: "",
        display: [{ name: "title", header: null, format: null }],
        search: false,
        filter: [],
        trash: true,
        sortable_by: null,
        actions: [],
      },
      edit: { main: [], sidebar: [], inlines: [] },
      permissions: {
        add_permission: true,
        change_permission: true,
        delete_permission: true,
        view_permission: true,
      },
      ...overrides,
    },
    fields: noteFields,
  };
}

function makePaginated(results: Resource[]): PaginatedResponse<Resource> {
  return {
    pagination: { count: results.length, current: 1, pages: 1 },
    results,
  };
}

const trashed: Resource[] = [
  { id: "2", __str__: "Second note", removed_at: "2026-10-12T10:00:00Z" },
  { id: "1", __str__: "First note", removed_at: "2026-10-11T10:00:00Z" },
];

function renderTrashPage(model: Model) {
  useDiscoverMock.mockReturnValue({ data: { models: [model] } });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/content/testapp.note/trash"]}>
        <Routes>
          <Route path="/content/:model/trash" element={<ContentTrashPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ContentTrashPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue(true);
    httpMock.get.mockReset();
    httpMock.post.mockReset();
    httpMock.delete.mockReset();
    httpMock.get.mockResolvedValue({ data: makePaginated(trashed) });
  });

  it("lists trashed rows with their removal time and actions", async () => {
    renderTrashPage(makeModel());

    expect(await screen.findByText("First note")).toBeInTheDocument();
    expect(screen.getByText("Second note")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "trash.restore" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: "trash.delete_permanently" }),
    ).toHaveLength(2);
    expect(httpMock.get).toHaveBeenCalledWith("/content/testapp.note/trash", {
      params: { page: 1 },
    });
  });

  it("restores a row through the restore endpoint and refetches", async () => {
    const user = userEvent.setup();
    renderTrashPage(makeModel());

    const buttons = await screen.findAllByRole("button", {
      name: "trash.restore",
    });
    await user.click(buttons[0]);

    await waitFor(() =>
      expect(httpMock.post).toHaveBeenCalledWith(
        "/content/testapp.note/2/restore",
      ),
    );
    expect(toastMock.success).toHaveBeenCalledWith("trash.restored");
    // The trash list refetches after the mutation.
    await waitFor(() => expect(httpMock.get).toHaveBeenCalledTimes(2));
  });

  it("asks for confirmation before deleting permanently", async () => {
    const user = userEvent.setup();
    renderTrashPage(makeModel());

    const buttons = await screen.findAllByRole("button", {
      name: "trash.delete_permanently",
    });
    await user.click(buttons[0]);

    expect(confirmMock).toHaveBeenCalledWith({
      description: "trash.delete_confirm",
    });
    await waitFor(() =>
      expect(httpMock.delete).toHaveBeenCalledWith(
        "/content/testapp.note/2/destroy",
      ),
    );
  });

  it("does not delete permanently when the confirmation is declined", async () => {
    confirmMock.mockResolvedValue(false);
    const user = userEvent.setup();
    renderTrashPage(makeModel());

    const buttons = await screen.findAllByRole("button", {
      name: "trash.delete_permanently",
    });
    await user.click(buttons[0]);

    expect(httpMock.delete).not.toHaveBeenCalled();
  });

  it("hides the restore and delete buttons without permissions", async () => {
    renderTrashPage(
      makeModel({
        permissions: {
          add_permission: false,
          change_permission: false,
          delete_permission: false,
          view_permission: true,
        },
      }),
    );

    await screen.findByText("First note");
    expect(
      screen.queryByRole("button", { name: "trash.restore" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "trash.delete_permanently" }),
    ).not.toBeInTheDocument();
  });

  it("shows the unavailable state for models without a trash", async () => {
    const model = makeModel();
    model.admin.list.trash = false;

    renderTrashPage(model);

    expect(await screen.findByText("trash.unavailable")).toBeInTheDocument();
    expect(httpMock.get).not.toHaveBeenCalled();
  });
});
