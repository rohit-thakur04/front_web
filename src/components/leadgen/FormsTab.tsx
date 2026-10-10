"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { RowAction, RowActions } from "@/components/RowActions";
import type { Form } from "@/lib/types";

export function FormsTab() {
  const router = useRouter();
  const [forms, setForms] = useState<Form[]>([]);
  const [tab, setTab] = useState<"forms" | "templates">("forms");
  const [search, setSearch] = useState("");
  const [latestFirst, setLatestFirst] = useState(true);
  const [view, setView] = useState<"list" | "grid">("list");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setForms(await api<Form[]>("/forms"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load forms");
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
    const filtered = term ? forms.filter((f) => f.name.toLowerCase().includes(term)) : forms;
    return [...filtered].sort((a, b) => {
      const cmp = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return latestFirst ? cmp : -cmp;
    });
  }, [forms, search, latestFirst]);

  async function remove(f: Form) {
    if (!window.confirm(`Delete "${f.name}"?`)) return;
    try {
      await api(`/forms/${f._id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete form");
    }
  }

  return (
    <div>
      {/* All Forms / Templates sub-tabs */}
      <div className="mb-4 flex items-center gap-4 border-b border-slate-200">
        <button
          onClick={() => setTab("forms")}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-1 py-2 text-sm ${
            tab === "forms" ? "border-blue-600 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          📄 All Forms
        </button>
        <button
          onClick={() => setTab("templates")}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-1 py-2 text-sm ${
            tab === "templates" ? "border-blue-600 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          🔖 Templates
        </button>
      </div>

      {tab === "templates" ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-base font-semibold">Templates are coming soon</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Ready-to-use form templates will land here. For now, start a form from scratch and build
            your own.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Forms</h2>
          <p className="mb-4 text-sm text-slate-500">
            Create, manage, and organise forms for lead capture without coding.
          </p>

          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              placeholder="Search forms…"
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
                New Folder
              </button>
              <button
                onClick={() => setCreating(true)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                + Create
              </button>
            </div>
          </div>

          {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {loading ? (
            <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3M9 3h6M8 12h8M8 16h5" />
                </svg>
              </div>
              <p className="text-base font-semibold">No forms yet</p>
              <p className="mt-1 text-sm text-slate-500">Create your first lead-capture form.</p>
              <button
                onClick={() => setCreating(true)}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                + Create
              </button>
            </div>
          ) : view === "list" ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Fields</th>
                    <th className="px-3 py-2">Last Updated</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((f) => (
                    <tr key={f._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium">
                        <Link href={`/lead-generation/forms/${f._id}`} className="hover:underline">
                          {f.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {f.status === "published" ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            published
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                            draft
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{f.fields?.length ?? 0}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {new Date(f.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <RowActions>
                          <RowAction action="edit" label="Edit" href={`/lead-generation/forms/${f._id}`} />
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
                  <Link href={`/lead-generation/forms/${f._id}`}>
                    <div className="mb-2 flex h-24 items-center justify-center rounded-lg bg-slate-100 text-slate-300 hover:bg-slate-200">
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                        <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3M8 12h8M8 16h5" />
                      </svg>
                    </div>
                    <p className="font-medium hover:underline">{f.name}</p>
                  </Link>
                  <p className="text-xs text-slate-500">
                    {f.status === "published" ? "Published" : "Draft"} · {f.fields?.length ?? 0} fields
                  </p>
                  <div className="mt-2">
                    <RowActions>
                      <RowAction action="delete" label="Delete" onClick={() => remove(f)} />
                    </RowActions>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {creating && (
        <CreateFormDialog
          onClose={() => setCreating(false)}
          onCreate={async () => {
            const created = await api<Form>("/forms", { method: "POST", body: { name: "Untitled Form" } });
            router.push(`/lead-generation/forms/${created._id}`);
          }}
        />
      )}
    </div>
  );
}

// The "Create New Form" chooser from the reference. Only "Start from Scratch" is
// wired this pass; Templates and AI Builder are shown but disabled.
function CreateFormDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function scratch() {
    setBusy(true);
    setError("");
    try {
      await onCreate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create form");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-xl font-semibold">Create New Form</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>
        <p className="mb-5 text-sm text-slate-500">Choose how you&apos;d like to create your form.</p>

        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="grid gap-4 sm:grid-cols-3">
          <button
            onClick={scratch}
            disabled={busy}
            className="group flex flex-col items-center rounded-xl border border-slate-200 p-6 text-center transition hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-60"
          >
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-2xl text-blue-600">
              +
            </span>
            <span className="font-semibold">Start from Scratch</span>
            <span className="mt-1 text-xs text-slate-500">{busy ? "Creating…" : "Build a blank form"}</span>
          </button>

          {/*
            Not built, and now saying so on screen.

            It carried a cursor and a tooltip, which is no signal at all on a
            touch device — there is no pointer to change and nothing to hover.
            A badge works everywhere.

            The old subtitle read "20+ ready-to-use forms". Those templates do
            not exist, and advertising a quantity of something unbuilt is the
            kind of claim that should not ship.
          */}
          <div
            aria-disabled="true"
            className="relative flex cursor-not-allowed flex-col items-center rounded-xl border border-dashed border-slate-300 p-6 text-center opacity-70"
          >
            <span className="absolute top-2 right-2 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              Coming soon
            </span>
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-xl text-slate-500">
              ▤
            </span>
            <span className="font-semibold">From Templates</span>
            <span className="mt-1 text-xs text-slate-500">
              Prebuilt forms are not available yet
            </span>
          </div>

          <div
            aria-disabled="true"
            className="relative flex cursor-not-allowed flex-col items-center rounded-xl border border-dashed border-slate-300 p-6 text-center opacity-70"
          >
            <span className="absolute top-2 right-2 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              Coming soon
            </span>
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-xl text-blue-600">
              ✨
            </span>
            <span className="font-semibold">AI Builder</span>
            {/* Names the dependency rather than only the absence, so somebody
                who has connected a provider knows this is not waiting on them.
                AI Studio writes pages and copy today, not forms. */}
            <span className="mt-1 text-xs text-slate-500">
              Generating forms is not built yet
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
