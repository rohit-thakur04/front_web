"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";

/*
Where the Unsubscribe link in an automated email lands. Asks first rather than
unsubscribing on load, because mail scanners open links in emails and would
otherwise unsubscribe people who never clicked.
*/
export default function UnsubscribePage() {
  const [state, setState] = useState<"ask" | "busy" | "done" | "error">("ask");
  const [message, setMessage] = useState("");

  async function confirm() {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("c") ?? "";
    const t = q.get("t") ?? "";
    setState("busy");
    try {
      const r = await api<{ message: string }>(
        `/public/unsubscribe/${encodeURIComponent(c)}/${encodeURIComponent(t)}`,
        { method: "POST" },
      );
      setMessage(r.message);
      setState("done");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "This link did not work.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <PublicShell title="You're unsubscribed" subtitle={message}>
        <p className="text-sm text-slate-600">You can close this page.</p>
      </PublicShell>
    );
  }
  return (
    <PublicShell title="Unsubscribe from these emails?" subtitle="You will stop getting automated emails from this sender.">
      {state === "error" && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p>}
      <button
        onClick={confirm}
        disabled={state === "busy"}
        className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {state === "busy" ? "Unsubscribing…" : "Unsubscribe"}
      </button>
    </PublicShell>
  );
}
