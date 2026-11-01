"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui";

interface AssistantStatus {
  allowed: boolean;
  code: string;
  message: string;
  admin: boolean;
  plan?: { id: string; name: string };
  models: { id: string; label: string }[];
  features: { crm: boolean; actions: boolean; knowledgeBase: boolean; documentUpload: boolean };
  limits?: {
    monthlyMessageLimit: number;
    monthlyTokenLimit: number;
    maxConversations: number;
    maxConcurrent: number;
    maxStorageMB: number;
    hasBudget: boolean;
  };
  usage?: {
    periodStart: string;
    periodEnd: string;
    messagesUsed: number;
    tokensUsed: number;
    messagesRemaining: number;
    tokensRemaining: number;
    conversations: number;
    budgetUsedPct: number;
  };
  upgradePlans?: string[];
  upgradeRequested?: boolean;
}

interface ChatAction {
  type: "move_contact" | "add_tag";
  summary: string;
  status: "proposed" | "done" | "failed";
  detail?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  model?: string;
  action?: ChatAction | null;
  at: string;
}

interface Conversation {
  _id: string;
  title: string;
  updatedAt: string;
  messages?: ChatMessage[];
}

const num = (n: number) => n.toLocaleString("en-IN");
const date = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/*
 * The in-app AI assistant.
 *
 * Everything shown here comes from the server's own decision: /assistant/status
 * says whether this account may use it and why not, and every message is checked
 * again on the server against the plan, subscription and quota. Hiding the chat
 * here is presentation, not the gate.
 */
export default function AssistantPage() {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api<AssistantStatus>("/assistant/status"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the assistant");
    }
  }, []);

  useEffect(() => {
    async function run() {
      await loadStatus();
    }
    run();
  }, [loadStatus]);

  return (
    <div className="p-6">
      <PageHeader
        title="AI Assistant"
        subtitle="Ask about your contacts, pipeline and forms."
      />
      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!status ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : status.allowed ? (
        <Chat status={status} onUsageChange={loadStatus} />
      ) : (
        <Locked status={status} onRequested={loadStatus} />
      )}
    </div>
  );
}

function Locked({ status, onRequested }: { status: AssistantStatus; onRequested: () => void }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const upgradable = status.code === "no_plan" || status.code === "not_in_plan";

  async function request() {
    setSending(true);
    setError("");
    try {
      await api("/assistant/upgrade-requests", { method: "POST", body: {} });
      onRequested();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the request");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-2xl">
        🔒
      </div>
      <p className="text-base font-semibold">{status.message}</p>
      {upgradable && (
        <>
          {status.upgradePlans && status.upgradePlans.length > 0 ? (
            <p className="mt-2 text-sm text-slate-600">
              Included in: <span className="font-medium">{status.upgradePlans.join(", ")}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No plan includes it yet — ask your administrator.</p>
          )}
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          {status.upgradeRequested ? (
            <p className="mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Upgrade requested — your administrator will be in touch.
            </p>
          ) : (
            <button
              onClick={request}
              disabled={sending}
              className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Request upgrade"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function UsageBar({ label, used, remaining }: { label: string; used: number; remaining: number }) {
  const unlimited = remaining < 0;
  const total = used + Math.max(remaining, 0);
  const pct = unlimited || total === 0 ? 0 : Math.min(100, (used / total) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium tabular-nums">
          {unlimited ? `${num(used)} used` : `${num(remaining)} of ${num(total)} left`}
        </span>
      </div>
      {!unlimited && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${pct >= 90 ? "bg-rose-500" : pct >= 75 ? "bg-amber-500" : "bg-blue-600"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Chat({ status, onUsageChange }: { status: AssistantStatus; onUsageChange: () => void }) {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [text, setText] = useState("");
  const [model, setModel] = useState(status.models[0]?.id ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [limitHit, setLimitHit] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Conversation[]>("/assistant/conversations").then(setConvos).catch(() => setConvos([]));
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages?.length]);

  async function open(c: Conversation) {
    setError("");
    try {
      setActive(await api<Conversation>(`/assistant/conversations/${c._id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the conversation");
    }
  }

  async function remove(c: Conversation) {
    if (!window.confirm(`Delete "${c.title}"?`)) return;
    await api(`/assistant/conversations/${c._id}`, { method: "DELETE" }).catch(() => undefined);
    setConvos((prev) => prev.filter((x) => x._id !== c._id));
    if (active?._id === c._id) setActive(null);
    onUsageChange();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    setSending(true);
    setError("");
    // Shown straight away; replaced by the saved conversation on reply.
    const optimistic: ChatMessage = { role: "user", content: message, at: new Date().toISOString() };
    setActive((a) => ({ ...(a ?? { _id: "", title: message, updatedAt: "" }), messages: [...(a?.messages ?? []), optimistic] }));
    setText("");
    try {
      const res = await api<{ conversation: Conversation; message: ChatMessage }>("/assistant/messages", {
        method: "POST",
        body: { conversationId: active?._id || "", message, model },
      });
      setActive((a) => ({ ...res.conversation, messages: [...(a?.messages ?? []), res.message] }));
      setConvos((prev) => [res.conversation, ...prev.filter((c) => c._id !== res.conversation._id)]);
    } catch (err) {
      // Put the message back so nothing typed is lost.
      setActive((a) => (a ? { ...a, messages: (a.messages ?? []).slice(0, -1) } : a));
      setText(message);
      setError(err instanceof Error ? err.message : "The assistant couldn't answer");
      setLimitHit(err instanceof ApiError && err.detail?.upgrade === true);
    } finally {
      setSending(false);
      onUsageChange();
    }
  }

  async function requestUpgrade() {
    try {
      await api("/assistant/upgrade-requests", { method: "POST", body: {} });
      setLimitHit(false);
      setError("Upgrade requested — your administrator will be in touch.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the request");
    }
  }

  async function confirm(index: number) {
    if (!active) return;
    try {
      const action = await api<ChatAction>(
        `/assistant/conversations/${active._id}/messages/${index}/confirm`,
        { method: "POST" },
      );
      setActive((a) =>
        a ? { ...a, messages: (a.messages ?? []).map((m, i) => (i === index ? { ...m, action } : m)) } : a,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply the change");
    }
  }

  const u = status.usage;
  const l = status.limits;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-4">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold">
            {status.admin ? "Platform admin — not metered" : `${status.plan?.name ?? "Your plan"}`}
          </p>
          {u && !status.admin && (
            <>
              <UsageBar label="Messages" used={u.messagesUsed} remaining={u.messagesRemaining} />
              <UsageBar label="Tokens" used={u.tokensUsed} remaining={u.tokensRemaining} />
              {u.budgetUsedPct >= 0 && (
                <UsageBar label="AI allowance" used={Math.round(u.budgetUsedPct)} remaining={Math.max(0, 100 - Math.round(u.budgetUsedPct))} />
              )}
              <p className="text-xs text-slate-500">
                Renews {date(u.periodEnd)}.
                {l && l.maxConversations > 0 && ` ${u.conversations} of ${l.maxConversations} conversations saved.`}
              </p>
            </>
          )}
          <p className="text-xs text-slate-500">
            {status.features.crm ? "Can read your CRM." : "Can't see your CRM data on this plan."}
            {status.features.actions && " Can suggest changes for you to confirm."}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2">
          <button
            onClick={() => setActive(null)}
            className="mb-1 w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            + New conversation
          </button>
          {convos.map((c) => (
            <div
              key={c._id}
              className={`group flex items-center rounded-lg ${active?._id === c._id ? "bg-slate-100" : "hover:bg-slate-50"}`}
            >
              <button onClick={() => open(c)} className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm">
                {c.title}
              </button>
              <button
                onClick={() => remove(c)}
                aria-label={`Delete ${c.title}`}
                className="px-2 text-xs text-slate-400 opacity-0 hover:text-rose-600 group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-h-[60vh] flex-col rounded-xl border border-slate-200 bg-white">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {!active?.messages?.length && (
            <div className="py-12 text-center text-sm text-slate-500">
              <p className="font-medium text-slate-700">What would you like to know?</p>
              <p className="mt-1">
                {status.features.crm
                  ? "e.g. “How many leads came in this week?” or “Which deals are in Negotiation?”"
                  : "e.g. “Write a follow-up message for a lead who went quiet.”"}
              </p>
            </div>
          )}
          {active?.messages?.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                  m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-900"
                }`}
              >
                {m.content}
                {m.action && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5 text-slate-900">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Suggested change</p>
                    <p className="mt-0.5">{m.action.summary}</p>
                    {m.action.status === "proposed" ? (
                      <button
                        onClick={() => confirm(i)}
                        className="mt-2 rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Confirm
                      </button>
                    ) : (
                      <p className={`mt-1 text-xs ${m.action.status === "done" ? "text-emerald-700" : "text-rose-600"}`}>
                        {m.action.status === "done" ? "✓ " : "✕ "}
                        {m.action.detail}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && <p className="text-sm text-slate-400">Thinking…</p>}
          <div ref={bottom} />
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
            {limitHit && !status.admin && (
              <button onClick={requestUpgrade} className="ml-2 font-medium underline">
                Request upgrade
              </button>
            )}
          </div>
        )}

        <form onSubmit={send} className="flex items-end gap-2 border-t border-slate-200 p-3">
          {status.models.length > 1 && (
            <select value={model} onChange={(e) => setModel(e.target.value)} className="input w-auto text-xs" aria-label="AI model">
              {status.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Ask anything…"
            className="input min-h-[40px] flex-1 resize-none"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
