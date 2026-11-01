"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { MultiSelect } from "@/components/leadgen/MultiSelect";
import { PHONE_PATTERN, PHONE_TITLE, sanitizePhoneInput } from "@/lib/phone";
import { isContentField } from "@/lib/formFields";
import type { FormField, FormStyles } from "@/lib/types";

// The public-facing form page. It sits outside the (app) route group on purpose:
// the people filling this in are leads, not users, so there is no sidebar, no
// auth guard and nothing about the tenant on the page.

interface PublicForm {
  _id: string;
  name: string;
  fields: FormField[];
  styles: FormStyles;
  theme: string;
  /**
   * "classic" lists every question on one page; "stepped" asks one at a time.
   * Always set by the server, which normalises an unset value to classic.
   */
  layout: "classic" | "stepped";
}


export default function PublicFormPage() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<PublicForm | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  /*
   * Honeypot. Hidden from people, left empty by them; a bot that fills every
   * input it finds fills this one too and the server discards the submission.
   *
   * Kept in state rather than read from the DOM on submit so it travels with the
   * request like any other field, and so nothing has to query for it.
   */
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  /*
   * Which step a stepped form is on.
   *
   * Stepped forms ask one question at a time. On a phone — where most of these
   * are filled in — a six-question form is a wall of inputs somebody abandons,
   * while one question with a progress bar gets finished. The fields and the
   * submitted payload are identical either way, so a form can be switched
   * after it has been shared without invalidating anything already collected.
   */
  const [step, setStep] = useState(0);
  /*
   * Whether this step has been blocked.
   *
   * Set when Next is pressed on an unanswered required question, cleared on
   * every step change. Not shown before that: nagging somebody about a field
   * they have not filled in yet reads as the form arguing with them.
   */
  const [blocked, setBlocked] = useState(false);

  const stepped = form?.layout === "stepped";

  /*
   * One step per question, with any content blocks above it carried along.
   *
   * A heading or paragraph is not a question and cannot be a step of its own —
   * that would make a visitor press Next to get past a sentence. Grouping each
   * run of content with the question that follows it keeps the author's
   * intended order while giving every step something to answer.
   *
   * Trailing content with no question after it becomes a final step, so a
   * closing note is not silently dropped.
   */
  const groups = useMemo(() => {
    if (!form) return [];
    const out: { content: typeof form.fields; question?: (typeof form.fields)[number] }[] = [];
    let pending: typeof form.fields = [];
    for (const f of form.fields) {
      if (isContentField(f)) {
        pending.push(f);
        continue;
      }
      out.push({ content: pending, question: f });
      pending = [];
    }
    if (pending.length > 0) out.push({ content: pending });
    return out;
  }, [form]);

  const lastStep = Math.max(groups.length - 1, 0);
  const current = groups[Math.min(step, lastStep)];

  /*
   * Whether this step may be left.
   *
   * Client-side only: the server validates every answer on submit regardless,
   * so this is about not letting somebody reach the end and be sent back, not
   * about trust.
   */
  const canAdvance =
    !current?.question ||
    !current.question.required ||
    (values[current.question.id] ?? "").trim() !== "";

  useEffect(() => {
    async function run() {
      try {
        setForm(await api<PublicForm>(`/public/forms/${id}`));
      } catch {
        setError("This form isn't available.");
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      // Where the visitor came from. A funnel page adds funnel/page to this
      // form's URL along with its own campaign params; a form link shared on its
      // own carries whatever utm_* was put on it.
      const q = new URLSearchParams(window.location.search);
      await api(`/public/forms/${id}/submit`, {
        method: "POST",
        body: {
          answers: values,
          website: honeypot,
          source: {
            funnel: q.get("funnel") ?? "",
            page: q.get("page") ?? "",
            utmSource: q.get("utm_source") ?? "",
            utmMedium: q.get("utm_medium") ?? "",
            utmCampaign: q.get("utm_campaign") ?? "",
          },
        },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <Centered>Loading…</Centered>;
  }
  if (!form) {
    return <Centered>{error || "This form isn't available."}</Centered>;
  }

  const s = form.styles;
  const radius = s.cornerRadius ?? 8;

  // Every colour gets an explicit default rather than `undefined`.
  //
  // This page is public: the tenant designs it, and a visitor's own OS theme must
  // not repaint it. Leaving a colour undefined means "inherit", and the app's
  // html.dark rules then supply near-white text on the white card and a navy
  // background on every input — which is exactly what went wrong.
  const c = {
    page: s.pageBackground || "#f1f5f9",
    card: s.formCard || "#ffffff",
    text: s.textColor || "#0f172a",
    inputBg: s.inputBackground || "#ffffff",
    inputText: s.inputText || "#0f172a",
    inputBorder: "#cbd5e1",
    button: s.buttonBackground || "#2563eb",
    buttonText: s.buttonText || "#ffffff",
  };

  // Scoped overrides. globals.css marks some dark rules !important, so inline
  // styles alone can't win; scoping by data attribute keeps this page correct
  // without touching the app's theme anywhere else.
  const scopedCss = `
    [data-public-form] input:not([type="checkbox"]):not([type="radio"]),
    [data-public-form] select,
    [data-public-form] textarea {
      background-color: ${c.inputBg} !important;
      color: ${c.inputText} !important;
      border-color: ${c.inputBorder} !important;
    }
    [data-public-form] ::placeholder { color: #94a3b8 !important; opacity: 1; }
    [data-public-form] [data-ms-panel] {
      background-color: #ffffff !important;
      border-color: #e2e8f0 !important;
      color: #0f172a !important;
    }
    [data-public-form] [data-ms-panel] label:hover { background-color: #f8fafc !important; }
  `;

  const shell = (children: React.ReactNode) => (
    <div
      data-public-form
      className="flex min-h-screen items-center justify-center px-4 py-10"
      // colorScheme keeps browser-drawn UI — the date picker, autofill, scrollbars
      // — light, so they match the card instead of the visitor's OS preference.
      style={{ background: c.page, colorScheme: "light" }}
    >
      <style>{scopedCss}</style>
      <div
        className="w-full max-w-lg p-8 shadow-xl"
        style={{ background: c.card, color: c.text, borderRadius: radius + 8 }}
      >
        {children}
      </div>
    </div>
  );

  if (done) {
    return shell(
      <div className="py-6 text-center">
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: c.button, color: c.buttonText }}
        >
          ✓
        </div>
        <p className="text-lg font-semibold">Thank you</p>
        <p className="mt-1.5 text-sm opacity-60">Your response has been recorded.</p>
      </div>,
    );
  }

  return shell(
    <>
      {form.name && (
        <h1 className="mb-6 text-xl font-semibold tracking-tight">{form.name}</h1>
      )}

      <form onSubmit={submit}>
        {/* Hidden with CSS rather than type="hidden": a bot reading the markup
            skips an input it can tell is hidden, and type="hidden" announces
            itself. aria-hidden and tabIndex keep it away from screen readers and
            the tab order, so nobody using the form can reach it by accident.
            autoComplete="off" stops a browser helpfully filling it in. */}
        <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="website">Leave this field empty</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>
        {stepped ? (
          <SteppedFields
            groups={groups}
            step={step}
            values={values}
            onChange={(id, v) => {
              // Typing an answer clears the complaint about not having one.
              if (blocked) setBlocked(false);
              setValues((prev) => ({ ...prev, [id]: v }));
            }}
            blockedLabel={blocked ? current?.question?.label : undefined}
            styles={s}
            colors={c}
          />
        ) : (
          form.fields.map((f) =>
          // A content block is markup, not a question: no label, no asterisk,
          // and nothing added to `values`, so it never reaches the submission.
          isContentField(f) ? (
            <div
              key={f.id}
              className="mb-5"
              // Safe on the sanitize-on-write invariant: the server runs
              // SanitizeHTML on every save, so what the API serves here has
              // already had scripts, styles and iframes removed.
              dangerouslySetInnerHTML={{ __html: f.html ?? "" }}
            />
          ) : (
            <div key={f.id} className="mb-5">
              <label className="mb-1.5 block text-sm font-medium">
                {f.label}
                {f.required && <span style={{ color: "#e11d48" }}> *</span>}
              </label>
              <Field
                field={f}
                value={values[f.id] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))}
                styles={s}
                colors={c}
              />
            </div>
            ),
          )
        )}

        {error && (
          <p
            className="mb-4 rounded-lg px-3 py-2.5 text-sm"
            style={{ background: "#fef2f2", color: "#b91c1c" }}
          >
            {error}
          </p>
        )}

        {stepped && groups.length > 1 ? (
          <div className="mt-1">
            {/* Progress. A stepped form hides how much is left, which is the
                one thing it costs a visitor over the single-page version —
                so it has to be shown rather than implied. */}
            <div className="mb-3 flex items-center gap-2">
              <div
                className="h-1 flex-1 overflow-hidden rounded-full"
                style={{ background: c.inputBorder }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${((step + 1) / groups.length) * 100}%`,
                    background: c.button,
                  }}
                />
              </div>
              <span className="text-xs tabular-nums opacity-60">
                {step + 1} / {groups.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setBlocked(false);
                    setStep((n) => Math.max(n - 1, 0));
                  }}
                  className="py-3 px-4 text-sm font-medium transition hover:opacity-80"
                  style={{ borderRadius: radius, border: `1px solid ${c.inputBorder}` }}
                >
                  Back
                </button>
              )}

              {step < lastStep ? (
                /*
                  type="button", deliberately.

                  A submit button here would end the form on the first question
                  — and because the browser also submits on Enter, a visitor
                  typing their name and pressing Enter would have sent a
                  one-field enquiry.
                */
                <button
                  type="button"
                  /*
                    Enabled even when it will not advance, deliberately.

                    It was disabled, which meant pressing it on an unanswered
                    required question did nothing and said nothing — and with
                    one field on screen there was no other field to compare
                    against and no way to guess what was wrong. A control that
                    explains the obstacle beats one that cannot be pressed.
                  */
                  onClick={() => {
                    if (!canAdvance) {
                      setBlocked(true);
                      return;
                    }
                    setBlocked(false);
                    setStep((n) => Math.min(n + 1, lastStep));
                  }}
                  className="flex-1 py-3 text-sm font-semibold uppercase tracking-wide transition hover:opacity-90"
                  style={{ background: c.button, color: c.buttonText, borderRadius: radius }}
                >
                  Next
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 py-3 text-sm font-semibold uppercase tracking-wide transition hover:opacity-90 disabled:opacity-60"
                  style={{ background: c.button, color: c.buttonText, borderRadius: radius }}
                >
                  {sending ? "Sending…" : s.submitLabel || "Submit"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="submit"
            disabled={sending}
            className="mt-1 w-full py-3 text-sm font-semibold uppercase tracking-wide transition hover:opacity-90 disabled:opacity-60"
            style={{ background: c.button, color: c.buttonText, borderRadius: radius }}
          >
            {sending ? "Sending…" : s.submitLabel || "Submit"}
          </button>
        )}
      </form>
    </>,
  );
}

/*
SteppedFields renders the current step only.

Every other step is unmounted rather than hidden, so a visitor cannot tab into
a question that is not on screen — which is what display:none would allow and
is a genuine trap for anybody navigating by keyboard.

The answers live in the parent, so going Back and forward again shows what was
already typed. Nothing is submitted until the last step.
*/
function SteppedFields({
  groups,
  step,
  values,
  onChange,
  blockedLabel,
  styles,
  colors,
}: {
  groups: { content: PublicForm["fields"]; question?: PublicForm["fields"][number] }[];
  step: number;
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  /** The question's own label when Next was pressed without an answer. */
  blockedLabel?: string;
  styles: PublicForm["styles"];
  colors: { inputBg: string; inputText: string; inputBorder: string };
}) {
  const group = groups[Math.min(step, Math.max(groups.length - 1, 0))];
  if (!group) return null;

  return (
    <div className="mb-5">
      {group.content.map((f) => (
        <div
          key={f.id}
          className="mb-5"
          // Same invariant as the single-page renderer: the server sanitizes
          // every save, so this markup has already had scripts removed.
          dangerouslySetInnerHTML={{ __html: f.html ?? "" }}
        />
      ))}

      {group.question && (
        <div>
          {/* One question gets room to be a question: larger than the stacked
              version, because it is the only thing on screen. */}
          <label className="mb-2 block text-base font-medium">
            {group.question.label}
            {group.question.required && <span style={{ color: "#e11d48" }}> *</span>}
          </label>
          <Field
            field={group.question}
            value={values[group.question.id] ?? ""}
            onChange={(v) => onChange(group.question!.id, v)}
            styles={styles}
            colors={colors}
          />
          {/* Reserved height, so showing or clearing this never moves the
              button below it. A control that shifts between mousedown and
              mouseup swallows the click entirely. */}
          <p
            className="mt-1.5 min-h-[20px] text-sm"
            role={blockedLabel ? "alert" : undefined}
            style={{ color: "#e11d48" }}
          >
            {blockedLabel ? `${blockedLabel} is required.` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm text-slate-500">
      {children}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
  styles,
  colors,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
  styles: FormStyles;
  colors: { inputBg: string; inputText: string; inputBorder: string };
}) {
  // Colours are inline, and the border is too: border-slate-300 is one of the
  // utilities globals.css overrides with !important under html.dark, so a class
  // here would be repainted by the visitor's theme.
  const inputStyle = {
    background: colors.inputBg,
    color: colors.inputText,
    border: `1px solid ${colors.inputBorder}`,
    borderRadius: styles.cornerRadius ?? 8,
  } as const;
  const base = "w-full px-3 py-2.5 text-sm outline-none";
  const options = field.options ?? [];

  switch (field.type) {
    case "multi_line":
      return (
        <textarea
          required={field.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={`${base} min-h-20`}
          style={inputStyle}
        />
      );
    case "dob":
      return (
        <input
          type="date"
          required={field.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={base}
          style={inputStyle}
        />
      );
    case "email":
      return (
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required={field.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={base}
          style={inputStyle}
        />
      );
    case "phone":
      return (
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          pattern={PHONE_PATTERN}
          title={PHONE_TITLE}
          required={field.required}
          value={value}
          // Filtered here rather than only on submit, so a stranger filling this
          // in sees immediately that letters aren't accepted.
          onChange={(e) => onChange(sanitizePhoneInput(e.target.value))}
          placeholder={field.placeholder}
          className={base}
          style={inputStyle}
        />
      );
    case "single_dropdown":
      return (
        <select
          required={field.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={base}
          style={inputStyle}
        >
          <option value="" disabled>
            {field.placeholder || "Select an option…"}
          </option>
          {options.map((o, i) => (
            <option key={i} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "radio":
      return (
        <div className="space-y-1.5">
          {options.map((o, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={field.id}
                required={field.required}
                checked={value === o}
                onChange={() => onChange(o)}
              />
              {o}
            </label>
          ))}
        </div>
      );
    case "multi_dropdown": {
      const chosen = value ? value.split(", ") : [];
      return (
        <MultiSelect
          options={options}
          value={chosen}
          onChange={(next) => onChange(next.join(", "))}
          required={field.required}
          placeholder={field.placeholder || "Select options…"}
          className={base}
          style={inputStyle}
        />
      );
    }
    case "checkbox": {
      // Several answers collapse to one comma-joined value, because a
      // submission answer is a single string on the server.
      const selected = value ? value.split(", ") : [];
      return (
        <div className="space-y-1.5">
          {options.map((o, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, o]
                    : selected.filter((x) => x !== o);
                  onChange(next.join(", "));
                }}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    default:
      return (
        <input
          required={field.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={base}
          style={inputStyle}
        />
      );
  }
}
