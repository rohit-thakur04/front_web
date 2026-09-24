"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { WabaTemplate } from "@/lib/types";
import { PageHeader } from "@/components/ui";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
};

export default function WabaListPage() {
  const [templates, setTemplates] = useState<WabaTemplate[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      setTemplates(await api<WabaTemplate[]>("/waba"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load templates");
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
              disabled={refreshing}
              title="Fetch the latest approval status from Meta"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "↻ Refresh status"}
            </button>
            <Link
              href="/waba/new"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              + New template
            </Link>
          </div>
        }
      />

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
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[t.status] ?? ""
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => remove(t)}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
