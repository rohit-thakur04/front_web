"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";

export default function SetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== again) {
      setError("The two passwords don't match");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const token = new URLSearchParams(window.location.search).get("token") ?? "";
      await api("/auth/set-password", { method: "POST", body: { token, password: pw } });
      router.push("/login?password=set");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set your password");
      setBusy(false);
    }
  }

  return (
    <PublicShell title="Set your password" subtitle="At least 8 characters.">
      <form onSubmit={submit} className="space-y-4">
        <input className="input" type="password" required minLength={8} autoComplete="new-password"
          placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <input className="input" type="password" required minLength={8} autoComplete="new-password"
          placeholder="Type it again" value={again} onChange={(e) => setAgain(e.target.value)} />
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error} {error.includes("expired") && <Link href="/forgot-password" className="underline">Send a new link</Link>}
          </p>
        )}
        <button type="submit" disabled={busy}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? "Saving…" : "Set password"}
        </button>
      </form>
    </PublicShell>
  );
}
