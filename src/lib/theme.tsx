"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./auth";

type Theme = "light" | "dark";
export type ThemeMode = Theme | "system";

interface ThemeState {
  /** What is on screen. */
  theme: Theme;
  /** What the user chose; "system" follows the OS. */
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function read(key: string): ThemeMode | null {
  try {
    const v = localStorage.getItem(key);
    return v === "light" || v === "dark" || v === "system" ? v : null;
  } catch {
    return null; // Private mode / storage disabled.
  }
}

function apply(mode: ThemeMode): Theme {
  const dark = mode === "dark" || (mode === "system" && darkQuery().matches);
  document.documentElement.classList.toggle("dark", dark);
  return dark ? "dark" : "light";
}

/*
The theme, saved per user in this browser under theme:<userId>, so two people
sharing a computer each keep their own. "theme" (no id) mirrors the last one
used; the pre-hydration script in the root layout reads it before anyone is
known, so a reload does not flash the wrong theme.
*/
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userKey = user ? `theme:${user._id}` : null;
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [theme, setTheme] = useState<Theme>("light");

  // Load this user's choice once they are known. In a rAF so the state update
  // is off the effect's synchronous path.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const m = (userKey ? read(userKey) : null) ?? read("theme") ?? "system";
      setModeState(m);
      setTheme(apply(m));
    });
    return () => cancelAnimationFrame(raf);
  }, [userKey]);

  // Follow the OS while in system mode.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = darkQuery();
    const onChange = () => setTheme(apply("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback(
    (m: ThemeMode) => {
      setModeState(m);
      setTheme(apply(m));
      try {
        if (userKey) localStorage.setItem(userKey, m);
        localStorage.setItem("theme", m);
      } catch {
        // Theme just won't persist.
      }
    },
    [userKey],
  );

  const toggle = useCallback(
    () => setMode(document.documentElement.classList.contains("dark") ? "light" : "dark"),
    [setMode],
  );

  const value = useMemo(() => ({ theme, mode, setMode, toggle }), [theme, mode, setMode, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
