"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAsk } from "@/components/PromptProvider";
import { PageHeader } from "@/components/ui";
import { RowAction, RowActions } from "@/components/RowActions";
import type { User } from "@/lib/types";

interface SnapshotCounts {
  pipelines: number;
  stages: number;
  templates: number;
  workflows: number;
  forms: number;
  wabaTemplates: number;
}

interface Snapshot {
  _id: string;
  name: string;
  description: string;
  createdAt: string;
  counts: SnapshotCounts;
}

/** The contents, as a sentence, skipping whatever a snapshot does not contain. */
function describe(c: SnapshotCounts): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(c.pipelines, "pipeline", "pipelines");
  add(c.stages, "stage", "stages");
  add(c.templates, "email template", "email templates");
  add(c.workflows, "workflow", "workflows");
  add(c.forms, "form", "forms");
  add(c.wabaTemplates, "WhatsApp template", "WhatsApp templates");
  return parts.length > 0 ? parts.join(" · ") : "Empty";
}

/*
Snapshots: capture a configured account, start another from it.

Admin-only, and the page says out loud what applying does. The reassurance is
load-bearing rather than decorative: somebody onboarding a client needs to know
before they click that nothing starts sending, because the alternative reading —
that a snapshot might email a brand-new client's contacts — is exactly what
would stop them using the feature at all.
*/
export default function SnapshotsPage() {
  const ask = useAsk();
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [accounts, setAccounts] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceOwnerId, setSourceOwnerId] = useState("");

  async function load() {
    try {
      setSnaps(await api<Snapshot[]>("/snapshots"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load snapshots");
    }
    try {
      const users = await api<User[]>("/auth/users");
      // Staff share their client's workspace, so they are not a separate thing
      // to capture from or apply to.
      setAccounts(users.filter((u) => u.role !== "staff"));
    } catch {
      // The pickers fall back to "my own workspace", which is the common case.
    }
  }

  // Matches the other pages: the async work is wrapped so the effect body
  // itself doesn't set state synchronously.
  useEffect(() => {
    async function run() {
      await load();
    }
    void run();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/snapshots", {
        method: "POST",
        body: { name, description, sourceOwnerId },
      });
      setName("");
      setDescription("");
      await load();
      setNotice("Snapshot captured.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not capture the snapshot");
    } finally {
      setBusy(false);
    }
  }

  async function apply(snap: Snapshot) {
    /*
     * A picker, not a pasted id.
     *
     * Asking somebody to read an id out of a list and type it back is how a
     * snapshot gets applied to the wrong client — which then has to be unpicked
     * by hand, since applying is additive and has no undo.
     */
    const target = await ask({
      title: `Apply "${snap.name}"`,
      label: "Apply it to which account?",
      options: accounts.map((a) => ({ value: a._id, label: a.name || a.email })),
      hint: "Everything arrives as a draft. Nothing sends until it is published there.",
      confirmLabel: "Apply snapshot",
      required: true,
    });
    if (!target?.trim()) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await api<{ message: string }>(`/snapshots/${snap._id}/apply`, {
        method: "POST",
        body: { targetOwnerId: target.trim() },
      });
      setNotice(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply the snapshot");
    } finally {
      setBusy(false);
    }
  }

  async function remove(snap: Snapshot) {
    if (
      !window.confirm(
        `Delete the snapshot "${snap.name}"? Accounts you already applied it to keep everything — they hold their own copies.`,
      )
    ) {
      return;
    }
    try {
      await api(`/snapshots/${snap._id}`, { method: "DELETE" });
      setSnaps((prev) => prev.filter((s) => s._id !== snap._id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the snapshot");
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] p-6">
      <PageHeader
        title="Snapshots"
        subtitle="Capture a configured workspace and start a new client from it"
      />

      <form
        onSubmit={create}
        className="mb-4 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">Snapshot name *</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Real estate starter"
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Capture from</label>
          <select
            value={sourceOwnerId}
            onChange={(e) => setSourceOwnerId(e.target.value)}
            className="input"
          >
            <option value="">My own workspace</option>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name || a.email}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">What is this for?</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Two-stage pipeline, 3-day follow-up, enquiry form"
            className="input"
          />
        </div>

        <div className="sm:col-span-2">
          <p className="mb-2 text-xs text-slate-500">
            Captures pipelines, stages, email sequences, workflows, forms and WhatsApp templates.
            Never contacts, integration keys, short links or any click and send history.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Working…" : "Capture snapshot"}
          </button>
        </div>
      </form>

      {error && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
      {notice && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      {snaps.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-medium">No snapshots yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Set one account up the way a new client should start, then capture it here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Snapshot</th>
                <th className="px-4 py-3 font-medium">Contents</th>
                <th className="px-4 py-3 font-medium">Captured</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snaps.map((s) => (
                <tr key={s._id}>
                  <td className="px-4 py-3">
                    <span className="font-medium">{s.name}</span>
                    {s.description && (
                      <span className="block text-xs text-slate-500">{s.description}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{describe(s.counts)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <RowActions>
                      <RowAction
                        action="edit"
                        label="Apply to an account"
                        onClick={() => apply(s)}
                      />
                      <RowAction action="delete" label="Delete" onClick={() => remove(s)} />
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            Applying adds to an account and never clears it. Everything arrives as a draft —
            nothing sends until it is published in that account.
          </p>
        </div>
      )}
    </div>
  );
}
