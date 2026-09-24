"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { downloadCSV, toCSV } from "@/lib/csv";
import type { ContactsResponse, Pipeline } from "@/lib/types";
import { ImportDialog } from "@/components/ImportDialog";
import { CardDialog } from "@/components/CardDialog";
import { PageHeader, StatTile } from "@/components/ui";

export default function ContactsPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [data, setData] = useState<ContactsResponse | null>(null);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<ContactsResponse["contacts"][0] | null>(null);
  const [error, setError] = useState("");
  const [exportMsg, setExportMsg] = useState("");

  useEffect(() => {
    api<Pipeline[]>("/pipelines").then(setPipelines).catch(() => {});
  }, []);

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (pipelineId) params.set("pipelineId", pipelineId);
    if (debounced.trim()) params.set("search", debounced.trim());

    try {
      setData(await api<ContactsResponse>(`/contacts?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load contacts");
    }
  }, [pipelineId, debounced]);

  useEffect(() => {
    async function run() {
      await load();
    }
    run();
  }, [load]);

  function exportCSV() {
    if (!data?.contacts.length) return;
    // Export exactly what's on screen, not the unfiltered set.
    const csv = toCSV(
      ["Name", "Phone", "Email", "Value", "Pipeline", "Stage", "Added"],
      data.contacts.map((c) => [
        c.name,
        c.phone,
        c.email,
        c.value,
        c.pipelineName,
        c.stageName,
        new Date(c.createdAt).toLocaleDateString(),
      ]),
    );
    downloadCSV(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    const n = data.contacts.length;
    setExportMsg(`Exported ${n.toLocaleString()} contact${n === 1 ? "" : "s"} to CSV.`);
    setTimeout(() => setExportMsg(""), 4000);
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await api(`/cards/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete contact");
    }
  }

  const summary = data?.summary;

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <PageHeader
        title="Contacts"
        subtitle="Every lead across your pipelines"
        actions={
          <>
            <button
              onClick={exportCSV}
              disabled={!data?.contacts.length}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              onClick={() => setImporting(true)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Import CSV
            </button>
          </>
        }
      />

      {/* Tiles are computed from the same filtered set as the table, so they
          always agree with the rows below. */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Total contacts" value={summary?.totalContacts ?? 0} icon="Contacts" tone="violet" badge="" />
        <StatTile
          label="Total value"
          value={`₹${(summary?.totalValue ?? 0).toLocaleString("en-IN")}`}
          icon="Money"
          tone="green"
          badge=""
        />
        <StatTile label="With email" value={summary?.withEmail ?? 0} icon="Mail" tone="blue" badge="" />
        <StatTile label="With phone" value={summary?.withPhone ?? 0} icon="Phone" tone="blue" badge="" />
        <StatTile label="Active automations" value={summary?.activeAutomations ?? 0} icon="Sparkle" tone="amber" badge="" />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          placeholder="Search name, phone, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          value={pipelineId}
          onChange={(e) => setPipelineId(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All pipelines</option>
          {pipelines.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {exportMsg && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {exportMsg}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Pipeline</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Added</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {!data?.contacts.length && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  No contacts match.
                </td>
              </tr>
            )}

            {data?.contacts.map((c) => (
              <tr key={c._id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2 text-slate-600">{c.phone || "—"}</td>
                <td className="px-3 py-2 text-slate-600">{c.email || "—"}</td>
                <td className="px-3 py-2">
                  {c.value ? `₹${c.value.toLocaleString("en-IN")}` : "—"}
                </td>
                <td className="px-3 py-2 text-slate-600">{c.pipelineName}</td>
                <td className="px-3 py-2 text-slate-600">{c.stageName}</td>
                <td className="px-3 py-2 text-slate-500">
                  {new Date(c.createdAt).toLocaleDateString()}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button
                    onClick={() => setEditing(c)}
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(c._id, c.name)}
                    className="ml-2 text-xs text-slate-500 hover:text-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {importing && (
        <ImportDialog
          pipelines={pipelines}
          onClose={() => setImporting(false)}
          onDone={async () => {
            setImporting(false);
            await load();
          }}
        />
      )}

      {editing && (
        <CardDialog
          stageId={editing.stageId}
          card={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}
