"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/*
 * The root path has no content of its own.
 *
 * It lands on Needs Attention rather than the dashboard. Somebody opening this
 * at 9am is not asking how the month is going — they are asking who is waiting
 * on them, and the dashboard cannot answer that. Which screen a product opens
 * on is the clearest statement it makes about what it is for, and this one was
 * inherited rather than chosen.
 */
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/needs-attention" : "/login");
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--ark-bg)] text-sm text-[var(--ark-ink-3)]">
      Loading…
    </div>
  );
}
