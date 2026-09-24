"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { tileFor } from "@/lib/settings";
import { AppStore } from "@/components/settings/AppStore";
import { StaffManager } from "@/components/settings/StaffManager";

export default function SettingsSectionPage() {
  const params = useParams<{ section: string }>();
  const { loading } = useAuth();

  if (loading) return null;

  const tile = tileFor(params.section);

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <div className="mb-5 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/settings" className="hover:text-slate-900">
          ← Settings
        </Link>
        {tile && <span>/ {tile.title}</span>}
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">{tile?.title ?? "Settings"}</h1>
      {tile && <p className="mb-6 mt-0.5 text-sm text-slate-500">{tile.description}</p>}

      {params.section === "app-store" ? (
        <AppStore />
      ) : params.section === "staff" ? (
        <StaffManager />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-base font-semibold">{tile?.title ?? "This section"}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {tile?.description ?? "This settings area isn't built out yet."}
          </p>
          <span className="mt-4 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            In development
          </span>
        </div>
      )}
    </div>
  );
}
