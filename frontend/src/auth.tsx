import * as R from "ramda";
import React, { useContext, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useEffectOnce } from "react-use";

import { useHttp } from "@/hooks/use-http";
import { type AuthState } from "@/types";

const LOCALE_STORAGE_KEY = "__dcs_token__";
const AuthContext = React.createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [init, setInit] = useState(false);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem(LOCALE_STORAGE_KEY) ?? null,
  );
  const http = useHttp();

  // Clear session on 401
  useEffectOnce(() => {
    http.interceptors.response.use(undefined, (error) => {
      if (error.status === 401) {
        setToken(null);
      }
      throw error;
    });
  });

  useEffect(() => {
    if (token) {
      localStorage.setItem(LOCALE_STORAGE_KEY, token);
      // eslint-disable-next-line react-hooks/immutability -- deliberate mutation of the shared axios instance
      http.defaults.headers.common["Authorization"] = `JWT ${token}`;
    } else {
      localStorage.removeItem(LOCALE_STORAGE_KEY);
      delete http.defaults.headers.common["Authorization"];
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- `init` gates rendering until the Authorization header is set, so no child request can fire unauthorized
    setInit(true);
  }, [http.defaults.headers.common, token]);

  return init ? (
    <AuthContext.Provider
      value={{
        token,
        setToken,
        isAuthenticated: !R.isNil(token),
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
