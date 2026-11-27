"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Icon } from "@/components/icons";
import { StackedColumns } from "@/components/charts";
import type { ContactsResponse, MessageLogsResponse, RunDetail, RunsResponse, RunStatusKey } from "@/lib/types";

/*
All Logs, and a workflow's Execution logs tab.

Three channels share one layout: workflow runs, emails and WhatsApp messages.
Five tiles (Running, Queued, Completed, Failed, Cancelled) mean the same thing
on every tab and double as the status filter, and they are counted with the
same search and dates as the list, so a tile's number is how many rows clicking
it shows. The status pill on each row still names the exact state.
*/

// The exact run states, used by the analytics breakdown.
export const STATUS_CHIPS: { key: RunStatusKey; label: string }[] = [
  { key: "running", label: "Running" },
  { key: "waiting_time", label: "Waiting for time" },
  { key: "waiting_window", label: "Waiting for window" },
  { key: "waiting_reply", label: "Waiting for reply" },
  { key: "completed", label: "Completed" },
  { key: "stopped", label: "Exited early" },
  { key: "failed", label: "Failed" },
  { key: "skipped", label: "Skipped" },
  { key: "cancelled", label: "Cancelled" },
];

type Group = "running" | "queued" | "completed" | "failed" | "cancelled";
type Channel = "workflow" | "email" | "waba";

const GROUPS: { key: Group; label: string; icon: keyof typeof Icon; tile: string; pill: string }[] = [
  { key: "running", label: "Running", icon: "Refresh", tile: "border-blue-200 bg-blue-50 text-blue-600", pill: "border-blue-200 bg-blue-50 text-blue-700" },
  { key: "queued", label: "Queued", icon: "Clock", tile: "border-amber-200 bg-amber-50 text-amber-600", pill: "border-amber-200 bg-amber-50 text-amber-800" },
  { key: "completed", label: "Completed", icon: "CheckCircle", tile: "border-emerald-200 bg-emerald-50 text-emerald-600", pill: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { key: "failed", label: "Failed", icon: "Close", tile: "border-rose-200 bg-rose-50 text-rose-600", pill: "border-rose-200 bg-rose-50 text-rose-700" },
  { key: "cancelled", label: "Cancelled", icon: "Ban", tile: "border-slate-200 bg-slate-50 text-slate-500", pill: "border-slate-200 bg-slate-50 text-slate-600" },
];

const CHANNELS: { key: Channel; label: string; icon: keyof typeof Icon; pill: string }[] = [
  { key: "workflow", label: "WorkFlow", icon: "Sparkle", pill: "border-teal-200 bg-teal-50 text-teal-700" },
  { key: "email", label: "Email", icon: "Mail", pill: "border-blue-200 bg-blue-50 text-blue-700" },
  { key: "waba", label: "WABA", icon: "Send", pill: "border-green-200 bg-green-50 text-green-700" },
];

const RANGES = [
  { key: "today", label: "Today", days: 0 },
  { key: "7", label: "Last 7 days", days: 6 },
  { key: "30", label: "Last 30 days", days: 29 },
  { key: "all", label: "All time", days: -1 },
] as const;
type Range = (typeof RANGES)[number]["key"];

function groupOf(r: { status: string; waiting?: string }): Group {
  if (r.status === "active") return r.waiting ? "queued" : "running";
  if (r.status === "completed" || r.status === "failed") return r.status;
  return "cancelled";
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
export function ago(iso: string): string {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  return when(iso);
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// One line of the list, whichever channel it came from.
interface Row {
  id: string;
  group: Group;
  label: string;
  name: string;
  contact: string;
  at: string;
  result: string;
  error?: string;
  runId?: string;
}

function useLogs(channel: Channel, workflowId: string | undefined, initialRange: Range) {
  const [status, setStatus] = useState<Group | "">("");
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>(initialRange);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<Group, number> | null>(null);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    const r = RANGES.find((x) => x.key === range)!;
    if (r.days >= 0) {
      const from = new Date();
      from.setDate(from.getDate() - r.days);
      params.set("from", ymd(from));
    }
    params.set("page", String(page));
    try {
      if (channel === "workflow") {
        const d = await api<RunsResponse>(`${workflowId ? `/workflows/${workflowId}/runs` : "/logs"}?${params}`);
        const b = d.stats.byStatus;
        const n = (k: RunStatusKey) => b[k] ?? 0;
        setCounts({
          running: n("running"),
          queued: n("waiting_time") + n("waiting_window") + n("waiting_reply"),
          completed: n("completed"),
          failed: n("failed"),
          cancelled: n("cancelled") + n("stopped") + n("skipped"),
        });
        setRows(
          d.runs.map((x) => ({
            id: x._id,
            group: groupOf(x),
            label: x.statusLabel,
            name: x.workflowName,
            contact: x.contact,
            at: x.startedAt,
            result: x.nextRunAt ? `Next ${when(x.nextRunAt)}` : formatDuration(x.durationMs),
            error: x.error,
            runId: x._id,
          })),
        );
        setPages(Math.max(1, Math.ceil(d.total / d.pageSize)));
      } else {
        params.set("channel", channel);
        const d = await api<MessageLogsResponse>(`/logs/messages?${params}`);
        const g = d.groups;
        setCounts({ running: 0, queued: 0, completed: g.completed ?? 0, failed: g.failed ?? 0, cancelled: g.cancelled ?? 0 });
        setRows(
          d.rows.map((x) => ({
            id: x._id,
            group: x.group as Group,
            label: x.label,
            name: x.name || "—",
            contact: x.contact,
            at: x.at,
            result: x.group === "completed" ? "—" : x.detail || "—",
            error: x.group === "failed" ? x.detail : undefined,
            runId: x.runId,
          })),
        );
        setPages(Math.max(1, Math.ceil(d.total / d.pageSize)));
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the logs");
    }
  }, [channel, workflowId, status, q, range, page]);

  useEffect(() => {
    // Debounced so typing a search does not fire a request per key.
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return { status, setStatus, q, setQ, range, setRange, page, setPage, rows, counts, pages, error, reload: load };
}

/** Tiles, channel tabs, filters and the list. Channel tabs show on All Logs only. */
export function RunLogs({ workflowId }: { workflowId?: string }) {
  const [channel, setChannel] = useState<Channel>("workflow");
  const r = useLogs(channel, workflowId, workflowId ? "all" : "today");
  const [open, setOpen] = useState<Row | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const showName = !workflowId;

  const pickStatus = (g: Group | "") => {
    r.setStatus(g);
    r.setPage(1);
  };
  const ch = CHANNELS.find((c) => c.key === channel)!;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {GROUPS.map((g) => {
          const I = Icon[g.icon];
          const active = r.status === g.key;
          return (
            <button
              key={g.key}
              onClick={() => pickStatus(active ? "" : g.key)}
              aria-pressed={active}
              className={`rounded-xl border px-4 py-3 text-left transition ${g.tile} ${active ? "ring-2 ring-current" : "hover:shadow-sm"}`}
            >
              <span className="flex items-center gap-2">
                <I width={16} height={16} />
                <span className="text-2xl font-semibold tabular-nums">{r.counts ? r.counts[g.key] : "…"}</span>
              </span>
              <span className="mt-1 block text-sm text-slate-600">{g.label}</span>
            </button>
          );
        })}
      </div>

      {!workflowId && (
        <div className="mb-4 inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {CHANNELS.map((c) => {
            const I = Icon[c.icon];
            return (
              <button
                key={c.key}
                onClick={() => { setChannel(c.key); r.setPage(1); r.setStatus(""); }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${channel === c.key ? "bg-white font-medium shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                <I width={15} height={15} />
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-md">
          <Icon.Search width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input w-full pl-9"
            value={r.q}
            placeholder={channel === "workflow" ? "Search — contact name or email" : "Search — contact or template"}
            aria-label="Search logs"
            onChange={(e) => { r.setQ(e.target.value); r.setPage(1); }}
          />
        </label>
        <select className="input w-40" aria-label="Status" value={r.status} onChange={(e) => pickStatus(e.target.value as Group | "")}>
          <option value="">All Status</option>
          {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
        <label className="relative">
          <Icon.Clock width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <select className="input w-40 pl-9" aria-label="Date range" value={r.range} onChange={(e) => { r.setRange(e.target.value as Range); r.setPage(1); }}>
            {RANGES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>
        <button onClick={() => r.reload()} title="Refresh" aria-label="Refresh" className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50">
          <Icon.Refresh width={18} height={18} />
        </button>
        <div className="flex-1" />
        {workflowId && (
          <button onClick={() => setEnrolling(true)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Enroll contact
          </button>
        )}
      </div>

      {r.error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{r.error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {showName && <th className="px-4 py-3 font-medium">{channel === "workflow" ? "Name" : "Template / workflow"}</th>}
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Result</th>
              <th className="px-4 py-3 text-right font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!r.rows && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
            )}
            {r.rows && r.rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                Nothing here for these filters.{workflowId ? " Publish the workflow, or use Enroll contact to try it." : r.range === "today" ? " Try a longer date range." : ""}
              </td></tr>
            )}
            {r.rows?.map((row) => {
              const g = GROUPS.find((x) => x.key === row.group) ?? GROUPS[4];
              const I = Icon[g.icon];
              return (
                <tr key={row.id} onClick={() => setOpen(row)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${ch.pill}`}>{ch.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${g.pill}`}>
                      <I width={12} height={12} />
                      {row.label}
                    </span>
                  </td>
                  {showName && <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>}
                  <td className="px-4 py-3 text-slate-600">{row.contact}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500" title={when(row.at)}>{ago(row.at)}</td>
                  <td className="max-w-xs px-4 py-3 text-slate-500">
                    {row.error ? <span className="block truncate text-rose-600" title={row.error}>{row.error}</span> : <span className="block truncate" title={row.result}>{row.result}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-900">
                    View <span aria-hidden>›</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {r.pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button disabled={r.page <= 1} onClick={() => r.setPage(r.page - 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">Previous</button>
          <span className="text-slate-500">Page {r.page} of {r.pages}</span>
          <button disabled={r.page >= r.pages} onClick={() => r.setPage(r.page + 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">Next</button>
        </div>
      )}

      {open?.runId && <RunDrawer runId={open.runId} onClose={() => setOpen(null)} onChanged={r.reload} />}
      {open && !open.runId && <MessageDrawer row={open} channel={ch.label} onClose={() => setOpen(null)} />}
      {enrolling && workflowId && (
        <EnrollDialog workflowId={workflowId} onClose={() => setEnrolling(false)} onDone={() => { setEnrolling(false); setTimeout(r.reload, 1500); }} />
      )}
    </div>
  );
}

/** One sent message: there is no run behind it, so just its facts. */
function MessageDrawer({ row, channel, onClose }: { row: Row; channel: string; onClose: () => void }) {
  const facts: [string, string][] = [
    ["Channel", channel],
    ["Status", row.label],
    ["Template", row.name],
    ["Contact", row.contact],
    ["When", when(row.at)],
  ];
  if (row.result !== "—") facts.push(["Details", row.result]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside role="dialog" aria-label="Message details" className="ark-pop h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-[var(--ark-shadow-overlay)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold">{row.contact}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">✕</button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}

/** Status pill for the run drawer. */
function StatusPill({ status, waiting, label }: { status: string; waiting?: string; label: string }) {
  const g = GROUPS.find((x) => x.key === groupOf({ status, waiting })) ?? GROUPS[4];
  return <span className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${g.pill}`}>{label}</span>;
}

/** Success rate, average duration, the 7-day trend and a status breakdown. */
export function RunAnalytics({ workflowId }: { workflowId: string }) {
  const [data, setData] = useState<RunsResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<RunsResponse>(`/workflows/${workflowId}/runs`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the logs"));
  }, [workflowId]);
  const s = data?.stats;
  if (error) return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>;
  if (!s) return <p className="text-sm text-slate-500">Loading…</p>;
  const waiting = (s.byStatus.waiting_time ?? 0) + (s.byStatus.waiting_window ?? 0) + (s.byStatus.waiting_reply ?? 0);
  const tiles = [
    { label: "Total runs", value: s.total, hint: "Every entry, including skipped" },
    { label: "Success rate", value: s.successRate == null ? "—" : `${Math.round(s.successRate)}%`, hint: `Of ${s.finished} finished runs` },
    { label: "Waiting now", value: waiting, hint: "Not counted as success or failure" },
    { label: "Failed", value: s.byStatus.failed ?? 0, hint: "Ended with an error" },
    { label: "Average duration", value: formatDuration(s.avgDurationMs), hint: "Of finished runs" },
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{t.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{t.value}</p>
            <p className="mt-1 text-xs text-slate-400">{t.hint}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium">Last 7 days</p>
        <StackedColumns
          data={s.trend.map((d) => ({
            label: new Date(d.day + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }),
            values: { ok: d.runs - d.fails, failed: d.fails },
          }))}
          series={[
            { key: "ok", label: "Runs", color: "--viz-s1" },
            { key: "failed", label: "Failed", color: "--viz-s3" },
          ]}
          empty="No runs in the last 7 days"
        />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium">Status breakdown</p>
        {s.total === 0 ? (
          <p className="text-sm text-slate-500">No runs yet.</p>
        ) : (
          <ul className="space-y-2">
            {STATUS_CHIPS.filter((c) => (s.byStatus[c.key] ?? 0) > 0).map((c) => {
              const n = s.byStatus[c.key] ?? 0;
              return (
                <li key={c.key} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0">{c.label}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded bg-slate-100">
                    <span className="ark-bar block h-full rounded bg-[var(--ark-primary)]" style={{ width: `${(n / s.total) * 100}%` }} />
                  </span>
                  <span className="w-12 text-right tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** One run, step by step. */
export function RunDrawer({ runId, onClose, onChanged }: { runId: string; onClose: () => void; onChanged?: () => void }) {
  const [d, setD] = useState<RunDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<RunDetail>(`/runs/${runId}`).then(setD).catch((e) => setError(e instanceof Error ? e.message : "Could not load this run"));
  }, [runId]);

  async function cancel() {
    if (!d || !confirm("Stop this run? The contact gets nothing more from this workflow.")) return;
    setBusy(true);
    try {
      await api(`/runs/${runId}/cancel`, { method: "POST" });
      onChanged?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  const vars = Object.entries(d?.run.vars ?? {});
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Run details"
        className="ark-pop h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-[var(--ark-shadow-overlay)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{d?.run.contact || "Run"}</h2>
            {d && (
              <p className="text-sm text-slate-500">
                <Link href={`/workflows/${d.run.workflowId}`} className="underline">{d.workflowName}</Link> · {d.run.reason}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">✕</button>
        </div>
        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {d && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <StatusPill status={d.run.status} waiting={d.run.waiting} label={d.statusLabel} />
              <span className="text-slate-500">Started {when(d.run.createdAt)}</span>
              {d.run.nextRunAt && d.run.status === "active" && <span className="text-slate-500">· continues {when(d.run.nextRunAt)}</span>}
              <div className="flex-1" />
              {d.run.status === "active" && (
                <button disabled={busy} onClick={cancel} className="rounded-lg border border-rose-300 px-2 py-1 text-sm text-rose-700 hover:bg-rose-50">
                  Stop run
                </button>
              )}
            </div>
            {d.run.lastError && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{d.run.lastError}</p>}
            {vars.length > 0 && (
              <details className="mb-4 rounded-lg border border-slate-200 p-3 text-sm">
                <summary className="cursor-pointer font-medium">Variables ({vars.length})</summary>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {vars.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="font-mono text-xs text-slate-500">{`{{variables.${k}}}`}</dt>
                      <dd className="break-all">{v}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            <ol className="relative space-y-3 border-l border-slate-200 pl-4">
              {d.steps.map((s) => (
                <li key={s._id} className="relative">
                  <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${dot(s.action)}`} aria-hidden />
                  <p className="text-sm">
                    {s.stepLabel && <span className="font-medium">{s.stepLabel}: </span>}
                    {s.detail}
                  </p>
                  <p className="text-xs text-slate-400">{when(s.createdAt)}</p>
                </li>
              ))}
              {d.steps.length === 0 && <li className="text-sm text-slate-500">Nothing recorded for this run.</li>}
            </ol>
          </>
        )}
      </aside>
    </div>
  );
}

function dot(action: string) {
  if (action === "failed" || action.endsWith("_failed")) return "bg-rose-500";
  if (action === "skipped" || action.endsWith("_skipped") || action === "completed_with_issues") return "bg-amber-500";
  if (action === "delay" || action === "waited") return "bg-violet-500";
  if (action === "completed" || action === "goal_met" || action === "ended") return "bg-emerald-500";
  return "bg-slate-400";
}

/** Pick a contact to put into the workflow by hand. */
function EnrollDialog({ workflowId, onClose, onDone }: { workflowId: string; onClose: () => void; onDone: () => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ContactsResponse["contacts"]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (search.trim().length < 2) return;
    const t = setTimeout(() => {
      api<ContactsResponse>(`/contacts?search=${encodeURIComponent(search.trim())}`)
        .then((r) => setResults(r.contacts.slice(0, 8)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function enroll(cardId: string) {
    setError("");
    try {
      const r = await api<{ message: string }>(`/workflows/${workflowId}/enroll`, { method: "POST", body: { cardId } });
      setMsg(r.message);
      setTimeout(onDone, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enroll");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-label="Enroll a contact" className="w-full max-w-md rounded-xl bg-white p-5 shadow-[var(--ark-shadow-overlay)]" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-semibold">Enroll a contact</h2>
        <p className="mb-3 text-sm text-slate-500">They start at the first step now, whether or not the workflow is published.</p>
        <input autoFocus className="input w-full" placeholder="Search by name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {msg && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
        <ul className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto">
          {search.trim().length >= 2 && results.map((c) => (
            <li key={c._id}>
              <button onClick={() => enroll(c._id)} className="w-full px-2 py-2 text-left text-sm hover:bg-slate-50">
                <span className="font-medium">{c.name}</span>
                <span className="block text-xs text-slate-500">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Close</button>
      </div>
    </div>
  );
}
