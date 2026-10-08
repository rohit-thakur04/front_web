"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Button, EmptyState, Panel, Spinner } from "@/components/kit";
import { Icon } from "@/components/icons";
import type { Funnel } from "@/lib/types";

interface JobSpec {
  job: string;
  label: string;
  blurb: string;
  htmlOutput: boolean;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Sanitized markup, for a reply that is a page rather than prose. */
  html?: string;
}

/*
AI Studio.

Deliberately not a general chatbot with a clever prompt. Each job has its own
instructions on the server and its own output contract, and the one that writes
pages produces markup this product can install — which is the difference between
a feature and a demo.

Two things it is careful about, both because the output is going somewhere real:

- A generated page lands as a DRAFT on a funnel page, never published. Somebody
  whose first generation went live unreviewed would not use this twice.

- The markup shown in the preview is the sanitized version the server returned,
  not the raw reply. So what is previewed is what would be published, and a
  model cannot smuggle a script tag past the preview.

The provider is whichever the tenant connected in the App Store. Their key,
their bill, their choice of vendor.
*/
export function AIStudio() {
  /* Fetched here rather than passed in: the tab strip holds no state and the
     sites list is only needed once a page has actually been generated. */
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [jobs, setJobs] = useState<JobSpec[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);

  const [job, setJob] = useState("page");
  const [provider, setProvider] = useState("");
  const [prompt, setPrompt] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [applyingTo, setApplyingTo] = useState("");
  const [applied, setApplied] = useState("");

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function run() {
      try {
        const res = await api<{ providers: string[]; jobs: JobSpec[]; message: string }>(
          "/ai/status",
        );
        setJobs(res.jobs ?? []);
        setProviders(res.providers ?? []);
        setProvider(res.providers?.[0] ?? "");
        setNotice(res.message ?? "");
      } catch {
        setNotice("AI Studio is unavailable right now.");
      } finally {
        setReady(true);
      }
      try {
        setFunnels(await api<Funnel[]>("/funnels"));
      } catch {
        // Without the list a generated page simply cannot be installed yet,
        // which the reply panel says rather than failing the whole tab.
      }
    }
    void run();
  }, []);

  // Keeps the newest turn in view as the conversation grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  const current = jobs.find((j) => j.job === job);

  async function send() {
    const text = prompt.trim();
    if (!text || busy) return;

    // Appended before the request so the conversation reads as a conversation
    // rather than jumping both turns in at once when the reply lands.
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setPrompt("");
    setBusy(true);
    setError("");
    setApplied("");

    try {
      const res = await api<{ reply: string; html?: string; provider: string }>(
        "/ai/generate",
        {
          method: "POST",
          body: {
            job,
            provider,
            // Only role and content: the server rejects anything else, and the
            // html on a previous turn is ours rather than part of the chat.
            messages: next.map((t) => ({ role: t.role, content: t.content })),
          },
        },
      );
      setTurns([...next, { role: "assistant", content: res.reply, html: res.html }]);
    } catch (e) {
      // The failed turn stays on screen, so the prompt is not lost and can be
      // retried or edited.
      setError(e instanceof Error ? e.message : "The AI did not answer");
    } finally {
      setBusy(false);
    }
  }

  async function applyToSite(html: string, funnelId: string) {
    setApplyingTo(funnelId);
    setError("");
    try {
      const res = await api<{ message: string }>(`/funnels/${funnelId}/ai-apply`, {
        method: "POST",
        body: { html },
      });
      setApplied(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save it to that site");
    } finally {
      setApplyingTo("");
    }
  }

  if (!ready) {
    return (
      <Panel>
        <p className="text-sm text-[var(--ark-ink-3)]">Checking your AI connection…</p>
      </Panel>
    );
  }

  /* No key, no chat box. Offering an input that cannot send is worse than
     saying plainly what is missing and where to fix it. */
  if (providers.length === 0) {
    return (
      <Panel flush>
        <EmptyState
          icon={<Icon.Sparkle width={18} height={18} />}
          title="No AI provider connected"
          body={
            notice ||
            "AI Studio uses your own Gemini, OpenAI or Anthropic key, so the usage is billed to you and nothing is shared with other accounts."
          }
          action={
            <Link href="/settings/app-store">
              <Button tone="primary" size="sm">
                Connect a provider
              </Button>
            </Link>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      {/* What the AI is being asked to do. A segmented row rather than a
          dropdown, because the choice changes what a good prompt looks like
          and so needs to stay visible while writing one. */}
      <Panel>
        <div className="flex flex-wrap items-center gap-1.5">
          {jobs.map((j) => (
            <button
              key={j.job}
              onClick={() => {
                setJob(j.job);
                // A new job is a new conversation: the previous turns were
                // written under different instructions and would mislead it.
                setTurns([]);
                setApplied("");
                setError("");
              }}
              className={`rounded-[var(--ark-r-md)] border px-2.5 py-1 text-[13px] font-medium transition-colors ${
                job === j.job
                  ? "border-transparent bg-[var(--ark-primary)] text-[var(--ark-primary-ink)]"
                  : "border-[var(--ark-line)] text-[var(--ark-ink-2)] hover:bg-[var(--ark-surface-2)]"
              }`}
            >
              {j.label}
            </button>
          ))}

          {providers.length > 1 && (
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              title="Which of your connected providers to use"
              className="input ml-auto w-auto"
            >
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
        </div>
        {current && (
          <p className="mt-2 text-xs text-[var(--ark-ink-3)]">{current.blurb}</p>
        )}
      </Panel>

      {/* The conversation. */}
      {turns.length > 0 && (
        <div className="space-y-3">
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[80%] rounded-[var(--ark-r-lg)] bg-[var(--ark-primary-soft)] px-3 py-2 text-sm text-[var(--ark-primary-soft-ink)]">
                  {turn.content}
                </p>
              </div>
            ) : (
              <Panel key={i} flush>
                {turn.html ? (
                  <PageReply
                    html={turn.html}
                    funnels={funnels}
                    applyingTo={applyingTo}
                    onApply={(id) => applyToSite(turn.html!, id)}
                  />
                ) : (
                  /* Prose, rendered as text. A model's prose is not markup and
                     must never be treated as any. */
                  <p className="px-4 py-3 text-sm whitespace-pre-wrap text-[var(--ark-ink)]">
                    {turn.content}
                  </p>
                )}
              </Panel>
            ),
          )}
          <div ref={endRef} />
        </div>
      )}

      {busy && (
        <Panel>
          <p className="flex items-center gap-2 text-sm text-[var(--ark-ink-3)]">
            <Spinner />
            {current?.htmlOutput
              ? "Writing the page — this takes a few seconds…"
              : "Thinking…"}
          </p>
        </Panel>
      )}

      {applied && (
        <p className="rounded-[var(--ark-r-md)] bg-[var(--ark-ok-soft)] px-3 py-2 text-sm text-[var(--ark-ok-ink)]">
          {applied}
        </p>
      )}
      {error && (
        <p className="rounded-[var(--ark-r-md)] bg-[var(--ark-danger-soft)] px-3 py-2 text-sm text-[var(--ark-danger-ink)]">
          {error}
        </p>
      )}

      {/* The prompt. */}
      <Panel>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift-Enter makes a new line. A description of a
            // business runs to a few lines, so the newline has to stay
            // reachable.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={3}
          placeholder={
            job === "page"
              ? "A two-bedroom flat in Pune, ₹45 lakh, near Hinjewadi IT park. Site visits on weekends."
              : job === "chatbot"
                ? "A dental clinic in Nagpur. Book appointments and answer questions about treatments and timings."
                : job === "image"
                  ? "A photo for the top of a landing page for a yoga studio in Jaipur."
                  : "Three WhatsApp messages following up with someone who enquired about a flat and did not reply."
          }
          className="input resize-y"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-[var(--ark-ink-muted)]">
            {turns.length > 0
              ? "Ask for changes and it will revise what it just made."
              : "Enter to send, Shift+Enter for a new line."}
          </p>
          <div className="flex items-center gap-2">
            {turns.length > 0 && (
              <Button tone="ghost" size="sm" onClick={() => setTurns([])}>
                Start over
              </Button>
            )}
            <Button
              tone="primary"
              size="sm"
              busy={busy}
              disabled={!prompt.trim()}
              onClick={() => void send()}
            >
              {turns.length > 0 ? "Send" : "Generate"}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/*
A reply that is a page.

Shown as a real preview in an iframe rather than as code, because the thing
being judged is how it looks on a phone. The iframe is sandboxed with nothing
granted — no scripts, no same-origin — so even though the server already
stripped script, the preview cannot execute anything either. Two independent
reasons it is inert, because this markup was written by a model from a prompt
somebody typed.
*/
function PageReply({
  html,
  funnels,
  applyingTo,
  onApply,
}: {
  html: string;
  funnels: Funnel[];
  applyingTo: string;
  onApply: (funnelId: string) => void;
}) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ark-line)] px-4 py-2">
        <div className="flex items-center gap-2">
          <Badge tone="primary">Landing page</Badge>
          <span className="text-xs text-[var(--ark-ink-3)]">
            Sanitized — scripts removed
          </span>
        </div>
        <Button tone="ghost" size="sm" onClick={() => setShowCode((v) => !v)}>
          {showCode ? "Preview" : "View HTML"}
        </Button>
      </div>

      {showCode ? (
        <pre className="max-h-80 overflow-auto bg-[var(--ark-surface-2)] px-4 py-3 text-xs text-[var(--ark-ink-2)]">
          {html}
        </pre>
      ) : (
        /* Phone width, because that is what it will be read at. */
        <div className="flex justify-center bg-[var(--ark-surface-2)] py-4">
          <iframe
            title="Generated page preview"
            srcDoc={html}
            sandbox=""
            className="h-[420px] w-[360px] rounded-[var(--ark-r-md)] border border-[var(--ark-line)] bg-white"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ark-line)] px-4 py-2.5">
        {funnels.length === 0 ? (
          <p className="text-xs text-[var(--ark-ink-3)]">
            Create a site first, then this can be saved onto it.
          </p>
        ) : (
          <>
            <span className="text-xs text-[var(--ark-ink-3)]">Save as a draft on:</span>
            {funnels.slice(0, 4).map((f) => (
              <Button
                key={f._id}
                tone="neutral"
                size="sm"
                busy={applyingTo === f._id}
                onClick={() => onApply(f._id)}
              >
                {f.name}
              </Button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
