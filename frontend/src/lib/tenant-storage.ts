import { http } from "@/hooks/use-http";

/** Where the selected tenant is remembered between sessions. */
export const TENANT_STORAGE_KEY = "__dcs_tenant__";
export const TENANT_HEADER = "X-DCS-Tenant";

/**
 * Selects the tenant every request is scoped to: stores it and sets the
 * header at once, so no request goes out with the previous one. `null`
 * clears both.
 */
export function storeTenant(tenantId: string | null) {
  if (tenantId) {
    localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
    http.defaults.headers.common[TENANT_HEADER] = tenantId;
  } else {
    localStorage.removeItem(TENANT_STORAGE_KEY);
    delete http.defaults.headers.common[TENANT_HEADER];
  }
}
