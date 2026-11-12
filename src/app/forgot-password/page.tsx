"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ message: string }>("/auth/forgot-password", { method: "POST", body: { email } });
      setSent(r.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicShell title="Forgot your password?" subtitle="We'll email you a link to set a new one.">
      {sent ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sent}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <input className="input" type="email" required autoComplete="email" placeholder="you@company.com"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? "Sending…" : "Send link"}
          </button>
        </form>
      )}
      <p className="mt-6 text-sm"><Link href="/login" className="underline">Back to sign in</Link></p>
    </PublicShell>
  );
}
