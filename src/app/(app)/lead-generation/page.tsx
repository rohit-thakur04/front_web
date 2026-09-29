"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { SitesTab } from "@/components/leadgen/SitesTab";
import { FormsTab } from "@/components/leadgen/FormsTab";
import { PlaceholderTab } from "@/components/leadgen/PlaceholderTab";
import { URLsTab } from "@/components/leadgen/URLsTab";

// Each tab maps to a plan feature key from the Lead Generation group in the
// catalog. A tab is shown only when the signed-in user's plan enables its
// feature, so a restricted client sees only what they're entitled to.
interface LeadGenTab {
  key: string; // plan feature key
  label: string; // tab label
  /**
   * Whether the tab leads to something built.
   *
   * This is what decides the top row, rather than a hand-kept list of names:
   * finishing a tab moves it out of the More menu by itself, and nobody has to
   * remember to. It was also the wrong way round before — Prospecting, which is
   * a blurb, sat on the top line while URLs, which works, wrapped onto its own
   * row underneath.
   */
  built?: boolean;
  /** Recently shipped. Shown as a dot, not a word — see NewDot. */
  isNew?: boolean;
}

const TABS: LeadGenTab[] = [
  { key: "sites", label: "Sites", built: true },
  { key: "forms", label: "Forms", built: true },
  { key: "urls", label: "URLs", built: true, isNew: true },
  { key: "shop", label: "Ecom" },
  { key: "chat_widget", label: "Chat Widget" },
  { key: "surveys", label: "Surveys" },
  { key: "ad_launcher", label: "Ad Launcher" },
  { key: "ai_social", label: "AI Social" },
  { key: "prospecting", label: "Prospecting" },
];

// Blurbs for the not-yet-built tabs.
const BLURBS: Record<string, { title: string; blurb: string }> = {
  shop: { title: "Ecommerce", blurb: "Sell products and manage orders. Storefront and catalog tools are on the way." },
  chat_widget: { title: "Chat Widget", blurb: "Embed a live chat widget on your sites to capture visitors as leads." },
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

  const primary = tabs.filter((t) => t.built);
  const more = tabs.filter((t) => !t.built);

  if (tabs.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-lg font-semibold tracking-tight">Lead Generation</h1>
        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          Your plan doesn&apos;t include any Lead Generation features.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* The subtitle is gone: it said "Capture leads with sites, forms, chat,
          and campaigns", which is the title plus the tab bar directly below it.
          The title and the tabs now sit on one line, which is also what stops
          the top of the page looking like three stacked rows of chrome. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-lg font-semibold tracking-tight">Lead Generation</h1>

        {/* One row, always. It scrolls sideways rather than wrapping, because a
            wrapped tab bar puts a lone tab on its own line where it reads as a
            stray link rather than part of the set. */}
        <nav
          aria-label="Lead Generation sections"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1"
        >
          {primary.map((t) => (
            <TabButton
              key={t.key}
              tab={t}
              active={current === t.key}
              onClick={() => setActive(t.key)}
            />
          ))}
          {more.length > 0 && (
            <MoreMenu
              tabs={more}
              current={current}
              onPick={setActive}
            />
          )}
        </nav>
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

/**
 * A pill, not an underline.
 *
 * The brief offered either; a filled pill is the same control the mode switches
 * elsewhere in the app already use, so the page gains a pattern rather than a
 * ninth one of its own. A 2px underline in blue is also easy to lose against a
 * row of grey labels, which was the original complaint.
 */
function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: LeadGenTab;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${
        active
          ? "bg-blue-600 font-medium text-white shadow-sm"
          : "text-slate-600 hover:bg-white hover:text-slate-900"
      }`}
    >
      {tab.label}
      {tab.isNew && <NewDot onDark={active} />}
    </button>
  );
}

/**
 * A dot instead of a NEW badge.
 *
 * Two all-caps badges in a row of nine tabs drew more attention than the tabs,
 * and "NEW" is only ever true for a while. A dot carries the same "look here"
 * and stops competing with the labels.
 */
function NewDot({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      title="Recently added"
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${onDark ? "bg-white/80" : "bg-blue-500"}`}
    />
  );
}

/**
 * The tabs that are still blurbs, collapsed behind one entry.
 *
 * Nine tabs do not fit, and six of them currently lead to a paragraph saying the
 * feature is coming. Putting those six here keeps the three working sections
 * visible at a glance without hiding anything: the menu still lists them, and it
 * highlights itself when one is open.
 */
function MoreMenu({
  tabs,
  current,
  onPick,
}: {
  tabs: LeadGenTab[];
  current: string | undefined;
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const activeHere = tabs.some((t) => t.key === current);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = activeHere
    ? (tabs.find((t) => t.key === current)?.label ?? "More")
    : "More";

  return (
    <div ref={box} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-current={activeHere ? "page" : undefined}
        className={`flex items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${
          activeHere
            ? "bg-blue-600 font-medium text-white shadow-sm"
            : "text-slate-600 hover:bg-white hover:text-slate-900"
        }`}
      >
        {label}
        <Icon.ChevronDown width={14} height={14} />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Coming soon
          </p>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                onPick(t.key);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition ${
                current === t.key
                  ? "bg-blue-50 font-medium text-blue-700"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.label}
              {t.isNew && <NewDot />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
