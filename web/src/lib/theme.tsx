"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

// The dark class on <html> is set before hydration by an inline script in the
// root layout (so there's no flash). This provider only mirrors that state for
// the toggle UI and writes changes back to <html> + localStorage, so the choice
// persists across every page the user visits.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // Sync provider state to whatever the pre-hydration script applied. Runs in a
  // rAF so it's off the effect's synchronous path.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("theme", t);
    } catch {
      // Private mode / storage disabled — theme just won't persist.
    }
    const root = document.documentElement;
    if (t === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, []);

  const toggle = useCallback(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
  }, [setTheme]);

  const value = useMemo(() => ({ theme, toggle, setTheme }), [theme, toggle, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
