"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { FormSubmission } from "@/lib/types";

/*
ContactSubmissions shows what a lead actually typed into the form they arrived
through.

A card has columns for name, phone, email and value. A form can ask anything —
budget, location, which service, when they want to start — and until now every
one of those answers went into the database and was never shown again. A tenant
would ask six questions and see three fields, with no indication the rest
existed.

Nothing here is editable. These are the lead's own words at a moment in time,
and the point of showing them is that they are a record: correcting a contact's
phone number should not rewrite what they originally submitted.
*/
export function ContactSubmissions({ cardId }: { cardId: string }) {
  const [subs, setSubs] = useState<FormSubmission[] | null>(null);

  useEffect(() => {
    let live = true;
    api<FormSubmission[]>(`/cards/${cardId}/submissions`)
      .then((s) => {
        if (live) setSubs(s);
      })
      // Silent. This is context inside an edit dialog, and a contact added by
      // hand or by import legitimately has none — an error banner over the
      // Save button would cost more than the missing history does.
      .catch(() => {
        if (live) setSubs([]);
      });
    return () => {
      live = false;
    };
  }, [cardId]);

  // Nothing to show for a contact who never came through a form, which is most
  // of them. An empty panel saying so is noise in a dialog this size.
  if (!subs || subs.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-2 text-sm font-medium">
        What they told us
        {subs.length > 1 && (
          /* More than one means they enquired more than once — worth seeing
             rather than collapsing into a single latest answer. */
          <span className="ml-1.5 text-xs font-normal text-slate-500">
            {subs.length} submissions
          </span>
        )}
      </h3>

      <div className="space-y-3">
        {subs.map((sub) => (
          <div key={sub._id}>
            <p className="mb-1 text-xs text-slate-500">
              {sub.formName || "Form"} · {new Date(sub.createdAt).toLocaleString()}
            </p>
            <dl className="space-y-1">
              {sub.answers.map((a) => (
                <div key={a.fieldId} className="flex gap-2 text-sm">
                  <dt className="w-2/5 shrink-0 text-slate-500">{a.label}</dt>
                  {/* Rendered as text, never as markup. A form's content blocks
                      carry sanitized HTML, but these are strings typed by
                      strangers on the public internet and have been through no
                      such treatment. */}
                  <dd className="min-w-0 flex-1 break-words">{a.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
