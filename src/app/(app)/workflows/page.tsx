"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { RowAction, RowActions } from "@/components/RowActions";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import type { CatalogItem, Workflow, WorkflowCatalog } from "@/lib/types";

export default function WorkflowsPage() {
  const { hasFeature, workflowLimit } = useAuth();
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Workflow["status"]>("all");
  // key -> label, so the Trigger column reads as words rather than catalog keys.
  const [triggerLabels, setTriggerLabels] = useState<Record<string, string>>({});
  // Non-empty while the name dialog is open. A workflow is created only after a
  // name exists, which is what stops the list filling with "Untitled Workflow".
  const [newName, setNewName] = useState<string | null>(null);

  // The list is the source of truth for usage, so the counter stays correct as
  // workflows are created and deleted without another round trip. A limit of 0
  // means unlimited, matching the server.
  const capped = workflowLimit > 0;
  const atLimit = capped && workflows.length >= workflowLimit;

  async function load() {
    try {
      setWorkflows(await api<Workflow[]>("/workflows"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workflows");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function run() {
      await load();
      try {
        const cat = await api<WorkflowCatalog>("/workflows/catalog");
        const map: Record<string, string> = {};
        for (const g of cat.triggers) {
          for (const it of g.items as CatalogItem[]) map[it.key] = it.label;
        }
        setTriggerLabels(map);
      } catch {
        // Without labels the column falls back to the raw key, which is still
        // more useful than nothing.
      }
    }
    run();
  }, []);

  async function create(name: string) {
    setCreating(true);
    setError("");
    try {
      const wf = await api<Workflow>("/workflows", {
        method: "POST",
        body: { name: name.trim() },
      });
      router.push(`/workflows/${wf._id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create workflow");
      setCreating(false);
    }
  }

  /** Flips a workflow between running and paused.
   *
   *  The engine enrols only on "published", so pausing stops new contacts
   *  entering while leaving the design intact. Contacts already mid-run are not
   *  affected — their runs continue from where they are. */
  async function toggleActive(wf: Workflow) {
    const next = wf.status === "published" ? "paused" : "published";
    // Optimistic: a toggle that waits for a round trip feels broken.
    setWorkflows((prev) =>
      prev.map((w) => (w._id === wf._id ? { ...w, status: next } : w)),
    );
    try {
      await api(`/workflows/${wf._id}`, {
        method: "PUT",
        body: { ...wf, status: next },
      });
    } catch (e) {
      setWorkflows((prev) =>
        prev.map((w) => (w._id === wf._id ? { ...w, status: wf.status } : w)),
      );
      setError(e instanceof Error ? e.message : "Could not change the workflow status");
    }
  }

  const visible = workflows.filter((wf) => {
    if (statusFilter !== "all" && wf.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return wf.name.toLowerCase().includes(q);
  });

  async function remove(wf: Workflow) {
    if (!window.confirm(`Delete "${wf.name}"?`)) return;
    try {
      await api(`/workflows/${wf._id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete workflow");
    }
  }

  if (!hasFeature("workflows")) {
    return (
      <div className="mx-auto max-w-[1000px] p-6">
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-base font-semibold">Workflows isn&apos;t on your plan</p>
          <p className="mt-1 text-sm text-slate-500">
            Ask your administrator to enable the Workflows feature.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] p-6">
      <PageHeader
        title="Workflows"
        subtitle="Automate what happens when things change in your CRM."
        actions={
          <div className="flex items-center gap-3">
            {capped && (
              <span
                className={`text-sm ${atLimit ? "font-medium text-amber-700" : "text-slate-500"}`}
              >
                {workflows.length} / {workflowLimit} used
              </span>
            )}
            <button
              onClick={() => setNewName("")}
              disabled={creating || atLimit}
              title={atLimit ? "Workflow limit reached" : undefined}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating…" : "+ Create Workflow"}
            </button>
          </div>
        }
      />

      {atLimit && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have reached your workflow limit ({workflowLimit}). Delete one to make
          room, or ask your administrator to increase it.
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {/* Only worth the space once there is something to sift through. */}
      {!loading && workflows.length > 5 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workflows…"
            className="input max-w-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="Filter by status"
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="published">Active</option>
            <option value="paused">Paused</option>
            <option value="draft">Draft</option>
          </select>
          <span className="text-xs text-slate-500">
            {visible.length} of {workflows.length}
          </span>
        </div>
      )}

      {loading ? (
        <p className="p-6 text-sm text-slate-500">Loading…</p>
      ) : workflows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-base font-semibold">No workflows yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Create your first workflow to define a trigger and the steps that follow.
          </p>
          <button
            onClick={() => setNewName("")}
            disabled={creating || atLimit}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "Creating…" : "+ Create Workflow"}
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Trigger</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Steps</th>
                <th className="px-4 py-3 font-semibold">Last run</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((wf) => (
                <tr key={wf._id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/workflows/${wf._id}`} className="font-medium hover:text-blue-700">
                      {wf.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {wf.trigger ? triggerLabels[wf.trigger] ?? wf.trigger : "— no trigger —"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        on={wf.status === "published"}
                        label={
                          wf.status === "published"
                            ? `Pause ${wf.name}`
                            : `Activate ${wf.name}`
                        }
                        onChange={() => toggleActive(wf)}
                      />
                      <StatusPill status={wf.status} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{countSteps(wf.steps)}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {wf.lastRunAt ? (
                      <span title={new Date(wf.lastRunAt).toLocaleString()}>
                        {relativeTime(wf.lastRunAt)}
                        {wf.runCount ? (
                          <span className="text-slate-400"> · {wf.runCount} run{wf.runCount === 1 ? "" : "s"}</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-slate-400">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <RowActions>
                      <RowAction action="edit" label="Edit" href={`/workflows/${wf._id}`} />
                      <RowAction action="delete" label="Delete" onClick={() => remove(wf)} />
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {newName !== null && (
        <NameDialog
          value={newName}
          saving={creating}
          onChange={setNewName}
          onCancel={() => setNewName(null)}
          onSubmit={() => create(newName)}
        />
      )}
    </div>
  );
}

/** Asked for before the workflow exists, so the list never fills with
 *  "Untitled Workflow" rows nobody can tell apart. */
function NameDialog({
  value,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: string;
  saving: boolean;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-32" onClick={onCancel}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 className="mb-1 text-lg font-semibold">Name this workflow</h2>
        <p className="mb-4 text-xs text-slate-500">
          Something you will recognise in a list, like &ldquo;New lead: welcome email&rdquo;.
        </p>
        <input
          autoFocus
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="New lead: welcome email"
          className="input"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || value.trim() === ""}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Three states in three colours: a paused workflow must not look like a draft,
 *  because one has run and the other never has. */
function StatusPill({ status }: { status: Workflow["status"] }) {
  const map = {
    published: { label: "Active", cls: "bg-emerald-50 text-emerald-700" },
    paused: { label: "Paused", cls: "bg-amber-50 text-amber-700" },
    draft: { label: "Draft", cls: "bg-slate-100 text-slate-500" },
  } as const;
  const s = map[status] ?? map.draft;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

function Switch({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${
        on ? "bg-emerald-500" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          on ? "left-[1.125rem]" : "left-0.5"
        }`}
      />
    </button>
  );
}

/** Relative time, because "2 hours ago" answers "is this thing running?" and a
 *  date does not. */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// countSteps totals steps including nested branch bodies.
function countSteps(steps: Workflow["steps"]): number {
  let n = 0;
  for (const s of steps) {
    n += 1;
    if (s.yes) n += countSteps(s.yes);
    if (s.no) n += countSteps(s.no);
  }
  return n;
}
