import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialogProvider } from "@/components/confirm-dialog-provider";
import { ValueDialogProvider } from "@/components/value-dialog-provider";
import { MainMenu } from "@/pages/(studio)/_components/main-menu";
import { ExtensionType } from "@/types";

const httpMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const useDiscoverMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));
vi.mock("@/hooks/use-discover", () => ({ useDiscover: useDiscoverMock }));
vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: () => ({ data: undefined }),
}));
vi.mock("@/hooks/use-me", () => ({ useMe: () => ({ data: undefined }) }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function discover(confirm: string | null = null) {
  return {
    data: {
      extensions: [
        {
          extension_id: "link-1",
          extension_type: ExtensionType.MainMenuLink,
          config: {
            url: "https://example.com",
            label: "Website",
            icon: null,
            color: null,
          },
        },
        {
          extension_id: "button-1",
          extension_type: ExtensionType.MainMenuButton,
          config: {
            label: "Deploy",
            icon: "ph-bold ph-rocket-launch",
            color: null,
            confirm,
          },
        },
      ],
      model_groups: [],
      models: [],
      media_library: { enabled: false },
    },
  };
}

function renderMenu() {
  const queryClient = new QueryClient();
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <ConfirmDialogProvider>
          <ValueDialogProvider>
            <MainMenu onOpenPalette={vi.fn()} />
          </ValueDialogProvider>
        </ConfirmDialogProvider>
      ),
    },
  ]);

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("Main menu buttons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("runs a button and shows its message", async () => {
    useDiscoverMock.mockReturnValue(discover());
    httpMock.post.mockResolvedValue({
      data: { message: "Deploying.", value: null },
    });

    renderMenu();
    expect(screen.getByText("Website")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Deploy/ }));

    expect(httpMock.post).toHaveBeenCalledWith("/extensions/button-1/run");
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Deploying."),
    );
  });

  it("confirms first, and shows a returned value once", async () => {
    useDiscoverMock.mockReturnValue(discover("Rebuild the site?"));
    httpMock.post.mockResolvedValue({
      data: { message: null, value: "build-42" },
    });
    const user = userEvent.setup();

    renderMenu();
    await user.click(screen.getByRole("button", { name: /Deploy/ }));

    expect(await screen.findByText("Rebuild the site?")).toBeInTheDocument();
    expect(httpMock.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "common.continue" }));

    expect(await screen.findByText("build-42")).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith("button.done");
  });

  it("orders links and buttons by weight, keeping ties in order", () => {
    const link = (id: string, label: string, weight?: number) => ({
      extension_id: id,
      extension_type: ExtensionType.MainMenuLink,
      config: { url: `/${id}`, label, icon: null, color: null, weight },
    });
    useDiscoverMock.mockReturnValue({
      data: {
        ...discover().data,
        extensions: [
          link("docs", "Docs", 10),
          link("blog", "Blog"),
          link("shop", "Shop"),
          {
            extension_id: "deploy",
            extension_type: ExtensionType.MainMenuButton,
            config: {
              label: "Deploy",
              icon: null,
              color: null,
              confirm: null,
              weight: -1,
            },
          },
        ],
      },
    });

    renderMenu();

    const labels = ["Deploy", "Blog", "Shop", "Docs"].map((label) =>
      screen.getByText(label),
    );
    for (let index = 1; index < labels.length; index++) {
      expect(
        labels[index - 1].compareDocumentPosition(labels[index]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});
