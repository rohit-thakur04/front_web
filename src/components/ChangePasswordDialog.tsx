"use client";

import { useState } from "react";
import { api, setToken } from "@/lib/api";

// Changing the password signs out other devices; this one gets a fresh token.
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== again) {
      setError("The two new passwords don't match");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await api<{ token: string }>("/auth/change-password", {
        method: "POST",
        body: { current, password: pw },
      });
      setToken(r.token);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-pw-title"
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-[var(--ark-shadow-overlay)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="change-pw-title" className="mb-4 text-lg font-semibold">Change password</h2>
        {done ? (
          <>
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Password changed. Other devices have been signed out.
            </p>
            <button onClick={onClose} className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
              Close
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input className="input" type="password" required autoComplete="current-password"
              placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <input className="input" type="password" required minLength={8} autoComplete="new-password"
              placeholder="New password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
            <input className="input" type="password" required minLength={8} autoComplete="new-password"
              placeholder="New password again" value={again} onChange={(e) => setAgain(e.target.value)} />
            {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={busy}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {busy ? "Saving…" : "Change"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
