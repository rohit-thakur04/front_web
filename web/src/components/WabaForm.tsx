"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type {
  Card,
  Pipeline,
  WabaButton,
  WabaCategory,
  WabaHeaderType,
  WabaTemplate,
} from "@/lib/types";

interface Props {
  template?: WabaTemplate;
}

const VARIABLE_SOURCES = [
  { value: "name", label: "Contact name" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "pipelineName", label: "Pipeline name" },
  { value: "custom", label: "Custom (use sample)" },
];

const REJECTION_REASONS = [
  "The template name doesn't describe what the message does.",
  "Variables are used at the very start or end of the body, or sit next to each other.",
  "Sample values don't look like real content, so reviewers can't judge the message.",
  "Promotional content submitted under the UTILITY category — use MARKETING.",
  "The message reads as spam, or promises something the business can't deliver.",
  "A URL in a button doesn't match the business's verified domain.",
];

/** Extract the {{n}} tokens from a body, in order. */
function extractVariables(body: string): number[] {
  const found = [...body.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]);
  return found.map((t) => Number(t));
}

/**
 * Mirrors the server's rule so the user is told before they submit: variables
 * must be numeric and sequential from {{1}} with no gaps.
 */
function validateBody(body: string): string {
  const tokens = [...body.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]);
  if (tokens.length === 0) return "";

  const numbers: number[] = [];
  for (const t of tokens) {
    if (!/^\d+$/.test(t)) return `Variable {{${t}}} must be a number, like {{1}}.`;
    numbers.push(Number(t));
  }

  const highest = Math.max(...numbers);
  const seen = new Set(numbers);
  for (let i = 1; i <= highest; i++) {
    if (!seen.has(i)) {
      return `Variables must run in order with no gaps: {{${i}}} is missing but {{${highest}}} is used.`;
    }
  }
  if (numbers.includes(0)) return "Variable numbering starts at {{1}}.";
  return "";
}

function variableCount(body: string): number {
  const nums = extractVariables(body).filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) : 0;
}

export function WabaForm({ template }: Props) {
  const router = useRouter();

  const [name, setName] = useState(template?.name ?? "");
  const [language, setLanguage] = useState(template?.language ?? "en_US");
  const [category, setCategory] = useState<WabaCategory>(template?.category ?? "MARKETING");
  const [headerType, setHeaderType] = useState<WabaHeaderType>(template?.headerType ?? "NONE");
  const [headerText, setHeaderText] = useState(template?.headerText ?? "");
  const [headerMediaUrl, setHeaderMediaUrl] = useState(template?.headerMediaUrl ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [footer, setFooter] = useState(template?.footer ?? "");
  const [buttons, setButtons] = useState<WabaButton[]>(template?.buttons ?? []);
  const [samples, setSamples] = useState<string[]>(template?.variableSamples ?? []);
  const [varMap, setVarMap] = useState<string[]>(template?.variableMap ?? []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Send-test state
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [testPipelineId, setTestPipelineId] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [testCardId, setTestCardId] = useState("");
  const [testPhone, setTestPhone] = useState("");

  const count = variableCount(body);
  const bodyError = validateBody(body);

  // The sample/mapping arrays are stored sparse and read through these helpers,
  // so editing the body never has to resize them in an effect.
  const sampleAt = (i: number) => samples[i] ?? "";
  // {{1}} defaults to the contact's name.
  const mapAt = (i: number) => varMap[i] || (i === 0 ? "name" : "custom");

  useEffect(() => {
    api<Pipeline[]>("/pipelines")
      .then((list) => {
        setPipelines(list);
        setTestPipelineId(list[0]?._id ?? "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!testPipelineId) return;
    api<Card[]>(`/cards?pipelineId=${testPipelineId}`)
      .then((list) => {
        setCards(list);
        setTestCardId(list[0]?._id ?? "");
      })
      .catch(() => {});
  }, [testPipelineId]);

  // The preview substitutes each variable with its mapped card field when a test
  // card is chosen, and falls back to the sample otherwise.
  const previewBody = useMemo(() => {
    const card = cards.find((c) => c._id === testCardId);
    const pipelineName = pipelines.find((p) => p._id === testPipelineId)?.name ?? "";

    return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, digits) => {
      const i = Number(digits) - 1;
      const source = varMap[i] || (i === 0 ? "name" : "custom");
      if (card) {
        if (source === "name") return card.name || `{{${digits}}}`;
        if (source === "phone") return card.phone || `{{${digits}}}`;
        if (source === "email") return card.email || `{{${digits}}}`;
        if (source === "pipelineName") return pipelineName || `{{${digits}}}`;
      }
      return (samples[i] ?? "").trim() || `{{${digits}}}`;
    });
  }, [body, samples, varMap, cards, testCardId, pipelines, testPipelineId]);

  function payload() {
    return {
      name: name.trim().toLowerCase(),
      language,
      category,
      headerType,
      headerText,
      headerMediaUrl,
      body,
      footer,
      buttons,
      // Always send exactly one entry per variable in the body, so the server
      // never sees a stale slot left over from an earlier edit.
      variableSamples: Array.from({ length: count }, (_, i) => sampleAt(i)),
      variableMap: Array.from({ length: count }, (_, i) => mapAt(i)),
    };
  }

  async function save(): Promise<WabaTemplate | null> {
    setError("");
    setNotice("");
    if (bodyError) {
      setError(bodyError);
      return null;
    }

    setSaving(true);
    try {
      const saved = template
        ? await api<WabaTemplate>(`/waba/${template._id}`, { method: "PUT", body: payload() })
        : await api<WabaTemplate>("/waba", { method: "POST", body: payload() });
      return saved;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save template");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveOnly() {
    const saved = await save();
    if (saved) router.push("/waba");
  }

  async function submitToMeta() {
    const saved = await save();
    if (!saved) return;
    try {
      await api(`/waba/${saved._id}/submit`, { method: "POST" });
      router.push("/waba");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    }
  }

  async function sendTest() {
    // An approved template can't be edited/saved — sending a test must not try to
    // save first, or it would fail and never send. Use its existing id directly.
    // New/draft templates are saved first so there's an id to send from.
    let id = template?._id;
    if (!id || template?.status !== "APPROVED") {
      const saved = await save();
      if (!saved) return;
      id = saved._id;
    }
    setError("");
    setNotice("");
    try {
      const res = await api<{ to: string }>(`/waba/${id}/send-test`, {
        method: "POST",
        body: { cardId: testCardId || undefined, phone: testPhone.trim() || undefined },
      });
      setNotice(`Test message sent to ${res.to}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test send failed");
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">
            {template ? "Edit WhatsApp template" : "New WhatsApp template"}
          </h1>
          {template && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium">
              {template.status}
            </span>
          )}
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Template name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="welcome_offer"
              className="input"
            />
            <p className="mt-1 text-xs text-slate-500">
              Lowercase letters, numbers, and underscores only.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="input"
            >
              <option value="en_US">English (US)</option>
              <option value="en_GB">English (UK)</option>
              <option value="hi">Hindi</option>
              <option value="mr">Marathi</option>
              <option value="gu">Gujarati</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Category</label>
          <div className="flex gap-2">
            {(["MARKETING", "UTILITY"] as WabaCategory[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  category === c
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Header type</label>
            <select
              value={headerType}
              onChange={(e) => setHeaderType(e.target.value as WabaHeaderType)}
              className="input"
            >
              {["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"].map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {headerType === "TEXT" && (
            <div>
              <label className="mb-1 block text-sm font-medium">Header text</label>
              <input
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                className="input"
              />
            </div>
          )}

          {["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType) && (
            <div>
              <label className="mb-1 block text-sm font-medium">Media URL</label>
              <input
                value={headerMediaUrl}
                onChange={(e) => setHeaderMediaUrl(e.target.value)}
                className="input"
              />
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Message body *</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Hi {{1}}, thanks for your interest in {{2}}!"
            className="input font-mono"
          />
          <p className="mt-1 text-xs text-slate-500">
            Use {"{{1}}"}, {"{{2}}"}… numbered in order with no gaps.
          </p>
          {bodyError && <p className="mt-1 text-xs text-red-600">{bodyError}</p>}
        </div>

        {count > 0 && (
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-sm font-medium">Variables</p>
            <div className="space-y-2">
              {Array.from({ length: count }, (_, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{`{{${i + 1}}}`}</span>
                  <select
                    value={mapAt(i)}
                    onChange={(e) => {
                      const next = [...varMap];
                      next[i] = e.target.value;
                      setVarMap(next);
                    }}
                    className="input"
                  >
                    {VARIABLE_SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={sampleAt(i)}
                    onChange={(e) => {
                      const next = [...samples];
                      next[i] = e.target.value;
                      setSamples(next);
                    }}
                    placeholder="Sample value (required)"
                    className="input"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Meta needs a sample for every variable before it will review the template.
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">Footer</label>
          <input
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            maxLength={60}
            className="input"
          />
          <p className="mt-1 text-xs text-slate-500">{footer.length}/60</p>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-sm font-medium">Buttons</p>
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setButtons([
                  ...buttons,
                  {
                    type: e.target.value as WabaButton["type"],
                    text: "",
                    actionType: "URL",
                    url: "",
                    phone: "",
                  },
                ]);
                e.target.value = "";
              }}
              className="ml-auto rounded border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="">Add button…</option>
              <option value="CTA">Call to action</option>
              <option value="QUICK_REPLY">Quick reply</option>
            </select>
          </div>

          {buttons.length === 0 && <p className="text-xs text-slate-500">No buttons.</p>}

          <div className="space-y-2">
            {buttons.map((b, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{b.type}</span>
                <input
                  value={b.text}
                  onChange={(e) => {
                    const next = [...buttons];
                    next[i] = { ...b, text: e.target.value };
                    setButtons(next);
                  }}
                  placeholder="Button text"
                  className="input w-32"
                />

                {b.type === "CTA" && (
                  <>
                    <select
                      value={b.actionType}
                      onChange={(e) => {
                        const next = [...buttons];
                        next[i] = { ...b, actionType: e.target.value };
                        setButtons(next);
                      }}
                      className="input w-24"
                    >
                      <option value="URL">URL</option>
                      <option value="PHONE">Phone</option>
                    </select>
                    <input
                      value={b.actionType === "PHONE" ? b.phone : b.url}
                      onChange={(e) => {
                        const next = [...buttons];
                        next[i] =
                          b.actionType === "PHONE"
                            ? { ...b, phone: e.target.value }
                            : { ...b, url: e.target.value };
                        setButtons(next);
                      }}
                      placeholder={b.actionType === "PHONE" ? "+91…" : "https://…"}
                      className="input flex-1"
                    />
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setButtons(buttons.filter((_, j) => j !== i))}
                  className="text-slate-400 hover:text-red-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium">Send a test</p>
          <div className="flex flex-wrap gap-2">
            <select
              value={testPipelineId}
              onChange={(e) => setTestPipelineId(e.target.value)}
              className="input w-40"
            >
              {pipelines.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={testCardId}
              onChange={(e) => setTestCardId(e.target.value)}
              className="input w-40"
            >
              <option value="">No contact</option>
              {cards.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>

            <input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="Phone (defaults to contact's)"
              className="input flex-1"
            />

            <button
              type="button"
              onClick={sendTest}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Send test
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Picking a contact fills the variables from that contact&apos;s details.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push("/waba")}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveOnly}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={submitToMeta}
            disabled={saving || !!bodyError}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Submit for approval
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div className="space-y-4">
        <div className="sticky top-4">
          <p className="mb-2 text-sm font-medium">Preview</p>

          <div className="rounded-2xl border-4 border-slate-800 bg-[#e5ddd5] p-3">
            <div className="rounded-lg bg-white p-2.5 shadow-sm">
              {headerType === "TEXT" && headerText && (
                <p className="mb-1 text-sm font-semibold">{headerText}</p>
              )}
              {["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType) && (
                <div className="mb-1 flex h-20 items-center justify-center rounded bg-slate-200 text-xs text-slate-500">
                  {headerType}
                </div>
              )}

              <p className="whitespace-pre-wrap text-sm">
                {previewBody || (
                  <span className="text-slate-400">Your message will appear here…</span>
                )}
              </p>

              {footer && <p className="mt-1 text-xs text-slate-400">{footer}</p>}

              <p className="mt-1 text-right text-[10px] text-slate-400">
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>

            {buttons.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {buttons.map((b, i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-white py-1.5 text-center text-sm text-sky-600 shadow-sm"
                  >
                    {b.text || "Button"}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Why was the template rejected?
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
            {REJECTION_REASONS.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
