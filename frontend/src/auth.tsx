import type { AxiosError } from "axios";
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

import { useHttp } from "@/hooks/use-http";
import { type AuthState } from "@/types";

const REFRESH_URL = "/tokens/jsonwebtoken/refresh";
const LOGOUT_URL = "/tokens/jsonwebtoken/logout";

const AuthContext = React.createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [init, setInit] = useState(false);
  // The access token lives in memory only. The matching refresh token is
  // an httpOnly cookie that never reaches JavaScript; requests carry
  // `Authorization: Bearer <access token>`.
  const [token, setToken] = useState<string | null>(null);
  const http = useHttp();
  const refreshInFlight = useRef<Promise<string | null> | null>(null);
  const retriedRequests = useRef(new WeakSet<object>());

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const { data } = await http.post<{ access: string }>(REFRESH_URL);
      setToken(data.access);
      return data.access;
    } catch {
      setToken(null);
      return null;
    }
  }, [http]);

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
      // The refresh cookie is cleared server-side regardless; reset the
      // local session either way.
    }
    setToken(null);
  }, [http]);

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
        !retriedRequests.current.has(config) &&
        config.url !== REFRESH_URL
      ) {
        retriedRequests.current.add(config);
        const newToken = await singleFlightRefresh();

        if (newToken) {
          config.headers.Authorization = `Bearer ${newToken}`;
          return http.request(config);
        }
      }

      throw error;
    });
  });

  useEffect(() => {
    if (token) {
      // eslint-disable-next-line react-hooks/immutability -- deliberate mutation of the shared axios instance
      http.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete http.defaults.headers.common["Authorization"];
    }
  }, [http.defaults.headers.common, token]);

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
      to={{ pathname: "/login", search: `redirect=${location.pathname}` }}
      replace
    />
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
