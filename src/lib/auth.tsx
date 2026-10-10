"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken, setToken } from "./api";
import type { MeResponse, User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  // features is the plan feature map for the signed-in user, or null when they
  // are not gated (admins, or clients with no plan).
  features: Record<string, boolean> | null;
  // hasFeature reports whether the user may use a feature. Absent keys and a null
  // map both mean "allowed", so nothing is hidden unless a plan explicitly says so.
  hasFeature: (key: string) => boolean;
  // How many workflows this tenant may create; 0 means unlimited. Set per client
  // by an admin, and resolved server-side so staff get their client's allowance.
  workflowLimit: number;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null);
  const [workflowLimit, setWorkflowLimit] = useState(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Resolve the stored token into a user once on mount. Until this settles,
  // `loading` keeps guards from bouncing an authenticated user to /login.
  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (!getToken()) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await api<MeResponse>("/auth/me");
        if (!cancelled) {
          setUser(me.user);
          setFeatures(me.features);
          setWorkflowLimit(me.workflowLimit ?? 0);
        }
      } catch {
        clearToken();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(res.token);
      setUser(res.user);
      // Load the feature map for the freshly signed-in account.
      try {
        const me = await api<MeResponse>("/auth/me");
        setFeatures(me.features);
        setWorkflowLimit(me.workflowLimit ?? 0);
      } catch {
        setFeatures(null);
      }
      // The screen with work on it, not the one with charts on it.
      router.push("/needs-attention");
    },
    [router],
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setFeatures(null);
    setWorkflowLimit(0);
    router.push("/login");
  }, [router]);

  /*
   * Silent session renewal.
   *
   * The token has a fixed life and nothing renewed it, so a user working for
   * longer than that life was signed out mid-task — and with no password reset
   * page, recovery meant asking someone with database access.
   *
   * Renewed on an interval rather than on a timer derived from the token's
   * expiry, because the token is opaque to this layer and decoding a JWT in the
   * browser to read its own expiry is more machinery than the problem needs.
   * Twenty minutes is comfortably inside any expiry anybody would configure and
   * costs one request per third of an hour.
   *
   * A failure is swallowed: the next real request will fail with a 401 and the
   * existing handling signs the user out. Reacting here as well would mean two
   * code paths deciding when a session has ended.
   */
  useEffect(() => {
    if (!user) return;

    const RENEW_EVERY = 20 * 60 * 1000;
    const timer = setInterval(async () => {
      try {
        const res = await api<{ token: string }>("/auth/refresh", { method: "POST" });
        if (res.token) setToken(res.token);
      } catch {
        // Left to the next request, which already handles a dead session.
      }
    }, RENEW_EVERY);

    return () => clearInterval(timer);
  }, [user]);

  const hasFeature = useCallback(
    (key: string) => {
      if (!features) return true; // not gated
      const v = features[key];
      return v === undefined || v; // absent key = allowed
    },
    [features],
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      isAdmin: user?.role === "admin",
      features,
      hasFeature,
      workflowLimit,
    }),
    [user, loading, login, logout, features, hasFeature, workflowLimit],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
