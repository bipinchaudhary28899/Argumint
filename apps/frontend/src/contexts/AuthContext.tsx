import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import {
  type AuthContextType,
  type PublicUser,
  type RegisterRequest,
  type LoginInput,
} from "@argumint/shared";
import { authApi } from "../services/api";

const USER_CACHE_KEY = "argumint_user";

function readCachedUser(): PublicUser | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(u: PublicUser | null) {
  if (u) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
  else localStorage.removeItem(USER_CACHE_KEY);
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Seed initial state from localStorage so there's no flash-to-login on refresh
  const [user, setUser] = useState<PublicUser | null>(readCachedUser);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Track when we last successfully validated so we don't spam /auth/me.
    let lastCheckedAt = 0;

    const maybeCheck = (force = false) => {
      const now = Date.now();
      // Only re-validate if forced (initial load) or it's been >5 min since
      // the last check. This prevents a /auth/me call on every tab switch
      // while still catching evictions reasonably quickly.
      if (!force && now - lastCheckedAt < 5 * 60_000) return;
      lastCheckedAt = now;
      checkAuth();
    };

    // Always check on first mount
    maybeCheck(true);

    // Poll every 5 min as a fallback for missed socket eviction events
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") maybeCheck();
    }, 5 * 60_000);

    // On tab focus: only re-validate if the cooldown has elapsed
    const onVisible = () => {
      if (document.visibilityState === "visible") maybeCheck();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      const response = await authApi.getMe();
      setUser(response.user);
      writeCachedUser(response.user);
      setError(null);
    } catch (err: any) {
      // "Network Error" = axios received no HTTP response at all —
      // server unreachable, offline, or poor connection.
      // In this case the session is still alive on the server, so we
      // keep the cached user rather than booting them to /login.
      const isNetworkError =
        !err?.response &&
        (err?.message === "Network Error" || err?.code === "ERR_NETWORK");

      if (isNetworkError) {
        // Leave user state untouched — cached user stays logged in.
        return;
      }

      // A real auth failure (401 expired/invalid token) — our session was
      // evicted (e.g. the user logged in on another device). Clear everything
      // and redirect to login with an explanation banner.
      // We only hard-redirect if there was a cached user — this avoids
      // redirecting during the initial unauthenticated app load.
      const hadSession = !!readCachedUser();
      setUser(null);
      writeCachedUser(null);
      localStorage.removeItem("token");
      if (hadSession && err?.response?.status === 401) {
        window.location.href = "/login?reason=evicted";
        return;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterRequest) => {
    try {
      setError(null);
      const response = await authApi.register(data);
      setUser(response.user);
      writeCachedUser(response.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      throw err;
    }
  };

  const login = async (data: LoginInput) => {
    try {
      setError(null);
      const response = await authApi.login(data);
      setUser(response.user);
      writeCachedUser(response.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      setError(null);
      await authApi.logout();
      setUser(null);
      writeCachedUser(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Logout failed";
      setError(message);
      throw err;
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    error,
    register,
    login,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
