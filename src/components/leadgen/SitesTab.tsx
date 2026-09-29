"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { RowAction, RowActions } from "@/components/RowActions";
import type { Funnel, FunnelType } from "@/lib/types";

const TYPE_LABEL: Record<FunnelType, string> = {
  funnel: "Funnel",
  website: "Website",
  link_page: "Link Page",
};

export function SitesTab() {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [search, setSearch] = useState("");
  const [latestFirst, setLatestFirst] = useState(true);
  const [view, setView] = useState<"list" | "grid">("list");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setFunnels(await api<Funnel[]>("/funnels"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load funnels");
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

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? funnels.filter((f) => f.name.toLowerCase().includes(term))
      : funnels;
    return [...filtered].sort((a, b) => {
      const cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return latestFirst ? cmp : -cmp;
    });
  }, [funnels, search, latestFirst]);

  async function remove(f: Funnel) {
    if (!window.confirm(`Delete "${f.name}"?`)) return;
    try {
      await api(`/funnels/${f._id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete funnel");
    }
  }

  return (
    <div>
      {/* Toolbar mirrors the reference: search, sort, view toggle, actions. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          placeholder="Search funnels…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          value={latestFirst ? "latest" : "oldest"}
          onChange={(e) => setLatestFirst(e.target.value === "latest")}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="latest">Latest to oldest</option>
          <option value="oldest">Oldest to latest</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            <button
              onClick={() => setView("list")}
              className={`px-2 py-1.5 text-sm ${view === "list" ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`}
              aria-label="List view"
            >
              ☰
            </button>
            <button
              onClick={() => setView("grid")}
              className={`px-2 py-1.5 text-sm ${view === "grid" ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`}
              aria-label="Grid view"
            >
              ▦
            </button>
          </div>
          <button
            disabled
            title="Templates are not available yet"
            className="cursor-not-allowed rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-400"
          >
            Templates
          </button>
          <button
            disabled
            title="Folders are not available yet"
            className="cursor-not-allowed rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-400"
          >
            New folder
          </button>
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Create
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {loading ? (
        <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
            </svg>
          </div>
          <p className="text-base font-semibold">No funnels yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Create your first funnel or website to start building pages.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Create New
          </button>
        </div>
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((f) => (
                <tr key={f._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/lead-generation/sites/${f._id}`} className="hover:underline">
                      {f.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {TYPE_LABEL[f.type]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {f.published ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        ● Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        ○ Offline
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {new Date(f.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RowActions>
                      {/* "Open" navigated in-app to the editor — the same action
                          Workflows calls Edit — so it wears the pencil. The
                          external-link icon is reserved for genuine new tabs. */}
                      <RowAction action="edit" label="Edit" href={`/lead-generation/sites/${f._id}`} />
                      <RowAction action="delete" label="Delete" onClick={() => remove(f)} />
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((f) => (
            <div key={f._id} className="rounded-xl border border-slate-200 bg-white p-4">
              <Link href={`/lead-generation/sites/${f._id}`}>
                <div className="mb-2 flex h-24 items-center justify-center rounded-lg bg-slate-100 text-slate-300 hover:bg-slate-200">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M3 3h18v4H3zM3 10h18v11H3z" />
                  </svg>
                </div>
                <p className="font-medium hover:underline">{f.name}</p>
              </Link>
              <p className="text-xs text-slate-500">
                {TYPE_LABEL[f.type]} · {f.published ? "Published" : "Offline"}
              </p>
              <button
                onClick={() => remove(f)}
                className="mt-2 text-xs text-slate-500 hover:text-rose-600"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateFunnelDialog
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function CreateFunnelDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<FunnelType>("funnel");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api("/funnels", { method: "POST", body: { name: name.trim(), type } });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create funnel");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create Funnel</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Name <span className="text-rose-500">*</span>
            </label>
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter funnel name"
              className="input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FunnelType)}
              className="input"
            >
              <option value="funnel">Funnel</option>
              <option value="website">Website</option>
              <option value="link_page">Link Page</option>
            </select>
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
