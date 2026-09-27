"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SitesTab } from "@/components/leadgen/SitesTab";
import { FormsTab } from "@/components/leadgen/FormsTab";
import { PlaceholderTab } from "@/components/leadgen/PlaceholderTab";
import { URLsTab } from "@/components/leadgen/URLsTab";

// Each tab maps to a plan feature key from the Lead Generation group in the
// catalog. A tab is shown only when the signed-in user's plan enables its
// feature, so a restricted client sees only what they're entitled to.
interface LeadGenTab {
  key: string;      // plan feature key
  label: string;    // tab label
  badge?: string;   // small badge like NEW / UNDER DEV
}

const TABS: LeadGenTab[] = [
  { key: "shop", label: "Ecom" },
  { key: "sites", label: "Sites" },
  { key: "chat_widget", label: "Chat Widget" },
  { key: "forms", label: "Forms" },
  { key: "surveys", label: "Surveys" },
  { key: "ad_launcher", label: "Ad Launcher" },
  { key: "ai_social", label: "AI Social", badge: "NEW" },
  { key: "prospecting", label: "Prospecting", badge: "NEW" },
  { key: "urls", label: "URLs" },
];

// Blurbs for the not-yet-built tabs.
const BLURBS: Record<string, { title: string; blurb: string }> = {
  shop: { title: "Ecommerce", blurb: "Sell products and manage orders. Storefront and catalog tools are on the way." },
  chat_widget: { title: "Chat Widget", blurb: "Embed a live chat widget on your sites to capture visitors as leads." },
  forms: { title: "Forms", blurb: "Build lead-capture forms and route submissions into your pipelines." },
  surveys: { title: "Surveys", blurb: "Qualify leads with multi-step surveys and quizzes." },
  ad_launcher: { title: "Ad Launcher", blurb: "Launch and track ad campaigns without leaving the CRM." },
  ai_social: { title: "AI Social", blurb: "Draft and schedule social posts with AI assistance." },
  prospecting: { title: "Prospecting", blurb: "Find and enrich new prospects to feed your pipelines." },
};

export default function LeadGenerationPage() {
  const { hasFeature } = useAuth();

  // Only tabs the plan allows are shown.
  const tabs = useMemo(() => TABS.filter((t) => hasFeature(t.key)), [hasFeature]);
  const [active, setActive] = useState<string>(tabs[0]?.key ?? "sites");

  // If the active tab got filtered out (plan change), fall back to the first.
  const current = tabs.find((t) => t.key === active)?.key ?? tabs[0]?.key;

  if (tabs.length === 0) {
    return (
      <div className="p-6">
        <PageHeader title="Lead Generation" />
        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          Your plan doesn&apos;t include any Lead Generation features.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Lead Generation"
        subtitle="Capture leads with sites, forms, chat, and campaigns"
      />

      {/* Sub-tab bar */}
      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => {
          const on = current === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
                on
                  ? "border-blue-600 font-medium text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {t.label}
              {t.badge && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {current === "sites" ? (
        <SitesTab />
      ) : current === "forms" ? (
        <FormsTab />
      ) : current === "urls" ? (
        <URLsTab />
      ) : current && BLURBS[current] ? (
        <PlaceholderTab title={BLURBS[current].title} blurb={BLURBS[current].blurb} />
      ) : null}
    </div>
  );
}
