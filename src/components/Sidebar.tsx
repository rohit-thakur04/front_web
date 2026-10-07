"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "./icons";
import { useAuth } from "@/lib/auth";
import { NAV_GROUPS, type NavItem } from "@/lib/navigation";

interface Props {
  open: boolean;
  onNavigate?: () => void;
}

/*
The sidebar.

Rebuilt around the architecture in lib/navigation rather than the source
product's feature grouping, which is what the previous version mirrored and
said so in a comment.

Three structural departures, none of them cosmetic:

- The active item is marked by a left rail and a weight change on a flat
  surface, not by a filled accent block. A solid blue pill is the house style
  of every white-label CRM, and it makes the nav the loudest thing on screen
  when it should be the quietest.

- Group headings are rules with a label, not floating uppercase text. They read
  as structure rather than as more items.

- Search sits at the top of the nav as a control, because with twenty-three
  screens typing is faster than looking — and that control is also the only
  thing in the product that searches across it.
*/
export function Sidebar({ open, onNavigate }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { isAdmin, hasFeature } = useAuth();

  /*
   * Which item is current.
   *
   * Three of them share /lead-generation and differ only by query string, so
   * matching on pathname alone would light all three at once. A prefix match is
   * still right for everything else, where /templates/new belongs to Templates.
   */
  function isActive(item: NavItem): boolean {
    const [path, qs] = item.href.split("?");
    if (!pathname.startsWith(path)) return false;
    if (!qs) return true;
    const want = new URLSearchParams(qs).get("tab");
    const have = params.get("tab");
    // With no tab in the URL the first of the group is the one on screen.
    return have ? have === want : want === "sites";
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r border-[var(--ark-line)] bg-[var(--ark-surface)] transition-transform duration-200 lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Brand. A flat monogram rather than a gradient tile: this product is a
          tool, and the chrome should not be the most decorated thing in it. */}
      <div className="flex h-14 items-center gap-2.5 border-b border-[var(--ark-line)] px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-[var(--ark-r-sm)] bg-[var(--ark-ink)] text-[13px] font-bold text-[var(--ark-ink-inverse)]">
          A
        </span>
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ark-ink)]">
          Arkquen
        </span>
      </div>

      {/* The search control. Dispatches to the palette rather than holding its
          own input, so there is one search in the product and one set of
          keyboard rules for it. */}
      <div className="px-3 pt-3">
        <button
          onClick={() => window.dispatchEvent(new Event("arkquen:open-command"))}
          className="flex w-full items-center gap-2 rounded-[var(--ark-r-md)] border border-[var(--ark-line)] bg-[var(--ark-surface-2)] px-2.5 py-1.5 text-left text-[13px] text-[var(--ark-ink-muted)] transition-colors hover:border-[var(--ark-line-strong)] hover:text-[var(--ark-ink-3)]"
        >
          <span aria-hidden>⌕</span>
          <span className="flex-1">Search</span>
          <kbd className="rounded-[var(--ark-r-sm)] border border-[var(--ark-line)] bg-[var(--ark-surface)] px-1 py-0.5 text-[10px]">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group, gi) => {
          const items = group.items.filter(
            (it) =>
              (!it.adminOnly || isAdmin) &&
              (!it.feature || hasFeature(it.feature)) &&
              (!it.anyFeature || it.anyFeature.some((k) => hasFeature(k))),
          );
          if (items.length === 0) return null;

          return (
            <div key={gi} className={gi === 0 ? "" : "mt-5"}>
              {group.heading && (
                /* A rule carrying its label, so the heading reads as a divider
                   rather than as another nav entry in small caps. */
                <div className="mb-1.5 flex items-center gap-2 px-2">
                  <span className="text-[10px] font-semibold tracking-[0.1em] text-[var(--ark-ink-muted)] uppercase">
                    {group.heading}
                  </span>
                  <span className="h-px flex-1 bg-[var(--ark-line)]" />
                </div>
              )}

              <div className="space-y-px">
                {items.map((item) => {
                  const active = isActive(item);
                  const IconEl = Icon[item.icon];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-2.5 rounded-[var(--ark-r-md)] py-1.5 pr-2 pl-3 text-[13px] transition-colors ${
                        active
                          ? "bg-[var(--ark-surface-2)] font-semibold text-[var(--ark-ink)]"
                          : "font-medium text-[var(--ark-ink-3)] hover:bg-[var(--ark-surface-2)] hover:text-[var(--ark-ink)]"
                      }`}
                    >
                      {/* The rail. Carries the accent so the row itself does
                          not have to, which keeps the nav quiet while still
                          making position unmistakable at a glance. */}
                      <span
                        aria-hidden
                        className={`absolute inset-y-1 left-0 w-[2px] rounded-full transition-colors ${
                          active ? "bg-[var(--ark-primary)]" : "bg-transparent"
                        }`}
                      />
                      <IconEl
                        width={15}
                        height={15}
                        className={
                          active ? "text-[var(--ark-primary)]" : "text-[var(--ark-ink-muted)]"
                        }
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-[var(--ark-line)] px-4 py-2.5 text-[11px] text-[var(--ark-ink-muted)]">
        Arkquen
      </div>
    </aside>
  );
}
