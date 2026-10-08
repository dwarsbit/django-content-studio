import { useQuery } from "@tanstack/react-query";
import * as R from "ramda";
import React, { useContext, useEffect, useState } from "react";

import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import { TenantSetupPage } from "@/pages/(tenant)/tenant-setup/page";
import type { Resource } from "@/types";

interface TenantState {
  enabled: boolean;
  tenantId: string | null;
  tenant: Resource | null;
  tenants: Resource[];
  setTenant(tenant: string): void;
}

const LOCALE_STORAGE_KEY = "__dcs_tenant__";
const TenantContext = React.createContext<TenantState>({} as TenantState);

export function TenantProvider({ children }: { children: React.ReactElement }) {
  const [init, setInit] = useState(false);
  const { data: discover } = useDiscover();
  const enabled = discover?.multitenancy.enabled ?? false;
  const [tenantId, setTenant] = useState<string | null>(
    localStorage.getItem(LOCALE_STORAGE_KEY) || null,
  );
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

  useEffect(() => {
    if (tenantId && enabled) {
      localStorage.setItem(LOCALE_STORAGE_KEY, tenantId);
      // eslint-disable-next-line react-hooks/immutability -- deliberate mutation of the shared axios instance
      http.defaults.headers.common["X-DCS-Tenant"] = tenantId;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- `init` gates rendering until the tenant header is set, so no child request can fire unscoped
    setInit(true);
  }, [http.defaults.headers.common, tenantId, enabled]);

  useEffect(() => {
    if (enabled && !tenantId && isFetched) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-selects the first tenant once the list is known; there is no earlier point where `tenants` exists
      setTenant(tenants[0]?.id ?? null);
    }
  }, [tenants, tenantId, enabled, isFetched]);

  return init && (isFetched || !enabled) ? (
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
