import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SetPasswordPage } from "@/pages/(auth)/set-password/page";

const httpMock = vi.hoisted(() => ({ post: vi.fn() }));
const setToken = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/hooks/use-http", () => ({ useHttp: () => httpMock }));
vi.mock("@/auth", () => ({ useAuth: () => ({ setToken }) }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key}:${Object.values(options).join(",")}` : key,
  }),
}));

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: "/set-password", element: <SetPasswordPage /> },
      { path: "/", element: <span>dashboard</span> },
      { path: "/login", element: <span>login</span> },
    ],
    { initialEntries: ["/set-password?uid=Mg&token=abc-123"] },
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function linkIs(user: object | null) {
  httpMock.post.mockImplementation((url: string) => {
    if (url === "/set-password/check") {
      return user
        ? Promise.resolve({ data: user })
        : Promise.reject(new Error("invalid"));
    }
    return Promise.resolve({ data: { access: "token" } });
  });
}

describe("Set password page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("welcomes an invited user and logs them in", async () => {
    linkIs({ username: "maya", name: "Maya", invite: true });
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText("set_password.welcome:Maya"),
    ).toBeInTheDocument();
    expect(screen.getByText("set_password.subtitle:maya")).toBeInTheDocument();

    await user.type(screen.getByLabelText("set_password.new"), "Lantern-42");
    await user.type(
      screen.getByLabelText("set_password.confirm"),
      "Lantern-42",
    );
    await user.click(
      screen.getByRole("button", { name: "set_password.submit" }),
    );

    await waitFor(() =>
      expect(httpMock.post).toHaveBeenCalledWith("/set-password", {
        uid: "Mg",
        token: "abc-123",
        password: "Lantern-42",
      }),
    );
    expect(setToken).toHaveBeenCalledWith("token");
    expect(await screen.findByText("dashboard")).toBeInTheDocument();
  });

  it("asks for the same password twice", async () => {
    linkIs({ username: "maya", name: "Maya", invite: false });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("set_password.title")).toBeInTheDocument();
    await user.type(screen.getByLabelText("set_password.new"), "one");
    await user.type(screen.getByLabelText("set_password.confirm"), "two");
    await user.click(
      screen.getByRole("button", { name: "set_password.submit" }),
    );

    expect(
      await screen.findByText("set_password.mismatch"),
    ).toBeInTheDocument();
    expect(httpMock.post).toHaveBeenCalledTimes(1);
  });

  it("shows the validators' messages", async () => {
    linkIs({ username: "maya", name: "Maya", invite: false });
    httpMock.post.mockImplementation((url: string) =>
      url === "/set-password/check"
        ? Promise.resolve({ data: { username: "maya", name: "Maya" } })
        : Promise.reject({
            isAxiosError: true,
            response: {
              status: 400,
              data: { password: ["This password is too short."] },
            },
          }),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("set_password.title");
    await user.type(screen.getByLabelText("set_password.new"), "short");
    await user.type(screen.getByLabelText("set_password.confirm"), "short");
    await user.click(
      screen.getByRole("button", { name: "set_password.submit" }),
    );

    expect(
      await screen.findByText("This password is too short."),
    ).toBeInTheDocument();
    expect(setToken).not.toHaveBeenCalled();
  });

  it("says when a link is no longer valid", async () => {
    linkIs(null);
    renderPage();

    expect(await screen.findByText("set_password.invalid")).toBeInTheDocument();
    expect(screen.queryByLabelText("set_password.new")).toBeNull();
  });
});
