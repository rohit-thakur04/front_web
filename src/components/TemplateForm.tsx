"use client";

import { useState } from "react";
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
      router.push("/templates");
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
            onClick={() => router.push("/templates")}
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

        <Field label="Day number" hint="Leave blank to use the next free day">
          <input
            type="number"
            min="1"
            value={dayNumber}
            onChange={(e) => setDayNumber(e.target.value)}
            className="input"
          />
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
