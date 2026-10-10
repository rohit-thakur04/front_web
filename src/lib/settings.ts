import type { IconName } from "@/components/icons";

// The Settings tiles, mirroring the reference. Only "app-store" is functional
// today; the rest render an in-development panel. `section` is the URL slug.
export interface SettingsTile {
  section: string;
  title: string;
  description: string;
  icon: IconName;
  live?: boolean;
}

export const SETTINGS_TILES: SettingsTile[] = [
  { section: "vault", title: "Vault", description: "Centralized media library for all uploaded files and assets.", icon: "Shield" },
  /*
    Described for every role, not just the one it works for.

    It read "Add team members with their own login and scoped permissions",
    which is true inside a client account and a dead end for an admin — who
    opened it, found a notice instead of controls, and had been promised
    otherwise by the card. Staff are managed per client account, so the card
    says that.
  */
  { section: "staff", title: "Staff", description: "Team logins and scoped permissions, managed inside a client account.", icon: "Contacts", live: true },
  { section: "tags", title: "Tags", description: "Organize contacts and records with reusable labels.", icon: "Layers" },
  { section: "values", title: "Values", description: "Configure dropdowns, statuses, and reusable value sets.", icon: "Sparkle" },
  { section: "fields", title: "Fields", description: "Create custom fields for contacts, companies, and records.", icon: "Dashboard" },
  { section: "templates", title: "Templates", description: "Reusable templates for notes, outreach, and documents.", icon: "Mail" },
  { section: "app-store", title: "App Store", description: "Connect Google, Meta, WhatsApp, Zoom, and AI providers.", icon: "Layers", live: true },
  { section: "domains", title: "Domains", description: "Map custom domains, subdomains, and DNS records.", icon: "Chat" },
  { section: "wallet", title: "Wallet", description: "Top up credits and review wallet transactions.", icon: "Money" },
  { section: "analytics", title: "Analytics", description: "Cross-module performance, revenue, and insights.", icon: "Percent" },
  { section: "deleted", title: "Deleted Items", description: "Restore items deleted in the last 30 days.", icon: "Refresh" },
  { section: "customize", title: "Customize", description: "Workspace preferences, layout, and experience mode.", icon: "Sparkle" },
];

export function tileFor(section: string): SettingsTile | undefined {
  return SETTINGS_TILES.find((t) => t.section === section);
}
