"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";

/*
Where Cashfree sends the customer back. It only reports: the account is made by
the payment webhook, so this page waits for that rather than doing anything.
*/
export default function ProcessingPage() {
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get("order_id");
    let live = true;
    let tries = 0;
    async function poll() {
      if (!orderId) {
        setStatus("unknown");
        return;
      }
      try {
        const r = await api<{ status: string }>(`/public/checkout/${encodeURIComponent(orderId!)}`);
        if (!live) return;
        setStatus(r.status);
        if (r.status === "provisioned" || r.status === "failed" || r.status === "abandoned" || r.status === "refunded") {
          return;
        }
      } catch {
        if (live) setStatus("unknown");
        return;
      }
      // About two minutes of checking; the email arrives either way.
      if (++tries < 40 && live) setTimeout(poll, 3000);
    }
    poll();
    return () => {
      live = false;
    };
  }, []);

  if (status === "provisioned") {
    return (
      <PublicShell title="Check your email" subtitle="Payment received and your account is ready.">
        <p className="text-sm text-slate-600">
          We have emailed you a link to set your password. It works once and expires in 48 hours.
          If it hasn&apos;t arrived in a few minutes, check spam, or use{" "}
          <Link href="/forgot-password" className="underline">Forgot password</Link> with the same email.
        </p>
      </PublicShell>
    );
  }
  if (status === "failed" || status === "abandoned") {
    return (
      <PublicShell title="Payment didn't go through" subtitle="No money was taken for this attempt.">
        <Link href="/pricing" className="text-sm underline">Try again</Link>
      </PublicShell>
    );
  }
  if (status === "unknown") {
    return (
      <PublicShell title="We couldn't find that payment">
        <p className="text-sm text-slate-600">
          If you paid, your account email is on its way. Otherwise, <Link href="/pricing" className="underline">start again</Link>.
        </p>
      </PublicShell>
    );
  }
  return (
    <PublicShell title="Confirming your payment…" subtitle="This usually takes a few seconds.">
      <p className="text-sm text-slate-600">
        You can close this page: as soon as the payment is confirmed we email you a link to set your password.
      </p>
    </PublicShell>
  );
}
