"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { CommandPalette } from "@/components/CommandPalette";
import { PromptProvider } from "@/components/PromptProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, subscriptionLock, impersonating, returnToAdmin } = useAuth();
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
    /* Wraps the whole app so any screen can ask for a value without mounting
       its own dialog, and so there is exactly one at a time. */
    <PromptProvider>
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
        {impersonating && (
          <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2 text-sm text-amber-900">
            <span>
              You are logged in as <strong>{user?.name}</strong> ({user?.email}). Everything you do happens in their account.
            </span>
            <button onClick={returnToAdmin} className="ml-auto rounded-md bg-amber-900 px-3 py-1 text-xs font-medium text-amber-50 hover:bg-amber-800">
              Return to admin
            </button>
          </div>
        )}
        {subscriptionLock && (
          <p role="alert" className="bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
            {subscriptionLock === "soft"
              ? "Your subscription is past due, so your account is read-only. Contact us to restore it."
              : "Your subscription is inactive, so your account is locked. Contact us to restore access."}
          </p>
        )}
        <main>{children}</main>
      </div>
    </div>
    </PromptProvider>
  );
}
