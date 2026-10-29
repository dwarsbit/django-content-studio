import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { AuthProvider } from "@/auth";
import { http } from "@/hooks/use-http";
import { safeRedirectPath } from "@/lib/utils";
import { UsernamePasswordBackend } from "@/pages/(auth)/login/_backends/username-password";
import { FieldType } from "@/types";

beforeEach(() => {
  http.interceptors.request.clear();
  http.interceptors.response.clear();
  delete http.defaults.headers.common["Authorization"];
  http.defaults.adapter = (config: InternalAxiosRequestConfig) =>
    Promise.resolve({
      data: config.url === "/login/usernamepassword" ? { access: "t" } : {},
      status: 200,
      statusText: "OK",
      headers: {},
      config,
      request: {},
    } as AxiosResponse);
});

function Where() {
  const location = useLocation();
  return <div>at:{`${location.pathname}${location.search}`}</div>;
}

function renderLogin(search: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/login",
        element: (
          <UsernamePasswordBackend
            config={{ username_field_type: FieldType.CharField }}
          />
        ),
      },
      { path: "*", element: <Where /> },
    ],
    { initialEntries: [`/login${search}`] },
  );

  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

async function signIn() {
  fireEvent.click(await screen.findByRole("button", { name: "login.submit" }));
}

describe("safeRedirectPath", () => {
  it("accepts a same-origin path", () => {
    expect(safeRedirectPath("/content/blog/article?page=2")).toBe(
      "/content/blog/article?page=2",
    );
  });

  it.each([
    null,
    "",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "javascript:alert(document.domain)",
    "https://evil.example",
    "content/blog",
  ])("falls back to / for %j", (redirect) => {
    expect(safeRedirectPath(redirect)).toBe("/");
  });
});

describe("UsernamePasswordBackend", () => {
  it("goes to the redirect path after signing in", async () => {
    renderLogin(
      `?${new URLSearchParams({ redirect: "/content/blog?page=2" })}`,
    );
    await signIn();

    expect(
      await screen.findByText("at:/content/blog?page=2"),
    ).toBeInTheDocument();
  });

  it.each(["//evil.example", "javascript:alert(document.domain)"])(
    "ignores the unsafe redirect %j",
    async (redirect) => {
      renderLogin(`?${new URLSearchParams({ redirect })}`);
      await signIn();

      expect(await screen.findByText("at:/")).toBeInTheDocument();
    },
  );
});
