import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import {
  createMemoryRouter,
  RouterProvider,
  useSearchParams,
} from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { http } from "@/hooks/use-http";
import { ForgotPassword } from "@/pages/(auth)/forgot-password/_components/forgot-password";

function ResetPasswordProbe() {
  const [searchParams] = useSearchParams();
  return <span>email:{searchParams.get("email")}</span>;
}

beforeEach(() => {
  http.defaults.adapter = (config: InternalAxiosRequestConfig) =>
    Promise.resolve({
      data: {},
      status: 200,
      statusText: "OK",
      headers: {},
      config,
      request: {},
    } as AxiosResponse);
});

describe("ForgotPassword", () => {
  it.each(["jane+admin@example.com", "a&b#c@example.com"])(
    "carries %s to the reset page unchanged",
    async (email) => {
      const router = createMemoryRouter(
        [
          { path: "/forgot-password", element: <ForgotPassword /> },
          { path: "/reset-password", element: <ResetPasswordProbe /> },
        ],
        { initialEntries: ["/forgot-password"] },
      );
      render(
        <QueryClientProvider client={new QueryClient()}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );

      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: email },
      });
      fireEvent.click(screen.getByRole("button"));

      expect(await screen.findByText(`email:${email}`)).toBeInTheDocument();
    },
  );
});
