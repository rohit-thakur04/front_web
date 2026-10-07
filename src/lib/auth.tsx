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
