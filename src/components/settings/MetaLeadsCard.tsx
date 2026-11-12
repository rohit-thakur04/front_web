"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { IntegrationProvider, MetaStatus } from "@/lib/types";

const STATUS_TEXT = {
  pending: "Arriving",
  done: "Received",
  failed: "Failed, Meta will retry",
  rejected: "Not added",
};

/*
The Meta card: connect Facebook Pages by logging in, and see what has arrived.

A webhook gives a client nothing to look at, so the last few leads are listed with
the reason for any failure. Otherwise "my leads aren't coming" has no answer.
*/
export function MetaLeadsCard({ provider }: { provider: IntegrationProvider }) {
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const finished = useRef(false);

  useEffect(() => {
    async function run() {
      // Back from Facebook's login. The code only works once, and Strict Mode
      // runs this effect twice, hence the ref.
      const q = new URLSearchParams(window.location.search);
      const code = q.get("code");
      const state = q.get("state");
      const denied = q.get("error_description") || q.get("error_message");
      if ((code || denied) && !finished.current) {
        finished.current = true;
        window.history.replaceState(null, "", window.location.pathname);
        if (denied) {
          setError(denied);
        } else {
          setBusy(true);
          try {
            const res = await api<{
              connected: string[];
              failed: { name: string; reason: string }[];
            }>("/meta/connect", { method: "POST", body: { code, state } });
            if (res.connected.length > 0) setNotice(`Connected ${res.connected.join(", ")}.`);
            if (res.failed.length > 0) {
              setError(res.failed.map((f) => `${f.name}: ${f.reason}`).join(" "));
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not connect to Facebook");
          } finally {
            setBusy(false);
          }
        }
      }
      try {
        setStatus(await api<MetaStatus>("/meta/status"));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load your Pages");
      }
    }
    run();
  }, []);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const { url } = await api<{ url: string }>("/meta/connect-url", {
        method: "POST",
        body: { origin: window.location.origin },
      });
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to Facebook");
      setBusy(false);
    }
  }

  async function disconnect(pageId: string, pageName: string) {
    if (!window.confirm(`Disconnect ${pageName}? New leads from this Page will stop arriving.`)) {
      return;
    }
    try {
      await api(`/meta/pages/${pageId}`, { method: "DELETE" });
      setStatus(await api<MetaStatus>("/meta/status"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect");
    }
  }

  const pages = status?.pages ?? [];
  const recent = status?.recent ?? [];
  const connected = pages.length > 0;

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-lg">
          {provider.icon}
        </span>
      </div>
      <p className="font-semibold">{provider.name}</p>
      <p className="mt-1 flex-1 text-sm text-slate-500">{provider.description}</p>

      {pages.length > 0 && (
        <ul className="mt-2 space-y-1">
          {pages.map((p) => (
            <li key={p.pageId} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-slate-600">{p.pageName}</span>
              <button
                onClick={() => disconnect(p.pageId, p.pageName)}
                className="shrink-0 text-rose-600 hover:underline"
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="text-slate-500">Latest leads</summary>
          <ul className="mt-1 space-y-1">
            {recent.map((l) => (
              <li key={l._id} className="text-slate-600">
                {l.formName || "Lead"} · {new Date(l.createdAt).toLocaleString()} ·{" "}
                <span className={l.status === "done" ? "text-emerald-600" : "text-amber-700"}>
                  {STATUS_TEXT[l.status]}
                </span>
                {l.error && <span className="block text-rose-700">{l.error}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {notice && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800">{notice}</p>
      )}
      {error && <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs text-rose-700">{error}</p>}
      {status && !status.configured && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
          Facebook login is not set up on this server yet. Ask your administrator.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${
            connected ? "text-emerald-600" : "text-slate-400"
          }`}
        >
          {connected ? "● Connected" : "○ Disconnected"}
        </span>
        <button
          onClick={connect}
          disabled={busy || !status?.configured}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
            connected ? "border border-slate-300 hover:bg-slate-50" : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {busy ? "Connecting…" : connected ? "Add or refresh Pages" : "Connect with Facebook"}
        </button>
      </div>
    </div>
  );
}
