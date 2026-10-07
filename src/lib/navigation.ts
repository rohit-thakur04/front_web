import type { IconName } from "@/components/icons";

/*
=============================================================================
ARKQUEN INFORMATION ARCHITECTURE
=============================================================================

The inherited navigation was grouped the way the source product groups its own
features — the sidebar's own comment said so — and that is the single strongest
signal that this is a re-skin rather than a product. The groups describe a
feature list; they do not describe anybody's day.

So this is regrouped around the job the product exists to do: an enquiry
arrives, somebody answers it quickly, and it moves through a pipeline until it
closes. The order follows that sequence.

What changed, and why each one matters more than any amount of restyling:

1. "Today" leads, and Needs Attention leads it. The inherited first screen is a
   dashboard of counts, which answers how the month is going — a question
   nobody opens software at 9am to ask. The first thing on screen should be the
   list of people waiting on a reply.

2. "Lead Generation" is flattened. It was one nav item hiding four tabs, so the
   forms editor was three clicks from anywhere. Capture is where leads come
   from; it is too important to be a tab.

3. Groups are named for what you are doing, not for the subsystem that does it.
   "Messaging" rather than "Automation" for the places you write to people;
   "Automation" kept only for the thing that actually automates.

4. Admin is separated rather than appended. Running the platform and running a
   business inside it are different jobs, usually different people.

This file is the one definition. The sidebar renders it and the command palette
searches it, so a screen can never exist in one and not the other — which is
how the inherited sidebar ended up listing screens the palette had never heard
of.
*/

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Plan feature key required to see this. */
  feature?: string;
  /** Shown when ANY of these features is enabled. */
  anyFeature?: string[];
  adminOnly?: boolean;
  /** One line for the palette, where there is no sidebar group to lean on. */
  hint?: string;
  /** Extra search terms, including what other products call this. */
  keywords?: string[];
}

export interface NavGroup {
  /** Undefined for the leading group, which needs no label above it. */
  heading?: string;
  items: NavItem[];
}

/** Features that make the Capture group worth showing at all. */
export const CAPTURE_FEATURES = ["forms", "sites", "urls"];

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      {
        href: "/needs-attention",
        label: "Needs Attention",
        icon: "Bell",
        feature: "pipeline",
        hint: "Who is waiting on a reply",
        keywords: ["today", "inbox", "follow up", "overdue", "neglected"],
      },
      {
        href: "/dashboard",
        label: "Overview",
        icon: "Dashboard",
        feature: "dashboard",
        hint: "How the month is going",
        keywords: ["dashboard", "home", "metrics", "stats", "reports"],
      },
    ],
  },
  {
    heading: "Pipeline",
    items: [
      {
        href: "/board",
        label: "Board",
        icon: "Board",
        feature: "pipeline",
        hint: "Drag leads between stages",
        keywords: ["pipeline", "deals", "kanban", "opportunities", "stages"],
      },
      {
        href: "/contacts",
        label: "Contacts",
        icon: "Contacts",
        feature: "contacts",
        hint: "Every lead, filterable",
        keywords: ["leads", "people", "customers", "database", "import"],
      },
    ],
  },
  {
    /* Flattened out of the inherited "Lead Generation" item, which hid all
       three of these behind a tab strip. */
    heading: "Capture",
    items: [
      {
        href: "/lead-generation?tab=forms",
        label: "Forms",
        icon: "Sparkle",
        feature: "forms",
        hint: "Public forms that create contacts",
        keywords: ["form", "enquiry", "capture", "lead form"],
      },
      {
        href: "/lead-generation?tab=sites",
        label: "Landing Pages",
        icon: "Layers",
        feature: "sites",
        hint: "Hosted pages and funnels",
        keywords: ["funnel", "site", "landing", "page", "website"],
      },
      {
        href: "/lead-generation?tab=urls",
        label: "Short Links",
        icon: "ExternalLink",
        feature: "urls",
        hint: "Trackable links, and link rotation",
        keywords: ["link", "url", "short", "rotator", "campaign", "utm"],
      },
    ],
  },
  {
    heading: "Messaging",
    items: [
      {
        href: "/broadcasts",
        label: "Broadcast",
        icon: "Send",
        feature: "bulk_import",
        hint: "One message to many contacts",
        keywords: ["bulk", "campaign", "blast", "newsletter", "mass"],
      },
      {
        href: "/templates",
        label: "Email Templates",
        icon: "Mail",
        feature: "email",
        hint: "Sequences by stage and day",
        keywords: ["email", "drip", "sequence", "template", "follow up"],
      },
      {
        href: "/waba",
        label: "WhatsApp",
        icon: "Chat",
        feature: "waba",
        hint: "Templates and Meta approval",
        keywords: ["whatsapp", "waba", "meta", "message", "template"],
      },
    ],
  },
  {
    heading: "Automation",
    items: [
      {
        href: "/workflows",
        label: "Workflows",
        icon: "Sparkle",
        feature: "workflows",
        hint: "Triggers, conditions and actions",
        keywords: ["workflow", "automation", "trigger", "builder", "flow"],
      },
    ],
  },
  {
    heading: "Workspace",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: "Sparkle",
        hint: "Integrations, staff and preferences",
        keywords: ["settings", "integrations", "app store", "smtp", "staff", "team"],
      },
    ],
  },
  {
    heading: "Administration",
    items: [
      {
        href: "/clients",
        label: "Clients",
        icon: "Shield",
        adminOnly: true,
        hint: "Every account on the platform",
        keywords: ["clients", "accounts", "customers", "tenants", "users"],
      },
      {
        href: "/plans",
        label: "Plans",
        icon: "Money",
        adminOnly: true,
        hint: "Entitlements and quotas",
        keywords: ["plans", "pricing", "billing", "limits", "features"],
      },
      {
        href: "/snapshots",
        label: "Snapshots",
        icon: "Layers",
        adminOnly: true,
        hint: "Start a new client from a configured one",
        keywords: ["snapshot", "template", "onboard", "clone", "preset"],
      },
    ],
  },
];

/** One target the command palette can jump to. */
export interface CommandTarget extends NavItem {
  group: string;
  keywords: string[];
}

/*
Every navigable screen, flattened for the palette.

Derived from the groups above rather than listed again: a second list is a list
that goes stale, and a screen missing from the palette is a screen somebody
cannot find.
*/
export const COMMAND_TARGETS: CommandTarget[] = NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    ...item,
    group: group.heading ?? "Go to",
    keywords: item.keywords ?? [],
  })),
);
