"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
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
}

// Same rule the builder applies and the server enforces. Permissive by design:
// Indian, +91-prefixed and international numbers all pass.
const PHONE_PATTERN = "[+]?[0-9][0-9 ()-]{6,19}";

export default function PublicFormPage() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<PublicForm | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

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
      await api(`/public/forms/${id}/submit`, {
        method: "POST",
        body: { answers: values },
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

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: s.pageBackground || "#ffffff" }}>
        <div
          className="w-full max-w-lg p-8 text-center shadow-lg"
          style={{ background: s.formCard || "#ffffff", color: s.textColor || undefined, borderRadius: radius + 8 }}
        >
          <p className="text-lg font-semibold">Thank you</p>
          <p className="mt-2 text-sm opacity-70">Your response has been recorded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ background: s.pageBackground || "#ffffff" }}>
      <div
        className="w-full max-w-lg p-8 shadow-lg"
        style={{ background: s.formCard || "#ffffff", color: s.textColor || undefined, borderRadius: radius + 8 }}
      >
        {form.name && <h1 className="mb-5 text-xl font-semibold">{form.name}</h1>}

        <form onSubmit={submit}>
          {form.fields.map((f) => (
            <div key={f.id} className="mb-4">
              <label className="mb-1 block text-sm font-medium">
                {f.label}
                {f.required && <span className="text-rose-500"> *</span>}
              </label>
              <Field
                field={f}
                value={values[f.id] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))}
                styles={s}
              />
            </div>
          ))}

          {error && (
            <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={sending}
            className="mt-2 w-full py-3 text-sm font-semibold uppercase tracking-wide disabled:opacity-60"
            style={{
              background: s.buttonBackground || "#2563eb",
              color: s.buttonText || "#ffffff",
              borderRadius: radius,
            }}
          >
            {sending ? "Sending…" : s.submitLabel || "Submit"}
          </button>
        </form>
      </div>
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
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
  styles: FormStyles;
}) {
  const inputStyle = {
    background: styles.inputBackground || undefined,
    color: styles.inputText || undefined,
    borderRadius: styles.cornerRadius ?? 8,
  } as const;
  const base = "w-full border border-slate-300 px-3 py-2 text-sm";
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
          title="Digits only, optionally starting with + — spaces, hyphens and brackets are fine."
          required={field.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
    case "checkbox":
    case "multi_dropdown": {
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
