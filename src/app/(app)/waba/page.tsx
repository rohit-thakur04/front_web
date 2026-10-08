"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { RowAction, RowActions } from "@/components/RowActions";
import type { WabaTemplate } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { MessageSpend } from "@/components/MessageSpend";

/*
Template status.

Each one carries a ring and a dot as well as a fill. DRAFT's fill is
near-white, so beside the amber and emerald pills it read as plain text rather
than as a status at all — which matters because DRAFT is the one status meaning
"Meta has never seen this", and it is the state a template is in when somebody
is wondering why it has not been approved.

The dot also carries the meaning without colour, for a reader who cannot
separate the amber from the emerald.
*/
const STATUS_STYLES: Record<string, { pill: string; dot: string }> = {
  DRAFT: { pill: "bg-slate-100 text-slate-700 ring-slate-300", dot: "bg-slate-400" },
  PENDING: { pill: "bg-amber-100 text-amber-800 ring-amber-300", dot: "bg-amber-500" },
  APPROVED: { pill: "bg-emerald-100 text-emerald-800 ring-emerald-300", dot: "bg-emerald-500" },
  REJECTED: { pill: "bg-red-100 text-red-800 ring-red-300", dot: "bg-red-500" },
};

const STATUS_FALLBACK = { pill: "bg-slate-100 text-slate-700 ring-slate-300", dot: "bg-slate-400" };

export default function WabaListPage() {
  const [templates, setTemplates] = useState<WabaTemplate[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // null while unknown, so the page doesn't flash a "not connected" banner
  // before the check has come back.
  const [connected, setConnected] = useState<boolean | null>(null);
  // True when the account was set up but its stored keys no longer decrypt.
  // A different problem from "never connected", and different advice.
  const [needsReconnect, setNeedsReconnect] = useState(false);

  async function load() {
    try {
      setTemplates(await api<WabaTemplate[]>("/waba"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load templates");
    }
    try {
      const conn = await api<{ connected: boolean; needsReconnect?: boolean }>(
        "/waba/connection",
      );
      setConnected(conn.connected);
      setNeedsReconnect(Boolean(conn.needsReconnect));
    } catch {
      // A failed check must not hide the templates; assume connected and let
      // the server's own gate answer if an action is actually attempted.
      setConnected(true);
    }
  }

  // Pull the latest approval status from Meta on demand (no webhook needed).
  async function refreshStatus() {
    setRefreshing(true);
    setError("");
    setNotice("");
    try {
      const res = await api<{ updated: number; templates: WabaTemplate[] }>(
        "/waba/refresh-status",
        { method: "POST" },
      );
      setTemplates(res.templates);
      setNotice(
        res.updated > 0
          ? `Synced with Meta — ${res.updated} template${res.updated === 1 ? "" : "s"} updated.`
          : "Synced with Meta — no status changes.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh from Meta");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    async function run() {
      await load();
    }
    run();
  }, []);

  async function remove(t: WabaTemplate) {
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    try {
      await api(`/waba/${t._id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] p-6">
      <PageHeader
        title="WhatsApp Templates"
        subtitle="WABA message templates and their approval status"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={refreshStatus}
              disabled={refreshing || connected === false}
              title={
                connected === false
                  ? "Connect your WhatsApp Business Account first"
                  : "Fetch the latest approval status from Meta"
              }
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "↻ Refresh status"}
            </button>
            {connected === false ? (
              /* A span, not a Link: a disabled anchor is still clickable, so the
                 client would reach the form and only fail on save.

                 Styled as a muted control rather than a faded primary one. A
                 blue button at 50% opacity still reads as the blue button it is,
                 and an audit filed it as a dead control dressed up as an enabled
                 one — which is exactly how it looked. */
              <span
                title={
                  needsReconnect
                    ? "Your WhatsApp keys can no longer be read — reconnect first"
                    : "Connect your WhatsApp Business Account first"
                }
                aria-disabled="true"
                className="cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-400"
              >
                + New template
              </span>
            ) : (
              <Link
                href="/waba/new"
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                + New template
              </Link>
            )}
          </div>
        }
      />

      {connected === false && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          {needsReconnect ? (
            /* The account was connected; its keys stopped decrypting, which
               happens when the server's secret changes between deploys. Telling
               someone to connect an account they already connected is how a
               product earns distrust. */
            <>
              <strong className="font-medium">
                Your WhatsApp keys can no longer be read.
              </strong>{" "}
              The account is still set up, but the saved keys can&apos;t be
              decrypted, so nothing can be sent or submitted. Enter them again to
              reconnect.{" "}
              <Link href="/settings/app-store" className="underline hover:text-amber-900">
                Reconnect WhatsApp
              </Link>
            </>
          ) : (
            <>
              <strong className="font-medium">
                No WhatsApp Business Account connected.
              </strong>{" "}
              Templates can&apos;t be created or submitted until you connect one.{" "}
              <Link href="/settings/app-store" className="underline hover:text-amber-900">
                Connect WhatsApp
              </Link>
            </>
          )}
        </div>
      )}

      {/* Only once there is a connection to spend through. Showing a client a
          bill for an account they have not set up is noise. */}
      {connected === true && <MessageSpend />}

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Language</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  No WhatsApp templates yet.
                </td>
              </tr>
            )}

            {templates.map((t) => (
              <tr key={t._id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/waba/${t._id}`} className="font-medium hover:underline">
                    {t.name}
                  </Link>
                  {t.status === "REJECTED" && t.rejectionReason && (
                    <p className="text-xs text-red-600">{t.rejectionReason}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{t.category}</td>
                <td className="px-3 py-2 text-slate-600">{t.language}</td>
                <td className="px-3 py-2">
                  {(() => {
                    const style = STATUS_STYLES[t.status] ?? STATUS_FALLBACK;
                    return (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style.pill}`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                        {t.status}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-3 py-2 text-right">
                  <RowActions>
                    <RowAction action="delete" label="Delete" onClick={() => remove(t)} />
                  </RowActions>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
