"use client";

import { useEffect, useState } from "react";
import { api, apiBase } from "@/lib/api";
import { RowAction, RowActions } from "@/components/RowActions";
import type { ShortURL } from "@/lib/types";

// The redirect lives on the API host, not the web host — /r/:code is served by
// the Go router, so a link must point there to resolve.
function shortLink(code: string) {
  return `${apiBase}/r/${code}`;
}

export function URLsTab() {
  const [links, setLinks] = useState<ShortURL[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState("");

  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [campaign, setCampaign] = useState("");
  const [code, setCode] = useState("");

  async function load() {
    try {
      setLinks(await api<ShortURL[]>("/urls"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load short links");
    } finally {
      setLoading(false);
    }
  }

  // Matches the other lead-gen tabs: the async work is wrapped so the effect
  // body itself doesn't set state synchronously.
  useEffect(() => {
    async function run() {
      await load();
    }
    run();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const link = await api<ShortURL>("/urls", {
        method: "POST",
        body: { targetUrl: target, title, campaign, code },
      });
      // Prepend rather than refetch: the list is sorted newest-first anyway.
      setLinks((prev) => [link, ...prev]);
      setTarget("");
      setTitle("");
      setCampaign("");
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the link");
    } finally {
      setSaving(false);
    }
  }

  async function remove(link: ShortURL) {
    if (
      !window.confirm(
        `Delete /r/${link.code}? Anyone who already has this link will get a "not found" page.`,
      )
    )
      return;
    try {
      await api(`/urls/${link._id}`, { method: "DELETE" });
      setLinks((prev) => prev.filter((l) => l._id !== link._id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the link");
    }
  }

  async function copy(link: ShortURL) {
    try {
      await navigator.clipboard.writeText(shortLink(link.code));
      setCopied(link._id);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      // Clipboard needs a secure context; the link is visible to copy by hand.
      setError("Couldn't copy automatically — select the link and copy it.");
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={create}
        className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Destination URL *</label>
          <input
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="https://example.com/diwali-offer"
            className="input"
          />
          <p className="mt-1 text-xs text-slate-500">
            Where the short link sends people. If you leave off https://, it&apos;s added.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Label</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Diwali landing page"
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Campaign</label>
          <input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="diwali-whatsapp"
            className="input"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Custom code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Leave blank to generate one"
            className="input"
          />
          <p className="mt-1 text-xs text-slate-500">
            3–32 characters: letters, numbers, hyphen or underscore. The code can&apos;t be
            changed later, because shared links would break — but you can always repoint it.
          </p>
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create short link"}
          </button>
        </div>
      </form>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {loading ? (
        <p className="p-6 text-sm text-slate-500">Loading…</p>
      ) : links.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-base font-semibold">No short links yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Create one to share in a WhatsApp campaign or an email, and see how many
            people followed it.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Short link</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3 text-right">Clicks</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l._id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium">/r/{l.code}</span>
                    {l.title && <p className="text-xs text-slate-500">{l.title}</p>}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-600" title={l.targetUrl}>
                    {l.targetUrl}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.campaign || "—"}</td>
                  <td className="px-4 py-3 text-right font-medium">{l.clicks}</td>
                  <td className="px-4 py-3 text-right">
                    <RowActions>
                      {/* Copy keeps its word: the label doubles as the
                          "Copied ✓" confirmation, which an icon cannot carry. */}
                      <button
                        onClick={() => copy(l)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                      >
                        {copied === l._id ? "Copied ✓" : "Copy"}
                      </button>
                      <RowAction action="delete" label="Delete" onClick={() => remove(l)} />
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
