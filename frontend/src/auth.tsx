import { useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import i18n from "i18next";
import * as R from "ramda";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useEffectOnce } from "react-use";
import { toast } from "sonner";

import { http } from "@/hooks/use-http";
import { storeTenant } from "@/lib/tenant-storage";
import { type AuthState } from "@/types";

const REFRESH_URL = "/tokens/jsonwebtoken/refresh";
const LOGOUT_URL = "/tokens/jsonwebtoken/logout";

// axios merges the config of every request into a new object, so a retry
// is marked on the config itself rather than tracked by identity.
declare module "axios" {
  interface AxiosRequestConfig {
    __isRetry?: boolean;
  }
}

const AuthContext = React.createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [init, setInit] = useState(false);
  // The access token lives in memory only. The matching refresh token is
  // an httpOnly cookie that never reaches JavaScript; requests carry
  // `Authorization: Bearer <access token>`.
  const [token, setTokenState] = useState<string | null>(null);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);
  const queryClient = useQueryClient();

  // The Authorization header is set the moment the token changes, not in an
  // effect: child mount effects (e.g. the discover query, which is
  // cached forever) dispatch requests before a parent effect would run, and
  // would otherwise send them unauthenticated.
  const setToken = useCallback((token: string | null) => {
    setTokenState(token);
    if (token) {
      http.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete http.defaults.headers.common["Authorization"];
    }
  }, []);

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const { data } = await http.post<{ access: string }>(REFRESH_URL);
      setToken(data.access);
      return data.access;
    } catch {
      setToken(null);
      return null;
    }
  }, [setToken]);

  // Concurrent 401s share a single refresh call.
  const singleFlightRefresh = useCallback(() => {
    if (!refreshInFlight.current) {
      refreshInFlight.current = refresh().finally(() => {
        refreshInFlight.current = null;
      });
    }
    return refreshInFlight.current;
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await http.post(LOGOUT_URL);
    } catch {
      // Only the logout response clears the httpOnly refresh cookie.
      // Without it, the cookie would sign the user back in on the next
      // page load, so the session stays and the user can try again.
      toast.error(i18n.t("app.log_out_failed"));
      return false;
    }
    setToken(null);
    // The next user of this browser picks their own tenant.
    storeTenant(null);
    // Cached responses (discover, content) belong to the signed-out user;
    // the next user starts without them.
    queryClient.clear();
    return true;
  }, [setToken, queryClient]);

  // Silent session restore on boot, gated so no child request can fire
  // before the Authorization header is in place.
  useEffect(() => {
    let cancelled = false;
    singleFlightRefresh().finally(() => {
      if (!cancelled) {
        setInit(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [singleFlightRefresh]);

  // On a 401, refresh once and retry the original request with the new
  // token; if the refresh fails the session ends.
  useEffectOnce(() => {
    http.interceptors.response.use(undefined, async (error: AxiosError) => {
      const config = error.config;

      if (
        error.status === 401 &&
        config &&
        !config.__isRetry &&
        config.url !== REFRESH_URL
      ) {
        const newToken = await singleFlightRefresh();

        if (newToken) {
          config.headers.Authorization = `Bearer ${newToken}`;
          return http.request({ ...config, __isRetry: true });
        }
      }

      throw error;
    });
  });

  return init ? (
    <AuthContext.Provider
      value={{
        token,
        setToken,
        isAuthenticated: !R.isNil(token),
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  ) : null;
}

export function AuthGuard() {
  const auth = useAuth();
  const location = useLocation();

  return auth.isAuthenticated ? (
    <Outlet />
  ) : (
    <Navigate
      to={{
        pathname: "/login",
        search: new URLSearchParams({
          redirect: `${location.pathname}${location.search}`,
        }).toString(),
      }}
      replace
    />
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
