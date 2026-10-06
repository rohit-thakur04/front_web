"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import type { EmailTemplate, Pipeline, Stage, WabaTemplate } from "@/lib/types";

type Channel = "email" | "whatsapp";

interface Audience {
  cardIds: string[];
  total: number;
  unreachable: number;
}

interface BatchResult {
  sent: number;
  suppressed: number;
  failed: number;
  errors: string[];
}

interface CostEstimate {
  category: string;
  ratePaise: number;
  estimatePaise: number;
}

/** One request per 50 recipients, matching the server's own batch ceiling. */
const BATCH = 50;

function rupees(paise: number): string {
  const r = paise / 100;
  if (r === 0) return "Rs 0";
  return r < 10 ? `Rs ${r.toFixed(2)}` : `Rs ${Math.round(r).toLocaleString("en-IN")}`;
}

/*
Broadcasts: one template to many contacts.

Built as a review screen rather than a form. Nothing else in this product can
reach four hundred people in one click, so the page's job is to make the
audience, the exclusions and the cost legible before the button is pressed — and
then to be honest about what happened, including the sends it suppressed.
*/
export default function BroadcastsPage() {
  const [channel, setChannel] = useState<Channel>("email");

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");

  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [wabaTemplates, setWabaTemplates] = useState<WabaTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");

  const [audience, setAudience] = useState<Audience | null>(null);
  const [cost, setCost] = useState<CostEstimate | null>(null);

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState("");
  const cancelled = useRef(false);

  useEffect(() => {
    async function run() {
      try {
        setPipelines(await api<Pipeline[]>("/pipelines"));
      } catch {
        // The audience then means "everyone", which is a valid broadcast.
      }
      try {
        setEmailTemplates(await api<EmailTemplate[]>("/templates"));
      } catch {
        /* the email channel simply offers nothing to send */
      }
      try {
        setWabaTemplates(await api<WabaTemplate[]>("/waba"));
      } catch {
        /* likewise for WhatsApp */
      }
    }
    void run();
  }, []);

  // Wrapped like the other pages so the effect body does not set state
  // synchronously; clearing the stage list when no pipeline is chosen happens
  // inside the same async path for that reason.
  useEffect(() => {
    async function run() {
      if (!pipelineId) {
        setStages([]);
        setStageId("");
        return;
      }
      try {
        setStages(await api<Stage[]>(`/pipelines/${pipelineId}/stages`));
      } catch {
        setStages([]);
      }
    }
    void run();
  }, [pipelineId]);

  /*
   * Only approved WhatsApp templates can be broadcast — Meta refuses the rest.
   * Filtered here as well as refused by the server, so the list never offers
   * something that cannot work.
   */
  const sendableWaba = useMemo(
    () => wabaTemplates.filter((t) => t.status === "APPROVED"),
    [wabaTemplates],
  );

  // Resolving the audience is a deliberate step, not a live recount: the ids
  // previewed are the ids sent to, so contacts arriving in between cannot join
  // a broadcast somebody already approved.
  async function resolveAudience() {
    setError("");
    setResult(null);
    setCost(null);
    try {
      const a = await api<Audience>("/broadcasts/audience", {
        method: "POST",
        body: { channel, pipelineId, stageId },
      });
      setAudience(a);

      if (channel === "whatsapp" && templateId && a.cardIds.length > 0) {
        setCost(
          await api<CostEstimate>(
            `/broadcasts/cost/${templateId}?recipients=${a.cardIds.length}`,
          ),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not work out the audience");
    }
  }

  async function send() {
    if (!audience?.cardIds.length || !templateId) return;

    const total = audience.cardIds.length;
    const what =
      channel === "whatsapp"
        ? `Send this WhatsApp template to ${total} contact${total === 1 ? "" : "s"}?${
            cost ? ` Meta will charge you about ${rupees(cost.estimatePaise)}.` : ""
          }`
        : `Send this email to ${total} contact${total === 1 ? "" : "s"}?`;
    if (!window.confirm(what)) return;

    setSending(true);
    setError("");
    cancelled.current = false;
    const acc: BatchResult = { sent: 0, suppressed: 0, failed: 0, errors: [] };
    setProgress({ done: 0, total });

    try {
      for (let i = 0; i < total; i += BATCH) {
        if (cancelled.current) break;

        const batch = audience.cardIds.slice(i, i + BATCH);
        const res = await api<BatchResult>("/broadcasts/send", {
          method: "POST",
          body: { channel, templateId, cardIds: batch },
        });

        acc.sent += res.sent;
        acc.suppressed += res.suppressed;
        acc.failed += res.failed;
        // Capped the same way the server caps its own: enough to diagnose,
        // not a wall of text.
        acc.errors = [...acc.errors, ...res.errors].slice(0, 10);
        setProgress({ done: Math.min(i + BATCH, total), total });
        setResult({ ...acc });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The broadcast stopped partway");
    } finally {
      setSending(false);
    }
  }

  const templates =
    channel === "email"
      ? emailTemplates.map((t) => ({ id: t._id, label: t.name || t.subject }))
      : sendableWaba.map((t) => ({ id: t._id, label: t.name }));

  const ready = Boolean(audience?.cardIds.length && templateId);

  return (
    <div className="mx-auto max-w-[900px] p-6">
      <PageHeader
        title="Broadcast"
        subtitle="Send one message to many contacts, by email or WhatsApp"
      />

      {/* Channel. A segmented control rather than a dropdown: there are two
          choices and they change what every field below means. */}
      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {(
          [
            ["email", "Email"],
            ["whatsapp", "WhatsApp"],
          ] as [Channel, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setChannel(key);
              // The audience depends on the channel — email needs an address,
              // WhatsApp a number — so a stale count would be wrong.
              setAudience(null);
              setTemplateId("");
              setCost(null);
              setResult(null);
            }}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              channel === key
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Who gets it</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Pipeline</label>
              <select
                value={pipelineId}
                onChange={(e) => {
                  setPipelineId(e.target.value);
                  setAudience(null);
                }}
                className="input"
              >
                <option value="">Every contact</option>
                {pipelines.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Stage</label>
              <select
                value={stageId}
                onChange={(e) => {
                  setStageId(e.target.value);
                  setAudience(null);
                }}
                disabled={!pipelineId}
                className="input disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">Every stage</option>
                {stages.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={resolveAudience}
            disabled={sending}
            className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Work out the audience
          </button>

          {audience && (
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <p>
                <span className="text-lg font-semibold">{audience.cardIds.length}</span>{" "}
                of {audience.total} contact{audience.total === 1 ? "" : "s"} will be
                messaged.
              </p>
              {audience.unreachable > 0 && (
                /* Named rather than quietly dropped: "it went to 340 of my 400"
                   is the first question asked afterwards. */
                <p className="mt-0.5 text-xs text-amber-700">
                  {audience.unreachable} skipped — no{" "}
                  {channel === "whatsapp" ? "phone number" : "email address"} on record.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">What to send</h2>
          <select
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setCost(null);
            }}
            className="input"
          >
            <option value="">— choose a template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          {channel === "whatsapp" && (
            <p className="mt-1.5 text-xs text-slate-500">
              Only approved templates can be broadcast — Meta refuses the rest.
              {wabaTemplates.length > 0 && sendableWaba.length === 0 && (
                <span className="text-amber-700">
                  {" "}
                  None of yours are approved yet.
                </span>
              )}
            </p>
          )}

          {cost && (
            <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
              <span className="font-semibold">
                About {rupees(cost.estimatePaise)}
              </span>{" "}
              for {audience?.cardIds.length} message
              {audience?.cardIds.length === 1 ? "" : "s"} · {cost.category.toLowerCase()} at{" "}
              {rupees(cost.ratePaise)} each.
              <span className="block text-xs text-blue-800">
                Estimated from Meta&apos;s Indian rates. Meta bills you directly.
              </span>
            </div>
          )}
        </section>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        {progress && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {sending ? "Sending…" : "Finished"} {progress.done} of {progress.total}
              </span>
              {sending && (
                <button
                  onClick={() => {
                    cancelled.current = true;
                  }}
                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                >
                  Stop
                </button>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-[width] duration-300"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>

            {result && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
                  {result.sent} sent
                </span>
                {result.suppressed > 0 && (
                  /* Suppression is not a failure and not a send. Shown as its
                     own number, because a total that quietly folded it into
                     either one would be the misleading figure. */
                  <span
                    className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700"
                    title="Already had this message today, or WhatsApp is in dry-run"
                  >
                    {result.suppressed} skipped as duplicates
                  </span>
                )}
                {result.failed > 0 && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-800">
                    {result.failed} failed
                  </span>
                )}
              </div>
            )}

            {result && result.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-rose-700">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={send}
            disabled={!ready || sending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            {sending
              ? "Sending…"
              : `Send to ${audience?.cardIds.length ?? 0} contact${
                  audience?.cardIds.length === 1 ? "" : "s"
                }`}
          </button>
          {!ready && (
            <span className="text-xs text-slate-500">
              Work out the audience and choose a template first.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
