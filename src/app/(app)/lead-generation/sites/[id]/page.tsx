"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAsk } from "@/components/PromptProvider";
import type { Funnel, FunnelPage } from "@/lib/types";
import { FunnelEditor } from "@/components/leadgen/FunnelEditor";
import { Icon } from "@/components/icons";

type Tab = "pages" | "analytics" | "tracking" | "settings";
const TABS: { key: Tab; label: string }[] = [
  { key: "pages", label: "Pages" },
  { key: "analytics", label: "Analytics" },
  { key: "tracking", label: "Tracking" },
  { key: "settings", label: "Settings" },
];


export default function FunnelDetailPage() {
  const ask = useAsk();
  const params = useParams<{ id: string }>();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [tab, setTab] = useState<Tab>("pages");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  // Which page the right-hand panel and the editor are showing. Null falls back
  // to home, so the page survives a reload and a funnel that gains its first
  // extra page does not jump.
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [addingPage, setAddingPage] = useState(false);

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

  /*
   * The page list, and which one is in focus.
   *
   * `pages` is always populated by the API — it fills one in for funnels saved
   * before multi-page support — but the fallback stays because a stale cached
   * response during a deploy would otherwise crash the whole screen rather than
   * show one page.
   */
  const pages: FunnelPage[] =
    funnel.pages && funnel.pages.length > 0
      ? funnel.pages
      : [
          {
            id: "home",
            name: "Home",
            path: "",
            html: funnel.html,
            publishedHtml: funnel.publishedHtml,
          },
        ];
  // Falls back to home when the selected page has just been deleted, rather
  // than leaving the panel pointed at nothing.
  const selectedPage = pages.find((p) => p.id === selectedPageId) ?? pages[0];

  async function addPage() {
    /*
      An in-app dialog, not window.prompt.

      This is the "+" that QA recorded freezing a tab hard enough that it could
      not be recovered, with the endpoint behind it working correctly when
      called directly. window.prompt blocks the renderer including React's work
      loop, which is the obvious cause and is gone now.
    */
    const name = await ask({
      title: "Add a page",
      label: "Page name",
      defaultValue: "Thank you",
      hint: "Its address is made from the name — \"Thank you\" becomes /thank-you.",
      confirmLabel: "Add page",
      required: true,
    });
    if (!name?.trim()) return;
    setAddingPage(true);
    setError("");
    try {
      const updated = await api<Funnel>(`/funnels/${params.id}/pages`, {
        method: "POST",
        body: { name: name.trim() },
      });
      setFunnel(updated);
      // Select what was just created: adding a page and landing back on the old
      // one reads as the click not having worked.
      const added = updated.pages?.[updated.pages.length - 1];
      if (added) setSelectedPageId(added.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the page");
    } finally {
      setAddingPage(false);
    }
  }

  async function renamePage(page: FunnelPage) {
    const name = await ask({
      title: "Rename page",
      label: "Page name",
      defaultValue: page.name,
      hint: "Renaming does not change the page's address, so shared links keep working.",
      confirmLabel: "Rename",
      required: true,
    });
    if (!name?.trim() || name.trim() === page.name) return;
    try {
      setFunnel(
        await api<Funnel>(`/funnels/${params.id}/pages/${page.id}`, {
          method: "PATCH",
          body: { name: name.trim() },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename the page");
    }
  }

  async function removePage(page: FunnelPage) {
    if (
      !window.confirm(
        `Delete "${page.name}"? Its content goes with it, and /${page.path} will stop working for anyone who has the link.`,
      )
    ) {
      return;
    }
    try {
      const updated = await api<Funnel>(`/funnels/${params.id}/pages/${page.id}`, {
        method: "DELETE",
      });
      setFunnel(updated);
      if (selectedPageId === page.id) setSelectedPageId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the page");
    }
  }

  // The code editor takes over the whole view when editing.
  if (editing) {
    return (
      <FunnelEditor
        funnel={funnel}
        page={selectedPage}
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
  // A sub-page hangs off the funnel's own address.
  const publicUrl = selectedPage.path
    ? `${funnel.publicUrl}/${selectedPage.path}`
    : funnel.publicUrl;
  const hasContent = selectedPage.html.trim().length > 0;

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
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs">
                  {pages.length}
                </span>
                {/* The whole point of a funnel is more than one page. This was
                    a hardcoded list of exactly one. */}
                <button
                  onClick={addPage}
                  disabled={addingPage}
                  title="Add a page"
                  aria-label="Add a page"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 text-slate-500 transition hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                >
                  +
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              {pages.map((pg, i) => {
                const active = pg.id === selectedPage.id;
                return (
                  <div
                    key={pg.id}
                    className={`group rounded-lg border px-3 py-2 transition ${
                      active
                        ? "border-blue-200 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedPageId(pg.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-sm font-medium">
                          {i === 0 ? "⌂ " : ""}
                          {pg.name}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          /{pg.path}
                        </span>
                      </button>
                      {active && (
                        <span className="shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-[11px] text-white">
                          Active
                        </span>
                      )}
                      {/* Home has no delete: it is the address on every link
                          already shared, and the server refuses it anyway. */}
                      {i > 0 && (
                        <button
                          onClick={() => removePage(pg)}
                          title="Delete page"
                          aria-label={`Delete ${pg.name}`}
                          className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition hover:text-rose-600 group-hover:opacity-100"
                        >
                          <Icon.Trash width={14} height={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Home page detail */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{selectedPage.name}</h2>
              <button
                onClick={() => renamePage(selectedPage)}
                className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                Rename
              </button>
            </div>

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
              <p className="mt-1 text-xs text-slate-400">
                Path: /site/{funnel.slug}
                {selectedPage.path ? `/${selectedPage.path}` : ""}
              </p>
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
