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

vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));
vi.mock("@/hooks/use-discover", () => ({
  useDiscover: () => ({
    data: {
      extensions: [
        {
          extension_id: "docs",
          extension_type: ExtensionType.UserMenuLink,
          config: {
            url: "https://docs.example.com",
            label: "Help",
            icon: null,
            color: null,
            weight: 5,
          },
        },
        {
          extension_id: "queue",
          extension_type: ExtensionType.UserMenuLink,
          config: {
            url: "/huey/",
            label: "Task queue",
            icon: null,
            color: null,
          },
        },
        {
          extension_id: "sessions",
          extension_type: ExtensionType.UserMenuButton,
          config: {
            label: "Sign out everywhere",
            icon: null,
            color: null,
            confirm: null,
            weight: 1,
          },
        },
        {
          extension_id: "website",
          extension_type: ExtensionType.MainMenuLink,
          config: {
            url: "https://example.com",
            label: "Website",
            icon: null,
            color: null,
          },
        },
      ],
      model_groups: [],
      models: [],
      media_library: { enabled: false },
    },
  }),
}));
vi.mock("@/hooks/use-admin-info", () => ({
  useAdminInfo: () => ({ data: undefined }),
}));
vi.mock("@/hooks/use-me", () => ({
  useMe: () => ({ data: { username: "leon", first_name: "", last_name: "" } }),
}));
vi.mock("@/auth", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderMenu() {
  const router = createMemoryRouter([
    {
      path: "*",
      element: (
        <ConfirmDialogProvider>
          <ValueDialogProvider>
            <MainMenu onOpenPalette={vi.fn()} />
          </ValueDialogProvider>
        </ConfirmDialogProvider>
      ),
    },
  ]);

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
}

describe("User menu extensions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("lists its links and buttons by weight, not in the main menu", async () => {
    const user = userEvent.setup();
    renderMenu();

    expect(screen.queryByText("Task queue")).not.toBeInTheDocument();
    await user.click(screen.getByText("leon"));

    const items = (await screen.findAllByRole("menuitem")).map(
      (item) => item.textContent,
    );
    expect(items).toEqual([
      "Task queue",
      "Sign out everywhere",
      "Help",
      "main_menu.log_out",
    ]);
  });

  it("opens external links in a new tab and paths in the admin", async () => {
    const user = userEvent.setup();
    const router = renderMenu();

    // The main menu's external links open in a new tab too.
    expect(screen.getByRole("link", { name: "Website" })).toHaveAttribute(
      "target",
      "_blank",
    );

    await user.click(screen.getByText("leon"));
    const help = await screen.findByRole("menuitem", { name: "Help" });
    expect(help).toHaveAttribute("href", "https://docs.example.com");
    expect(help).toHaveAttribute("target", "_blank");
    expect(help).toHaveAttribute("rel", "noopener noreferrer");

    await user.click(screen.getByRole("menuitem", { name: "Task queue" }));
    expect(router.state.location.pathname).toBe("/huey/");
  });

  it("runs a button", async () => {
    httpMock.post.mockResolvedValue({
      data: { message: "Signed out.", value: null },
    });
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByText("leon"));
    await user.click(
      await screen.findByRole("menuitem", { name: "Sign out everywhere" }),
    );

    expect(httpMock.post).toHaveBeenCalledWith("/extensions/sessions/run");
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Signed out."),
    );
  });
});
