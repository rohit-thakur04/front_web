"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { EmailTemplate } from "@/lib/types";
import { TemplateForm } from "@/components/TemplateForm";

export default function EditTemplatePage() {
  // useParams is a client hook and stays synchronous; only server components
  // take params as a Promise in Next 16.
  const params = useParams<{ id: string }>();
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.id) return;
    api<EmailTemplate>(`/templates/${params.id}`)
      .then(setTemplate)
      .catch((e) => setError(e.message));
  }, [params.id]);

  if (error) {
    return <p className="p-6 text-sm text-red-600">{error}</p>;
  }
  if (!template) {
    return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  }
  return <TemplateForm stageId={template.stageId} template={template} />;
}
