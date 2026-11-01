"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { TemplateForm } from "@/components/TemplateForm";

function NewTemplate() {
  const params = useSearchParams();
  const stageId = params.get("stageId") ?? "";

  if (!stageId) {
    return (
      <p className="p-6 text-sm text-slate-500">
        Pick a stage on the Templates page first — a template always belongs to one.
      </p>
    );
  }
  return <TemplateForm stageId={stageId} />;
}

export default function NewTemplatePage() {
  // useSearchParams needs a Suspense boundary to avoid opting the whole route
  // into client-side rendering at build time.
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading…</p>}>
      <NewTemplate />
    </Suspense>
  );
}
