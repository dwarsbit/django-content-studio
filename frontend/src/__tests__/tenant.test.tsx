import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import React, { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { http } from "@/hooks/use-http";
import { TenantProvider, useTenant } from "@/tenant";
import type { Resource } from "@/types";

const STORAGE_KEY = "__dcs_tenant__";

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: () => ({
    data: { multitenancy: { enabled: true, tenant_model: "shop.Shop" } },
  }),
}));

vi.mock("@/pages/(tenant)/tenant-setup/page", () => ({
  TenantSetupPage: () => <div>tenant setup</div>,
}));

let tenants: Resource[] = [];
let calls: { url: string; tenant: unknown }[] = [];

function installAdapter() {
  calls = [];
  http.defaults.adapter = (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? "";
    calls.push({ url, tenant: config.headers?.["X-DCS-Tenant"] });
    return Promise.resolve({
      data: url === "/tenants" ? tenants : {},
      status: 200,
      statusText: "OK",
      headers: {},
      config,
      request: {},
    } as AxiosResponse);
  };
}

// A tenant-scoped child that requests on mount, like the studio pages.
function ScopedChild() {
  const { tenantId } = useTenant();

  useEffect(() => {
    void http.get("/content");
  }, []);

  return <span>tenant:{tenantId}</span>;
}

function renderProvider() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TenantProvider>
        <ScopedChild />
      </TenantProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  delete http.defaults.headers.common["X-DCS-Tenant"];
  tenants = [
    { id: "a", __str__: "Shop A" },
    { id: "b", __str__: "Shop B" },
  ];
  installAdapter();
});

describe("TenantProvider", () => {
  it("replaces a stored tenant that is not in the tenant list", async () => {
    localStorage.setItem(STORAGE_KEY, "revoked");

    renderProvider();

    expect(await screen.findByText("tenant:a")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("a");
    expect(http.defaults.headers.common["X-DCS-Tenant"]).toBe("a");
    // No request ever carried the stale tenant.
    expect(calls.some((call) => call.tenant === "revoked")).toBe(false);
    await waitFor(() =>
      expect(calls.find((call) => call.url === "/content")?.tenant).toBe("a"),
    );
  });

  it("keeps a stored tenant that is in the tenant list", async () => {
    localStorage.setItem(STORAGE_KEY, "b");

    renderProvider();

    expect(await screen.findByText("tenant:b")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("b");
    await waitFor(() =>
      expect(calls.find((call) => call.url === "/content")?.tenant).toBe("b"),
    );
  });

  it("clears a stored tenant when the user has no tenants", async () => {
    localStorage.setItem(STORAGE_KEY, "revoked");
    tenants = [];

    renderProvider();

    expect(await screen.findByText("tenant setup")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(http.defaults.headers.common["X-DCS-Tenant"]).toBeUndefined();
    expect(calls.some((call) => call.tenant === "revoked")).toBe(false);
  });
});
