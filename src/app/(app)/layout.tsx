"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { CommandPalette } from "@/components/CommandPalette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Route guard. This is the second of the three admin guards (nav link, route,
  // API) — the API is what actually enforces access; these two are just UX.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--ark-bg)] text-sm text-[var(--ark-ink-3)]">
        Loading…
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen bg-[var(--ark-bg)]">
      {/* Mounted in the shell rather than per page, so the shortcut works from
          anywhere in the product. */}
      <CommandPalette />

      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />

      {/* Backdrop for the mobile drawer. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Content is inset by the sidebar width on large screens. */}
      <div className="lg:pl-[232px]">
        <Topbar onToggleSidebar={() => setSidebarOpen((o) => !o)} />
        <main>{children}</main>
      </div>
    </div>
  );
}
