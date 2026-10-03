"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Funnel } from "@/lib/types";
import { FunnelEditor } from "@/components/leadgen/FunnelEditor";

type Tab = "pages" | "analytics" | "tracking" | "settings";
const TABS: { key: Tab; label: string }[] = [
  { key: "pages", label: "Pages" },
  { key: "analytics", label: "Analytics" },
  { key: "tracking", label: "Tracking" },
  { key: "settings", label: "Settings" },
];


export default function FunnelDetailPage() {
  const params = useParams<{ id: string }>();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [tab, setTab] = useState<Tab>("pages");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setFunnel(await api<Funnel>(`/funnels/${params.id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load funnel");
    }
  }

  useEffect(() => {
    async function run() {
      if (params.id) await load();
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <p className="p-6 text-sm text-rose-600">{error}</p>;
  if (!funnel) return <p className="p-6 text-sm text-slate-500">Loading…</p>;

  // The code editor takes over the whole view when editing.
  if (editing) {
    return (
      <FunnelEditor
        funnel={funnel}
        onExit={async () => {
          setEditing(false);
          await load();
        }}
        onChange={setFunnel}
      />
    );
  }

  /*
   * The address the server actually serves this page at.
   *
   * It used to be a hardcoded https://arkquen.com/site/<slug>, which returned
   * 404 — the route did not exist, and Open rendered a blob: URL generated inside
   * the author's own browser that could not be shared with anyone. The API now
   * serves /site/<slug> and tells us where, so what is displayed is the link that
   * works.
   */
  const publicUrl = funnel.publicUrl;
  const hasContent = funnel.html.trim().length > 0;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/lead-generation" className="text-slate-400 hover:text-slate-900" aria-label="Back">
          ←
        </Link>
        <h1 className="text-xl font-semibold">{funnel.name}</h1>
        {funnel.published ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Published
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            Offline
          </span>
        )}
        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs capitalize text-slate-500">
          {funnel.type.replace("_", " ")}
        </span>

        <div className="ml-auto text-sm text-slate-500">
          {funnel.published ? (
            <>Last published {funnel.publishedAt ? new Date(funnel.publishedAt).toLocaleString() : ""}</>
          ) : (
            <span className="text-amber-600">Not published yet</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
              tab === t.key
                ? "border-blue-600 font-medium text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pages" && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Pages list */}
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Pages</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs">1</span>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">⌂ Home</span>
                <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[11px] text-white">Active</span>
              </div>
              <p className="text-xs text-slate-500">/</p>
            </div>
          </div>

          {/* Home page detail */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-base font-semibold">Home</h2>

            <div className="rounded-lg bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">🔗</span>
                <span className="flex-1 truncate text-sm text-slate-500" title={publicUrl}>
                  {publicUrl}
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(publicUrl)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-white"
                >
                  Copy
                </button>
                {/* Only offered once published, because that is the only state in
                    which the address serves anything. Offering it on a draft is
                    how the old blob: preview came to be mistaken for a live page. */}
                {funnel.published && (
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-white"
                  >
                    Open ↗
                  </a>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-400">Path: /site/{funnel.slug}</p>
              {!funnel.published && hasContent && (
                <p className="mt-1 text-xs text-slate-400">
                  This address returns &ldquo;not found&rdquo; until you publish.
                </p>
              )}
              {!hasContent && (
                <p className="mt-1 text-xs text-amber-600">
                  ⚠ This page is empty. Add HTML in the editor, then publish to preview it.
                </p>
              )}
              {hasContent && !funnel.published && (
                <p className="mt-1 text-xs text-amber-600">
                  ⚠ You have unpublished changes. Publish from the editor to make them live.
                </p>
              )}
            </div>

            <div className="mt-4 flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 p-8 text-center">
              {hasContent ? (
                <>
                  <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500">
                    ✓
                  </div>
                  <p className="text-base font-semibold">This page has content</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Open the editor to keep editing, preview, or publish.
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                    ▦
                  </div>
                  <p className="text-base font-semibold">Page is empty</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Start building this page by pasting HTML in the code editor.
                  </p>
                </>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  ✎ Start Editing
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                >
                  ✦ Use Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab !== "pages" && (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-base font-semibold capitalize">{tab}</p>
          <p className="mt-1 text-sm text-slate-500">
            {tab === "analytics" && "Traffic and conversion analytics for this funnel."}
            {tab === "tracking" && "Add tracking pixels and scripts (GA, Meta Pixel, …)."}
            {tab === "settings" && "Funnel name, domain, and SEO settings."}
          </p>
          <span className="mt-4 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            In development
          </span>
        </div>
      )}
    </div>
  );
}
