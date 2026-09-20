import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, get, post, tokens } from "./api";
import type { Role, TokenResponse, User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (body: Record<string, unknown>) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export const HOME_FOR: Record<Role, string> = {
  customer: "/app",
  partner: "/partner",
  recycler: "/recycler",
  admin: "/admin",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!tokens.access);
  const qc = useQueryClient();

  useEffect(() => {
    if (!tokens.access) return;
    get<User>("/users/me")
      .then(setUser)
      .catch(() => tokens.clear())
      .finally(() => setLoading(false));
  }, []);

  const clear = useCallback(() => {
    tokens.clear();
    setUser(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    window.addEventListener("swacchify:logout", clear);
    return () => window.removeEventListener("swacchify:logout", clear);
  }, [clear]);

  const accept = useCallback((r: TokenResponse) => {
    tokens.set(r.access_token, r.refresh_token);
    setUser(r.user);
    return r.user;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      setUser,
      login: async (email, password) => accept(await post<TokenResponse>("/auth/login", { email, password })),
      register: async (body) => accept(await post<TokenResponse>("/auth/register", body)),
      logout: async () => {
        const rt = tokens.refresh;
        if (rt) await api("/auth/logout", { method: "POST", body: { refresh_token: rt } }).catch(() => undefined);
        clear();
      },
    }),
    [user, loading, accept, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
