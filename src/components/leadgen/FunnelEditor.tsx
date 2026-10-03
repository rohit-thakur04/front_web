"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Funnel } from "@/lib/types";

type Mode = "code" | "preview";
type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

const STARTER_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My Landing Page</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; }
      .hero { padding: 80px 24px; text-align: center;
              background: linear-gradient(135deg,#2563eb,#7c3aed); color:#fff; }
      .hero h1 { font-size: 44px; margin: 0 0 12px; }
      .cta { display:inline-block; margin-top:24px; background:#fff; color:#2563eb;
             padding:14px 28px; border-radius:10px; text-decoration:none; font-weight:600; }
    </style>
  </head>
  <body>
    <section class="hero">
      <h1>Welcome to Arkquen</h1>
      <p>Build your landing page by editing this HTML.</p>
      <a class="cta" href="#">Get Started</a>
    </section>
  </body>
</html>`;

interface Props {
  funnel: Funnel;
  onExit: () => void;
  onChange: (f: Funnel) => void;
}

export function FunnelEditor({ funnel, onExit, onChange }: Props) {
  const [html, setHtml] = useState(funnel.html);
  const [mode, setMode] = useState<Mode>("code");
  const [device, setDevice] = useState<Device>("desktop");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Dirty = the editor's HTML differs from what's saved on the server.
  const [savedHtml, setSavedHtml] = useState(funnel.html);
  const dirty = html !== savedHtml;

  const lineCount = html ? html.split("\n").length : 0;

  async function save(): Promise<boolean> {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const updated = await api<Funnel>(`/funnels/${funnel._id}`, {
        method: "PUT",
        body: { html },
      });
      setSavedHtml(updated.html);
      onChange(updated);
      setNotice("Saved.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    // Save the draft first, so what goes live is exactly what's on screen.
    setPublishing(true);
    try {
      if (dirty && !(await save())) return;
      const published = await api<Funnel>(`/funnels/${funnel._id}/publish`, { method: "POST" });
      setSavedHtml(published.html);
      onChange(published);
      // Names the address, because that is the question a client asks the moment
      // they press Publish and the product never used to answer it.
      setNotice(
        published.publicUrl
          ? `Published — live at ${published.publicUrl}`
          : "Published.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish");
    } finally {
      setPublishing(false);
    }
  }

  /*
   * Opens the live page where one exists, and a local render where it does not.
   *
   * This button used to always build a blob: URL from the editor's buffer. That
   * looks exactly like the published page, which is how it came to stand in for
   * one — a QA pass found the funnel module shipping a "public URL" that 404s
   * while Open produced an address generated inside the author's own browser
   * that could not be sent to anybody.
   *
   * So: once published, Open goes to the real address, which is the thing the
   * author actually needs to test and share. Before that it keeps rendering the
   * draft locally, and the label says which of the two it is doing.
   */
  function openInNewTab() {
    if (funnel.published && funnel.publicUrl) {
      window.open(funnel.publicUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    // Revoke shortly after so the new tab has time to load.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Editor toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <button onClick={onExit} className="text-slate-400 hover:text-slate-900" aria-label="Back">
          ←
        </button>
        <span className="font-semibold">{funnel.name}</span>
        <span className="text-xs text-slate-400">Home</span>

        {/* Mode switch */}
        <div className="ml-2 flex overflow-hidden rounded-lg border border-slate-300">
          <button
            onClick={() => setMode("code")}
            className={`px-3 py-1 text-sm ${mode === "code" ? "bg-blue-600 text-white" : "hover:bg-slate-50"}`}
          >
            ‹/› Code
          </button>
          <button
            onClick={() => setMode("preview")}
            className={`px-3 py-1 text-sm ${mode === "preview" ? "bg-blue-600 text-white" : "hover:bg-slate-50"}`}
          >
            ◉ Preview
          </button>
        </div>

        {/* Device widths (affect the preview) */}
        {mode === "preview" && (
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            {(["desktop", "tablet", "mobile"] as Device[]).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className={`px-2 py-1 text-sm ${device === d ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`}
                title={d}
              >
                {d === "desktop" ? "🖥" : d === "tablet" ? "▭" : "▯"}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
          {funnel.published && !dirty && (
            <span className="text-xs text-emerald-600">● Published</span>
          )}
          <button
            onClick={openInNewTab}
            title={
              funnel.published
                ? "Open the published page at its public address"
                : "Render this draft locally — it is not online yet"
            }
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            {funnel.published ? "↗ Open live" : "↗ Open draft"}
          </button>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={publish}
            disabled={publishing}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {publishing ? "Publishing…" : "✦ Publish"}
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div className="border-b border-slate-100 px-4 py-1.5 text-sm">
          {error ? (
            <span className="text-rose-700">{error}</span>
          ) : (
            <span className="text-emerald-700">{notice}</span>
          )}
        </div>
      )}

      {/* Body: code editor or preview */}
      {mode === "code" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              HTML Source · {lineCount} line{lineCount === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              {!html.trim() && (
                <button
                  onClick={() => setHtml(STARTER_HTML)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                >
                  Insert starter template
                </button>
              )}
              <button
                onClick={() => navigator.clipboard.writeText(html)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              >
                Copy
              </button>
            </div>
          </div>
          <CodeArea value={html} onChange={setHtml} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-slate-100 p-4">
          <div
            className="h-full overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm transition-all"
            style={{ width: DEVICE_WIDTH[device], maxWidth: "100%" }}
          >
            <PreviewFrame html={html} />
          </div>
        </div>
      )}
    </div>
  );
}

// CodeArea is a plain textarea with a synced line-number gutter — enough to paste
// and edit HTML without pulling in a heavy code-editor dependency.
function CodeArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lines = Math.max(value.split("\n").length, 1);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden font-mono text-sm">
      <div
        ref={gutterRef}
        className="select-none overflow-hidden bg-slate-50 px-2 py-2 text-right text-xs text-slate-400"
      >
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="leading-5">
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        spellCheck={false}
        placeholder="Paste or write your HTML here…"
        className="flex-1 resize-none px-3 py-2 leading-5 outline-none"
      />
    </div>
  );
}

// PreviewFrame renders the HTML in a sandboxed iframe via srcDoc. Sandboxing keeps
// the page's scripts from touching the app; allow-scripts lets the page's own JS run.
function PreviewFrame({ html }: { html: string }) {
  if (!html.trim()) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Nothing to preview yet — add HTML in the Code tab.
      </div>
    );
  }
  return (
    <iframe
      title="Page preview"
      srcDoc={html}
      sandbox="allow-scripts allow-forms"
      className="h-full w-full border-0"
    />
  );
}
