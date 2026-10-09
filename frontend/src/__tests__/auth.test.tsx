import { render, screen, waitFor } from "@testing-library/react";
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { AuthGuard, AuthProvider, useAuth } from "@/auth";
import { http } from "@/hooks/use-http";

const REFRESH_URL = "/tokens/jsonwebtoken/refresh";
const LOGOUT_URL = "/tokens/jsonwebtoken/logout";

type AdapterCall = { url: string; config: InternalAxiosRequestConfig };
type AdapterResult = { data: unknown; status?: number } | AxiosError;

let calls: AdapterCall[] = [];
let respond: (
  url: string,
  config: InternalAxiosRequestConfig,
  call: number,
) => AdapterResult;

function makeError(
  status: number,
  config: InternalAxiosRequestConfig,
): AxiosError {
  const error = new AxiosError("Request failed", String(status), config);
  error.status = status;
  return error;
}

function installAdapter() {
  calls = [];
  http.defaults.adapter = (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? "";
    calls.push({ url, config });
    const result = respond(
      url,
      config,
      calls.filter((c) => c.url === url).length,
    );
    if (result instanceof AxiosError) {
      return Promise.reject(result);
    }
    return Promise.resolve({
      data: result.data,
      status: result.status ?? 200,
      statusText: "OK",
      headers: {},
      config,
      request: {},
    } as AxiosResponse);
  };
}

function callsTo(url: string) {
  return calls.filter((call) => call.url === url).length;
}

function TestApp({ onLogout }: { onLogout?: boolean }) {
  const { token, logout } = useAuth();

  return (
    <div>
      <span>{token ? `token:${token}` : "anonymous"}</span>
      {onLogout && <button onClick={() => logout()}>log out</button>}
    </div>
  );
}

function renderApp({ onLogout = false } = {}) {
  const router = createMemoryRouter(
    [
      {
        element: <AuthGuard />,
        children: [{ path: "/", element: <TestApp onLogout={onLogout} /> }],
      },
      { path: "/login", element: <div>login page</div> },
    ],
    { initialEntries: ["/"] },
  );

  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  http.interceptors.request.clear();
  http.interceptors.response.clear();
  delete http.defaults.headers.common["Authorization"];
  installAdapter();
});

describe("AuthProvider", () => {
  it("silently restores the session from the refresh cookie on boot", async () => {
    respond = (url) =>
      url === REFRESH_URL
        ? { data: { access: "boot-token" }, status: 200 }
        : { data: {} };

    renderApp();

    expect(await screen.findByText("token:boot-token")).toBeInTheDocument();
    expect(callsTo(REFRESH_URL)).toBe(1);
    // The access token authenticates requests through the Bearer header.
    expect(http.defaults.headers.common["Authorization"]).toBe(
      "Bearer boot-token",
    );
  });

  it("renders unauthenticated and redirects to the login page when there is no session", async () => {
    respond = (url, config) =>
      url === REFRESH_URL ? makeError(401, config) : { data: {}, status: 200 };

    renderApp();

    expect(await screen.findByText("login page")).toBeInTheDocument();
    expect(http.defaults.headers.common["Authorization"]).toBeUndefined();
  });

  it("refreshes once and retries a request that ran into a 401", async () => {
    respond = (url, config, call) => {
      if (url === REFRESH_URL) {
        return { data: { access: "fresh-token" }, status: 200 };
      }
      if (url === "/content/x" && call === 1) {
        return makeError(401, config);
      }
      return { data: { ok: true }, status: 200 };
    };

    renderApp();
    await screen.findByText("token:fresh-token");
    const refreshCallsAfterBoot = callsTo(REFRESH_URL);

    const response = await http.get("/content/x");

    expect(response.data).toEqual({ ok: true });
    // Boot refresh + one refresh triggered by the 401.
    expect(callsTo(REFRESH_URL)).toBe(refreshCallsAfterBoot + 1);
    expect(http.defaults.headers.common["Authorization"]).toBe(
      "Bearer fresh-token",
    );
  });

  it("shares a single refresh between concurrent 401s", async () => {
    respond = (url, config, call) => {
      if (url === REFRESH_URL) {
        return { data: { access: `token-${call}` }, status: 200 };
      }
      // Both resources reject once, then succeed.
      if (call === 1) {
        return makeError(401, config);
      }
      return { data: { ok: true }, status: 200 };
    };

    renderApp();
    await screen.findByText(/token:/);
    const refreshCallsAfterBoot = callsTo(REFRESH_URL);

    const [first, second] = await Promise.all([
      http.get("/content/a"),
      http.get("/content/b"),
    ]);

    expect(first.data).toEqual({ ok: true });
    expect(second.data).toEqual({ ok: true });
    // Two 401s, one shared refresh call.
    expect(callsTo(REFRESH_URL)).toBe(refreshCallsAfterBoot + 1);
  });

  it("ends the session when a 401 cannot be refreshed", async () => {
    let refreshCalls = 0;

    respond = (url, config) => {
      if (url === REFRESH_URL) {
        refreshCalls += 1;
        // The boot refresh succeeds, the later one fails.
        return refreshCalls === 1
          ? { data: { access: "boot-token" }, status: 200 }
          : makeError(401, config);
      }
      return makeError(401, config);
    };

    renderApp();
    await screen.findByText("token:boot-token");

    await expect(http.get("/content/x")).rejects.toMatchObject({ status: 401 });

    expect(await screen.findByText("login page")).toBeInTheDocument();
  });

  it("logs out through the token endpoint and clears the session", async () => {
    respond = (url) =>
      url === REFRESH_URL
        ? { data: { access: "boot-token" }, status: 200 }
        : { data: {} };

    renderApp({ onLogout: true });
    await screen.findByText("token:boot-token");

    await waitFor(() => screen.getByText("log out").click());

    await waitFor(() =>
      expect(screen.getByText("login page")).toBeInTheDocument(),
    );
    expect(callsTo(LOGOUT_URL)).toBe(1);
    expect(http.defaults.headers.common["Authorization"]).toBeUndefined();
  });
});
