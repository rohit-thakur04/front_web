"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

interface Props {
  onToggleSidebar: () => void;
}

export function Topbar({ onToggleSidebar }: Props) {
  const { user, logout, isAdmin } = useAuth();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the user menu on an outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--ark-line)] bg-[var(--ark-surface)]/85 px-4 backdrop-blur-md">
      <button
        onClick={onToggleSidebar}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Toggle sidebar"
      >
        <Icon.Menu />
      </button>

      <div className="flex-1" />

      {/* A discoverable way into the palette. The shortcut is faster, but a
          shortcut nobody knows about is a feature nobody has — and on a phone
          there is no keyboard to press it with. */}
      <button
        onClick={() => window.dispatchEvent(new Event("arkquen:open-command"))}
        title="Search contacts or jump to a screen (Ctrl/Cmd K)"
        aria-label="Search contacts or jump to a screen"
        className="flex items-center gap-1.5 rounded-[var(--ark-r-md)] border border-[var(--ark-line)] px-2 py-1.5 text-[13px] text-[var(--ark-ink-muted)] transition-colors hover:border-[var(--ark-line-strong)] hover:text-[var(--ark-ink-3)]"
      >
        <span aria-hidden>⌕</span>
        <kbd className="hidden text-[10px] sm:block">⌘K</kbd>
      </button>

      <button
        onClick={toggle}
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
        aria-label="Toggle dark mode"
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? (
          // Sun
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          // Moon
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        )}
      </button>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-2 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-semibold text-white ring-2 ring-white">
            {initial}
          </span>
          <span className="hidden text-sm font-medium sm:block">{user?.name}</span>
          <Icon.ChevronDown className="text-slate-400" width={16} height={16} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_-8px_rgba(15,23,42,0.25)]">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
              {isAdmin && (
                <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                  admin
                </span>
              )}
            </div>
            <button
              onClick={logout}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Icon.Logout className="text-slate-400" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
