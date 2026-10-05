"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { useAuth } from "@/lib/auth";

// The Lead Generation group's feature keys. The nav item shows when a plan
// enables at least one of them.
const LEAD_GEN_FEATURES = [
  "shop",
  "sites",
  "chat_widget",
  "forms",
  "surveys",
  "ad_launcher",
  "ai_social",
  "prospecting",
  "urls",
];

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
  // feature is the plan key that must be enabled for a client to see this item.
  // Omitted items are always shown (subject to adminOnly).
  feature?: string;
  // anyFeature shows the item when at least one of these keys is enabled.
  anyFeature?: string[];
}

// Grouped like the reference, but wired to the features this app actually has.
const NAV_GROUPS: { heading?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "Dashboard", feature: "dashboard" },
      // Sits beside the Dashboard rather than under Pipeline on purpose. The
      // dashboard says how things are going; this says what to do next, which
      // is the question somebody opens the product with.
      { href: "/needs-attention", label: "Needs Attention", icon: "Bell", feature: "pipeline" },
    ],
  },
  {
    heading: "Lead Generation",
    items: [
      // Shown when the plan enables any lead-gen feature (see anyFeature below).
      { href: "/lead-generation", label: "Lead Generation", icon: "Sparkle", anyFeature: LEAD_GEN_FEATURES },
    ],
  },
  {
    heading: "Pipeline",
    items: [
      { href: "/board", label: "Board", icon: "Board", feature: "pipeline" },
      { href: "/contacts", label: "Contacts", icon: "Contacts", feature: "contacts" },
    ],
  },
  {
    heading: "Automation",
    items: [
      { href: "/workflows", label: "Workflows", icon: "Sparkle", feature: "workflows" },
      { href: "/templates", label: "Email Templates", icon: "Mail", feature: "email" },
      { href: "/waba", label: "WhatsApp Templates", icon: "Chat", feature: "waba" },
    ],
  },
  {
    heading: "Workspace",
    items: [
      // Settings (App Store, etc.) is available to clients and admins alike;
      // each user manages their own workspace and integrations.
      { href: "/settings", label: "Settings", icon: "Sparkle" },
    ],
  },
  {
    heading: "Admin",
    items: [
      { href: "/plans", label: "Plans", icon: "Layers", adminOnly: true },
      { href: "/clients", label: "Clients", icon: "Shield", adminOnly: true },
      // Beside Clients because that is where it gets used: capture a configured
      // account, then start the next client from it.
      { href: "/snapshots", label: "Snapshots", icon: "Layers", adminOnly: true },
    ],
  },
];

interface Props {
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ open, onNavigate }: Props) {
  const pathname = usePathname();
  const { isAdmin, hasFeature } = useAuth();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex h-16 items-center gap-2 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
            <path d="M12 3 3 20h18L12 3z" />
            <path d="M12 11 8 20M12 11l4 9" />
          </svg>
        </span>
        <span className="text-lg font-bold tracking-tight">ARKQUEN</span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group, gi) => {
          const items = group.items.filter(
            (it) =>
              (!it.adminOnly || isAdmin) &&
              (!it.feature || hasFeature(it.feature)) &&
              (!it.anyFeature || it.anyFeature.some((k) => hasFeature(k))),
          );
          if (items.length === 0) return null;

          return (
            <div key={gi}>
              {group.heading && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.heading}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname.startsWith(item.href);
                  const IconEl = Icon[item.icon];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                      }`}
                    >
                      <IconEl className={active ? "text-white" : "text-slate-400"} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-4 text-xs text-slate-400">
        Arkquen
      </div>
    </aside>
  );
}
