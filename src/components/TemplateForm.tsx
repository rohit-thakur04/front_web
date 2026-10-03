"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiBase, getToken } from "@/lib/api";
import type { EmailTemplate } from "@/lib/types";
import { RichTextEditor } from "./RichTextEditor";

interface Props {
  stageId: string;
  template?: EmailTemplate;
}

export function TemplateForm({ stageId, template }: Props) {
  const router = useRouter();

  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [fromName, setFromName] = useState(template?.fromName ?? "");
  const [replyTo, setReplyTo] = useState(template?.replyTo ?? "");
  const [content, setContent] = useState(template?.content ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState(template?.attachmentUrl ?? "");
  const [dayNumber, setDayNumber] = useState(
    template?.dayNumber ? String(template.dayNumber) : "",
  );

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  /*
   * The day numbers already taken in this stage.
   *
   * Duplicates were accepted silently, so a stage could end up with two Day 1
   * templates and no indication which of them a contact would receive. The
   * server still allows it — there are legitimate reasons to send two emails on
   * one day — but it should be a decision rather than an accident.
   */
  const [takenDays, setTakenDays] = useState<number[]>([]);

  useEffect(() => {
    if (!stageId) return;
    let live = true;
    async function run() {
      try {
        const siblings = await api<EmailTemplate[]>(`/templates?stageId=${stageId}`);
        if (!live) return;
        setTakenDays(
          siblings
            .filter((t) => t._id !== template?._id)
            .map((t) => t.dayNumber)
            .filter((d) => d > 0),
        );
      } catch {
        // Only powers a warning; its absence must not block saving.
      }
    }
    run();
    return () => {
      live = false;
    };
  }, [stageId, template?._id]);

  const dayClash = dayNumber !== "" && takenDays.includes(Number(dayNumber));

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);

      // This one call bypasses the JSON api() helper because it must send
      // multipart with its own boundary.
      const res = await fetch(`${apiBase}/api/templates/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Upload failed");
      }
      const data = (await res.json()) as { attachmentUrl: string };
      setAttachmentUrl(data.attachmentUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      name,
      subject,
      fromName,
      replyTo,
      content,
      attachmentUrl,
    };
    // Omitting dayNumber lets the server auto-fill the next free day.
    if (dayNumber) body.dayNumber = Number(dayNumber);

    try {
      if (template) {
        await api(`/templates/${template._id}`, { method: "PUT", body });
      } else {
        await api("/templates", { method: "POST", body: { ...body, stageId } });
      }
      // Carries the stage back with it, so the template that was just saved is
      // the one on screen. Returning to the bare list landed on whichever stage
      // happened to be first, where the new template was nowhere to be seen.
      router.push(`/templates?stageId=${stageId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">
          {template ? "Edit template" : "New template"}
        </h1>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => router.push(`/templates?stageId=${stageId}`)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Template Name *">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
        </Field>

        {/* The hint names the minimum. It used to say only "leave blank to use
            the next free day", so entering 0 produced "Value must be greater
            than or equal to 1" from a field that had never mentioned a floor. */}
        <Field
          label="Day number"
          hint="Day 1 is the earliest — it sends as soon as the contact enters the stage. Leave blank to use the next free day."
        >
          <input
            type="number"
            min="1"
            step="1"
            value={dayNumber}
            onChange={(e) => setDayNumber(e.target.value)}
            className="input"
          />
          {dayClash && (
            <p className="mt-1 text-xs text-amber-700">
              Day {dayNumber} already has a template in this stage. Both will be
              sent — use a different day if that is not what you want.
            </p>
          )}
        </Field>

        <Field label="Subject *">
          <input
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="From Name *">
          <input
            required
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Reply To">
          <input
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Attachment">
          <input
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
            className="text-sm"
          />
          {uploading && <p className="mt-1 text-xs text-slate-500">Uploading…</p>}
          {attachmentUrl && (
            <p className="mt-1 flex items-center gap-2 text-xs">
              <a
                href={`${apiBase}${attachmentUrl}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                {attachmentUrl.split("-").slice(1).join("-") || attachmentUrl}
              </a>
              <button
                type="button"
                onClick={() => setAttachmentUrl("")}
                className="text-slate-400 hover:text-red-600"
              >
                remove
              </button>
            </p>
          )}
        </Field>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Content</label>
        <RichTextEditor
          value={content}
          onChange={setContent}
          meta={{ subject, fromName }}
        />
        <p className="mt-1 text-xs text-slate-500">
          Use the Custom values menu to insert {"{{name}}"}, {"{{phone}}"},{" "}
          {"{{email}}"}, or {"{{pipelineName}}"} — they are replaced per contact
          when the email is sent.
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
