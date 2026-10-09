"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { RowAction, RowActions } from "@/components/RowActions";
import type { ShortURL } from "@/lib/types";

/*
 * The link to hand out comes from the server, which knows where it is served.
 *
 * It used to be built from whichever API base the browser happened to be calling,
 * so Copy produced an ark-production-….up.railway.app link — a campaign URL that
 * advertises the hosting provider and reads as phishing to the recipient. The
 * server now returns `shortUrl`, resolved against PUBLIC_BASE_URL, so pointing a
 * custom domain at the API changes every link already created.
 *
 * The fallback keeps the row readable against an older API build that does not
 * send the field.
 */
/**
 * How a link rotates, phrased the way the form phrased it.
 *
 * Reads the stored minutes back into the largest whole unit that divides it, so
 * a weekly rotation says "every 7 days" rather than "every 10080 minutes".
 */
function rotationLabel(link: ShortURL): string {
  const count = link.destinations?.length ?? 0;
  switch (link.rotationMode) {
    case "clicks":
      return `Rotating ${count} · every ${link.rotateEveryClicks ?? 0} clicks`;
    case "time": {
      const mins = link.rotateEveryMinutes ?? 0;
      if (mins > 0 && mins % 1440 === 0) return `Rotating ${count} · every ${mins / 1440}d`;
      if (mins > 0 && mins % 60 === 0) return `Rotating ${count} · every ${mins / 60}h`;
      return `Rotating ${count} · every ${mins}m`;
    }
    default:
      return `Rotating ${count} · split`;
  }
}

function shortLink(link: ShortURL) {
  return link.shortUrl || `/r/${link.code}`;
}

export function URLsTab() {
  const [links, setLinks] = useState<ShortURL[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState("");

  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [campaign, setCampaign] = useState("");
  const [code, setCode] = useState("");
  /*
   * Extra destinations, beyond the first. Held separately from `target` so the
   * ordinary case — one link, one destination — is unchanged and the rotation
   * fields only exist once somebody asks for them.
   */
  const [extras, setExtras] = useState<{ url: string; label: string; weight: string }[]>([]);
  // The first destination's share. Separate because its URL is the main field
  // above, but it still needs a weight or a rotation can only ever favour the
  // destinations added second.
  const [primaryWeight, setPrimaryWeight] = useState("1");
  /*
   * How the rotation advances. Three modes, because the three things clients
   * want from one rotating link differ in kind: split traffic now, hand each
   * destination a run of clicks, or move on by the clock.
   */
  const [mode, setMode] = useState<"weighted" | "clicks" | "time">("weighted");
  const [everyClicks, setEveryClicks] = useState("100");
  // Held in the unit the client chose and converted to minutes on save — "7
  // days" is how somebody describes a weekly rotation, not "10080 minutes".
  const [everyCount, setEveryCount] = useState("7");
  const [everyUnit, setEveryUnit] = useState<"minutes" | "hours" | "days">("days");

  async function load() {
    try {
      setLinks(await api<ShortURL[]>("/urls"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load short links");
    } finally {
      setLoading(false);
    }
  }

  // Matches the other lead-gen tabs: the async work is wrapped so the effect
  // body itself doesn't set state synchronously.
  useEffect(() => {
    async function run() {
      await load();
    }
    run();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      /*
       * Sent only when there is something to rotate between. One destination is
       * an ordinary link, and posting a single-entry rotation would make every
       * link in the list claim to be a rotator.
       */
      const filled = extras.filter((d) => d.url.trim() !== "");
      // Blank or unparseable means an equal share. The server floors anything
      // below 1 as well, so a destination can never end up starved.
      const share = (w: string) => Number(w) || 1;
      const destinations =
        filled.length > 0
          ? [
              { url: target, label: title, weight: share(primaryWeight) },
              ...filled.map((d) => ({
                url: d.url,
                label: d.label,
                weight: share(d.weight),
              })),
            ]
          : undefined;

      const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 } as const;
      const link = await api<ShortURL>("/urls", {
        method: "POST",
        body: {
          targetUrl: target,
          title,
          campaign,
          code,
          destinations,
          // Only sent with a rotation; a single-destination link has no mode.
          ...(destinations
            ? {
                rotationMode: mode,
                rotateEveryClicks: Number(everyClicks) || 0,
                rotateEveryMinutes:
                  (Number(everyCount) || 0) * UNIT_MINUTES[everyUnit],
              }
            : {}),
        },
      });
      // Prepend rather than refetch: the list is sorted newest-first anyway.
      setLinks((prev) => [link, ...prev]);
      setTarget("");
      setTitle("");
      setCampaign("");
      setCode("");
      setExtras([]);
      setPrimaryWeight("1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the link");
    } finally {
      setSaving(false);
    }
  }

  async function remove(link: ShortURL) {
    if (
      !window.confirm(
        `Delete /r/${link.code}? Anyone who already has this link will get a "not found" page.`,
      )
    )
      return;
    try {
      await api(`/urls/${link._id}`, { method: "DELETE" });
      setLinks((prev) => prev.filter((l) => l._id !== link._id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the link");
    }
  }

  async function copy(link: ShortURL) {
    try {
      await navigator.clipboard.writeText(shortLink(link));
      setCopied(link._id);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      // Clipboard needs a secure context; the link is visible to copy by hand.
      setError("Couldn't copy automatically — select the link and copy it.");
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={create}
        className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Destination URL *</label>
          <input
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="https://example.com/diwali-offer"
            className="input"
          />
          <p className="mt-1 text-xs text-slate-500">
            Where the short link sends people. If you leave off https://, it&apos;s added.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Label</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Diwali landing page"
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Campaign</label>
          <input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="diwali-whatsapp"
            className="input"
          />
        </div>

        {/* Rotation. Hidden behind a single button until wanted, so the common
            case stays a three-field form. */}
        <div className="sm:col-span-2">
          {extras.length === 0 ? (
            <button
              type="button"
              onClick={() => setExtras([{ url: "", label: "", weight: "1" }])}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              + Split clicks between several destinations
            </button>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-sm font-medium">Rotate between destinations</p>
              {/* How the rotation advances, chosen before the destinations are
                  listed, because it changes what the fields beside each one
                  mean — weights only apply to the proportional mode. */}
              <div className="mb-3 space-y-2">
                {(
                  [
                    ["weighted", "Split every click", "Shared out in proportion to the weights. Two reps on 1 and 1 get half each."],
                    ["clicks", "Switch after N clicks", "One destination stays live until it has had its quota, then the link moves on."],
                    ["time", "Switch on a schedule", "Moves on by the clock, whether or not anybody clicked."],
                  ] as const
                ).map(([key, label, blurb]) => (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors ${
                      mode === key
                        ? "border-blue-500 bg-white"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="rotation-mode"
                      checked={mode === key}
                      onChange={() => setMode(key)}
                      className="mt-0.5"
                    />
                    <span className="text-sm">
                      <span className="font-medium">{label}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{blurb}</span>
                    </span>
                  </label>
                ))}
              </div>

              {mode === "clicks" && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <span>Move on after</span>
                  <input
                    type="number"
                    min={1}
                    value={everyClicks}
                    onChange={(e) => setEveryClicks(e.target.value)}
                    className="input w-20"
                  />
                  <span>clicks on each destination.</span>
                </div>
              )}

              {mode === "time" && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <span>Each destination stays live for</span>
                  <input
                    type="number"
                    min={1}
                    value={everyCount}
                    onChange={(e) => setEveryCount(e.target.value)}
                    className="input w-20"
                  />
                  <select
                    value={everyUnit}
                    onChange={(e) =>
                      setEveryUnit(e.target.value as "minutes" | "hours" | "days")
                    }
                    className="input w-auto"
                  >
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                  <span>, then the link moves on by itself.</span>
                </div>
              )}

              <p className="mb-3 text-xs text-slate-500">
                The URL at the top of this form is the first destination.
                {mode !== "weighted" &&
                  " Weights are ignored in this mode — each destination gets an equal turn."}
              </p>

              <div className="space-y-2">
                {/* The destination from the field above, shown here so its
                    share is adjustable alongside the others rather than
                    silently fixed at one. */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="input min-w-0 flex-1 truncate bg-white text-slate-500">
                    {target || "the destination URL above"}
                  </span>
                  <span className="w-28 text-xs text-slate-400">first</span>
                  <input
                    type="number"
                    min={1}
                    value={primaryWeight}
                    onChange={(e) => setPrimaryWeight(e.target.value)}
                    title="Share of the clicks"
                    className="input w-16"
                  />
                  <span className="w-[26px]" />
                </div>

                {extras.map((d, i) => (
                  <div key={i} className="flex flex-wrap items-start gap-2">
                    <input
                      value={d.url}
                      onChange={(e) =>
                        setExtras((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                        )
                      }
                      placeholder="https://example.com/rep-two"
                      className="input min-w-0 flex-1"
                    />
                    <input
                      value={d.label}
                      onChange={(e) =>
                        setExtras((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                        )
                      }
                      placeholder="Label"
                      className="input w-28"
                    />
                    <input
                      type="number"
                      min={1}
                      value={d.weight}
                      onChange={(e) =>
                        setExtras((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)),
                        )
                      }
                      title="Share of the clicks"
                      className="input w-16"
                    />
                    <button
                      type="button"
                      onClick={() => setExtras((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Remove this destination"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:text-rose-600"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setExtras((prev) => [...prev, { url: "", label: "", weight: "1" }])
                }
                className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                + Add another
              </button>
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Custom code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Leave blank to generate one"
            className="input"
          />
          <p className="mt-1 text-xs text-slate-500">
            3–32 characters: letters, numbers, hyphen or underscore. The code can&apos;t be
            changed later, because shared links would break — but you can always repoint it.
          </p>
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create short link"}
          </button>
        </div>
      </form>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {loading ? (
        <p className="p-6 text-sm text-slate-500">Loading…</p>
      ) : links.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-base font-semibold">No short links yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Create one to share in a WhatsApp campaign or an email, and see how many
            people followed it.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Short link</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3 text-right">Clicks</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l._id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    {/* The host is shown, not just the path: the report's point
                        was that you cannot tell what you are about to copy. */}
                    <span className="font-medium" title={shortLink(l)}>
                      {shortLink(l).replace(/^https?:\/\//, "")}
                    </span>
                    {l.title && <p className="text-xs text-slate-500">{l.title}</p>}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-slate-600">
                    {l.destinations && l.destinations.length > 1 ? (
                      /* The whole point of a rotator is which destination got
                         what, so the per-destination tallies are the content
                         here rather than a single URL that is only the first. */
                      <div className="space-y-0.5">
                        {/* The mode matters as much as the count: "rotating
                            between 3" says nothing about whether a click goes
                            somewhere different each time or whether the link
                            changes weekly. */}
                        <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium">
                          {rotationLabel(l)}
                        </span>
                        {l.destinations.map((d, i) => (
                          <p key={i} className="truncate text-xs" title={d.url}>
                            {d.label || d.url}
                            <span className="ml-1 text-slate-400">
                              {d.clicks} click{d.clicks === 1 ? "" : "s"}
                            </span>
                          </p>
                        ))}
                      </div>
                    ) : (
                      <span className="block truncate" title={l.targetUrl}>
                        {l.targetUrl}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.campaign || "—"}</td>
                  <td className="px-4 py-3 text-right font-medium">{l.clicks}</td>
                  <td className="px-4 py-3 text-right">
                    <RowActions>
                      {/* Copy keeps its word: the label doubles as the
                          "Copied ✓" confirmation, which an icon cannot carry. */}
                      <button
                        onClick={() => copy(l)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                      >
                        {copied === l._id ? "Copied ✓" : "Copy"}
                      </button>
                      <RowAction action="delete" label="Delete" onClick={() => remove(l)} />
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
