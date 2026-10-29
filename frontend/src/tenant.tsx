import { useQuery } from "@tanstack/react-query";
import * as R from "ramda";
import React, { useCallback, useContext, useEffect, useState } from "react";

import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import { storeTenant, TENANT_STORAGE_KEY } from "@/lib/tenant-storage";
import { TenantSetupPage } from "@/pages/(tenant)/tenant-setup/page";
import type { Resource } from "@/types";

interface TenantState {
  enabled: boolean;
  tenantId: string | null;
  tenant: Resource | null;
  tenants: Resource[];
  setTenant(tenant: string): void;
}

const TenantContext = React.createContext<TenantState>({} as TenantState);

export function TenantProvider({ children }: { children: React.ReactElement }) {
  const { data: discover } = useDiscover();
  const enabled = discover?.multitenancy.enabled ?? false;
  // The stored tenant is only a candidate: it may belong to another user
  // of this browser or have been revoked. It is not sent until the tenant
  // list confirms it.
  const [tenantId, setTenantId] = useState<string | null>(
    () => localStorage.getItem(TENANT_STORAGE_KEY) || null,
  );
  const [ready, setReady] = useState(false);
  const http = useHttp();
  const { data: tenants = [], isFetched } = useQuery({
    enabled,
    retry: false,
    queryKey: ["resources", discover?.multitenancy.tenant_model],
    async queryFn() {
      const { data } = await http.get<Resource[]>("/tenants");
      return data;
    },
  });
  const tenant = tenants.find(R.whereEq({ id: tenantId })) ?? null;

  // The header is set together with the state, not in an effect: child
  // mount effects run before a parent effect and would otherwise send the
  // previous tenant.
  const setTenant = useCallback((id: string | null) => {
    storeTenant(id);
    setTenantId(id);
  }, []);

  useEffect(() => {
    if (!enabled || !isFetched) {
      return;
    }
    const known = tenants.some((t) => t.id === tenantId);
    // Keeps a known tenant, otherwise falls back to the first one (or none).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- `ready` gates rendering until the tenant is checked against the list, so no child request can fire with a stale tenant
    setTenant(known ? tenantId : (tenants[0]?.id ?? null));
    setReady(true);
  }, [tenants, tenantId, enabled, isFetched, setTenant]);

  return !enabled || ready ? (
    <TenantContext.Provider
      value={{
        enabled,
        tenant,
        tenantId,
        tenants,
        setTenant,
      }}
    >
      {!enabled || !R.isEmpty(tenants) ? children : <TenantSetupPage />}
    </TenantContext.Provider>
  ) : null;
}

export function useTenant() {
  return useContext(TenantContext);
}
