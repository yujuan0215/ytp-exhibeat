import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchMe,
  getAuthToken,
  login as apiLogin,
  register as apiRegister,
  setAuthToken,
  updatePreferences as apiUpdatePreferences,
  type AuthUser,
} from "./api";
import { refreshFavoritesCache } from "./favorites";

interface AuthContextValue {
  user: AuthUser | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (body: { email: string; password: string; display_name: string; preference_tags: string[] }) => Promise<AuthUser>;
  logout: () => void;
  updatePreferences: (tags: string[]) => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("idle");

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setStatus("unauthenticated");
      void refreshFavoritesCache(false);
      return;
    }
    setStatus("loading");
    fetchMe()
      .then(async (u) => {
        setUser(u);
        setStatus("authenticated");
        await refreshFavoritesCache(true);
      })
      .catch(() => {
        setAuthToken(null);
        setUser(null);
        setStatus("unauthenticated");
        void refreshFavoritesCache(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin({ email, password });
    setAuthToken(res.access_token);
    setUser(res.user);
    setStatus("authenticated");
    await refreshFavoritesCache(true);
    return res.user;
  }, []);

  const register = useCallback(async (body: { email: string; password: string; display_name: string; preference_tags: string[] }) => {
    const res = await apiRegister(body);
    setAuthToken(res.access_token);
    setUser(res.user);
    setStatus("authenticated");
    await refreshFavoritesCache(true);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setStatus("unauthenticated");
    void refreshFavoritesCache(false);
  }, []);

  const updatePreferences = useCallback(async (tags: string[]) => {
    const updated = await apiUpdatePreferences(tags);
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo(
    () => ({ user, status, login, register, logout, updatePreferences }),
    [user, status, login, register, logout, updatePreferences],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
