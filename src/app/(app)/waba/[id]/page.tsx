"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { WabaTemplate } from "@/lib/types";
import { WabaForm } from "@/components/WabaForm";

export default function EditWabaPage() {
  const params = useParams<{ id: string }>();
  const [template, setTemplate] = useState<WabaTemplate | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.id) return;
    api<WabaTemplate>(`/waba/${params.id}`)
      .then(setTemplate)
      .catch((e) => setError(e.message));
  }, [params.id]);

  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!template) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  return <WabaForm template={template} />;
}
