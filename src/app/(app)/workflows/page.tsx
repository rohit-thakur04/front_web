"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { RowAction, RowActions } from "@/components/RowActions";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import type { Workflow } from "@/lib/types";

export default function WorkflowsPage() {
  const { hasFeature, workflowLimit } = useAuth();
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

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
    }
    run();
  }, []);

  async function create() {
    setCreating(true);
    setError("");
    try {
      const wf = await api<Workflow>("/workflows", {
        method: "POST",
        body: { name: "Untitled Workflow" },
      });
      router.push(`/workflows/${wf._id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create workflow");
      setCreating(false);
    }
  }

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
              onClick={create}
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

      {loading ? (
        <p className="p-6 text-sm text-slate-500">Loading…</p>
      ) : workflows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-base font-semibold">No workflows yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Create your first workflow to define a trigger and the steps that follow.
          </p>
          <button
            onClick={create}
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
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Steps</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((wf) => (
                <tr key={wf._id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/workflows/${wf._id}`} className="font-medium hover:text-blue-700">
                      {wf.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        wf.status === "published"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {wf.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{countSteps(wf.steps)}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(wf.updatedAt).toLocaleDateString()}
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
    </div>
  );
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
