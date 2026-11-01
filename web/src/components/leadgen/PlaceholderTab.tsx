"use client";

// A clean empty state for Lead Generation sub-features that aren't built out yet.
// The tab is real and gated by the plan feature; only the inner workspace is
// pending — the honest equivalent of the reference's "UNDER DEV" / "NEW" badges.
export function PlaceholderTab({
  title,
  blurb,
}: {
  title: string;
  blurb: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 2 3 7v10l9 5 9-5V7l-9-5z" />
          <path d="M12 22V12M3 7l9 5 9-5" />
        </svg>
      </div>
      <p className="text-base font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{blurb}</p>
      <span className="mt-4 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        In development
      </span>
    </div>
  );
}
