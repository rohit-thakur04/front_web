"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { SETTINGS_TILES } from "@/lib/settings";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";

export default function SettingsPage() {
  const { loading } = useAuth();

  if (loading) return null;

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <PageHeader
        title="Settings"
        subtitle="Manage your workspace, team, integrations, and preferences."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_TILES.map((t) => {
          const IconEl = Icon[t.icon];
          return (
            <Link
              key={t.section}
              href={`/settings/${t.section}`}
              className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <IconEl />
                </span>
                {t.live && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    live
                  </span>
                )}
              </div>
              <p className="flex items-center gap-1 font-semibold group-hover:text-blue-700">
                {t.title}
                <span className="opacity-0 transition group-hover:opacity-100">→</span>
              </p>
              <p className="mt-1 text-sm text-slate-500">{t.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
