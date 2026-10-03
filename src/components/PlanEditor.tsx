"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { FeatureGroup, Plan } from "@/lib/types";
import { RichTextEditor } from "./RichTextEditor";
import { Toggle } from "./ui";

type Tab = "basic" | "pricing" | "features" | "checkout";
const TABS: { key: Tab; label: string }[] = [
  { key: "basic", label: "Basic" },
  { key: "pricing", label: "Pricing & tax" },
  { key: "features", label: "Features" },
  { key: "checkout", label: "Checkout" },
];

// The editable shape of a plan. Mirrors the Go Plan model; the server fills any
// omitted defaults on save.
function blankPlan(): Omit<Plan, "_id" | "ownerId" | "createdAt" | "updatedAt"> {
  return {
    name: "",
    description: "",
    imageUrl: "",
    pricing: {
      currency: "INR",
      trialDays: 0,
      gateways: [],
      cycles: [
        { key: "monthly", label: "Monthly", price: 0, active: true, visible: true },
        { key: "quarterly", label: "Quarterly", price: 0, active: true, visible: true },
        { key: "half_yearly", label: "Half-yearly", price: 0, active: true, visible: true },
        { key: "annual", label: "Annual", price: 0, active: true, visible: true },
        { key: "biennial", label: "2 Years", price: 0, active: false, visible: true },
      ],
    },
    tax: { apply: false, country: "India", ratePct: 18, inclusive: false, hsnSac: "", gstin: "" },
    limits: {
      monthlyEmailLimit: 1000,
      maxStaff: 0,
      maxContacts: 0,
      maxPipelines: 0,
      maxTemplates: 0,
      whiteLabel: false,
    },
    features: {},
    addOns: {
      prebuiltTemplates: true,
      funnelTemplates: true,
      emailTemplates: true,
      whatsappTemplates: true,
      automationTemplates: true,
      customThemes: true,
    },
    lifecycle: { gracePeriodDays: 7, lockMode: "no_lock", overduePolicy: false },
  };
}

interface Props {
  plan?: Plan; // provided when editing
  onClose: () => void;
  onSaved: (plan: Plan) => void;
}

export function PlanEditor({ plan, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>("basic");
  const [catalog, setCatalog] = useState<FeatureGroup[]>([]);
  const [draft, setDraft] = useState(() => (plan ? { ...blankPlan(), ...plan } : blankPlan()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Load the feature catalog, then seed every catalog key that the draft hasn't
  // set yet to "on" — matching the reference's all-enabled default.
  useEffect(() => {
    api<FeatureGroup[]>("/plans/catalog")
      .then((groups) => {
        setCatalog(groups);
        setDraft((d) => {
          const features = { ...d.features };
          for (const g of groups) {
            for (const f of g.features) {
              if (features[f.key] === undefined) features[f.key] = true;
            }
          }
          return { ...d, features };
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load features"));
  }, []);

  const featureCount = useMemo(() => {
    const on = Object.values(draft.features).filter(Boolean).length;
    const total = Object.keys(draft.features).length;
    return { on, total };
  }, [draft.features]);

  const activeCycles = draft.pricing.cycles.filter((c) => c.active).length;

  function patch(p: Partial<typeof draft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  async function save() {
    setError("");
    if (!draft.name.trim()) {
      setTab("basic");
      setError("Plan name is required.");
      return;
    }
    setSaving(true);
    try {
      const saved = plan
        ? await api<Plan>(`/plans/${plan._id}`, { method: "PUT", body: draft })
        : await api<Plan>("/plans", { method: "POST", body: draft });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the plan");
    } finally {
      setSaving(false);
    }
  }

  function goNext() {
    const i = TABS.findIndex((t) => t.key === tab);
    if (i < TABS.length - 1) setTab(TABS[i + 1].key);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-6 flex w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="text-lg font-semibold">{plan ? "Edit Plan" : "New Plan"}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Set entitlements, limits, pricing, and tax for this client plan.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-100 px-5 pt-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                tab === t.key
                  ? "bg-white text-slate-900 shadow-[inset_0_-2px_0_0_theme(colors.blue.600)]"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-5">
          {error && (
            <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}

          {tab === "basic" && <BasicTab draft={draft} patch={patch} />}
          {tab === "pricing" && <PricingTab draft={draft} patch={patch} />}
          {tab === "features" && <FeaturesTab draft={draft} patch={patch} catalog={catalog} />}
          {tab === "checkout" && <CheckoutTab draft={draft} featureCount={featureCount} activeCycles={activeCycles} />}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-slate-100 p-4 text-sm">
          <span className="text-slate-500">
            {featureCount.on} features enabled · {activeCycles} billing cycles
          </span>
          <div className="ml-auto flex items-center gap-2">
            {tab !== "checkout" && (
              <button
                onClick={goNext}
                className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100"
              >
                Next ›
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
            >
              ✕ Close
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : plan ? "Update Plan" : "Create Plan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type Draft = ReturnType<typeof blankPlan>;
type PatchFn = (p: Partial<Draft>) => void;

function BasicTab({ draft, patch }: { draft: Draft; patch: PatchFn }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">
            Plan Name <span className="text-rose-500">*</span>
          </label>
          <span className="text-xs text-slate-400">{draft.name.length}/80</span>
        </div>
        <input
          value={draft.name}
          maxLength={80}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Premium"
          className="input mt-1"
        />
        <p className="mt-1 text-xs text-slate-500">Use a descriptive name.</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Description</label>
        <RichTextEditor
          value={draft.description}
          onChange={(html) => patch({ description: html })}
        />
        <p className="mt-1 text-xs text-slate-500">
          Format your description with rich text. Shown on the checkout page.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Plan image</label>
        <input
          value={draft.imageUrl}
          onChange={(e) => patch({ imageUrl: e.target.value })}
          placeholder="https://… image URL"
          className="input"
        />
        <p className="mt-1 text-xs text-slate-500">
          Shown on the checkout page and plan card. Paste an image URL.
        </p>
      </div>
    </div>
  );
}

function PricingTab({ draft, patch }: { draft: Draft; patch: PatchFn }) {
  const { pricing, tax } = draft;

  function setCycle(i: number, p: Partial<Draft["pricing"]["cycles"][0]>) {
    const cycles = pricing.cycles.map((c, j) => (j === i ? { ...c, ...p } : c));
    patch({ pricing: { ...pricing, cycles } });
  }

  const monthly = pricing.cycles.find((c) => c.key === "monthly")?.price ?? 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 p-4">
        <h3 className="mb-3 text-sm font-semibold">💰 Base pricing</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Currency</label>
            <select
              value={pricing.currency}
              onChange={(e) => patch({ pricing: { ...pricing, currency: e.target.value } })}
              className="input"
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Trial Days</label>
            <input
              type="number"
              min={0}
              value={pricing.trialDays}
              onChange={(e) =>
                patch({ pricing: { ...pricing, trialDays: Number(e.target.value) || 0 } })
              }
              className="input"
            />
          </div>
        </div>

        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="py-1">Cycle</th>
              <th className="py-1">Price</th>
              <th className="py-1">Savings</th>
              <th className="py-1 text-center">Active</th>
              <th className="py-1 text-center">Visible</th>
            </tr>
          </thead>
          <tbody>
            {pricing.cycles.map((c, i) => {
              // Compare each cycle's effective monthly cost against the monthly price.
              const months =
                c.key === "monthly" ? 1 : c.key === "quarterly" ? 3 : c.key === "half_yearly" ? 6 : c.key === "annual" ? 12 : 24;
              const saving = monthly > 0 ? monthly * months - c.price : 0;
              return (
                <tr key={c.key} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{c.label}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">₹</span>
                      <input
                        type="number"
                        min={0}
                        value={c.price || ""}
                        placeholder="Set price"
                        onChange={(e) => setCycle(i, { price: Number(e.target.value) || 0 })}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                      />
                    </div>
                  </td>
                  <td className="py-2">
                    {c.active && saving > 0 ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">
                        Save ₹{saving.toLocaleString("en-IN")}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-2 text-center">
                    <div className="flex justify-center">
                      <Toggle checked={c.active} onChange={(v) => setCycle(i, { active: v })} />
                    </div>
                  </td>
                  <td className="py-2 text-center">
                    <div className="flex justify-center">
                      <Toggle checked={c.visible} onChange={(v) => setCycle(i, { visible: v })} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">🧾 Tax — configure GST for India</h3>
          <Toggle checked={tax.apply} onChange={(v) => patch({ tax: { ...tax, apply: v } })} label="Apply tax" />
        </div>

        {tax.apply && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">GST rate (%)</label>
                <input
                  type="number"
                  min={0}
                  value={tax.ratePct}
                  onChange={(e) => patch({ tax: { ...tax, ratePct: Number(e.target.value) || 0 } })}
                  className="input"
                />
                <p className="mt-1 text-xs text-slate-500">Standard GST for SaaS in India is 18%.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Price is</label>
                <div className="mt-1 flex gap-2">
                  {[
                    { v: false, label: "Exclusive of GST" },
                    { v: true, label: "Inclusive of GST" },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => patch({ tax: { ...tax, inclusive: o.v } })}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${
                        tax.inclusive === o.v
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">HSN / SAC Code (optional)</label>
                <input
                  value={tax.hsnSac}
                  onChange={(e) => patch({ tax: { ...tax, hsnSac: e.target.value } })}
                  placeholder="e.g. 998314"
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">GSTIN</label>
                <input
                  value={tax.gstin}
                  onChange={(e) => patch({ tax: { ...tax, gstin: e.target.value } })}
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  className="input"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturesTab({
  draft,
  patch,
  catalog,
}: {
  draft: Draft;
  patch: PatchFn;
  catalog: FeatureGroup[];
}) {
  const [search, setSearch] = useState("");
  const { limits, features, addOns, lifecycle } = draft;

  function setFeature(key: string, on: boolean) {
    patch({ features: { ...features, [key]: on } });
  }
  function setGroup(group: FeatureGroup, on: boolean) {
    const next = { ...features };
    for (const f of group.features) next[f.key] = on;
    patch({ features: next });
  }
  function setAllFeatures(on: boolean) {
    const next = { ...features };
    for (const g of catalog) for (const f of g.features) next[f.key] = on;
    patch({ features: next });
  }

  const term = search.trim().toLowerCase();
  const on = Object.values(features).filter(Boolean).length;
  const total = Object.keys(features).length;

  return (
    <div className="space-y-6">
      {/* Usage limits */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Usage Limits</h3>
        <p className="mb-2 text-xs text-slate-500">
          0 means unlimited. Every limit here is checked by the API, not just the
          screen, so a client cannot go past it by calling the endpoint directly.
        </p>
        <div className="space-y-2">
          <LimitRow
            label="Staff Members"
            hint="Max team members (0 = unlimited)"
            value={limits.maxStaff}
            onChange={(v) => patch({ limits: { ...limits, maxStaff: v } })}
          />
          <LimitRow
            label="Contacts"
            hint="Max contacts stored (0 = unlimited)"
            value={limits.maxContacts}
            onChange={(v) => patch({ limits: { ...limits, maxContacts: v } })}
          />
          {/* Both of these were in the data model and in the API's defaults, but
              had no field here — so an admin could not set them even though the
              plan carried them. */}
          <LimitRow
            label="Pipelines"
            hint="Max pipelines on the board (0 = unlimited)"
            value={limits.maxPipelines}
            onChange={(v) => patch({ limits: { ...limits, maxPipelines: v } })}
          />
          <LimitRow
            label="Email Templates"
            hint="Max templates across all stages (0 = unlimited)"
            value={limits.maxTemplates}
            onChange={(v) => patch({ limits: { ...limits, maxTemplates: v } })}
          />
        </div>

        {/* Saved, but nothing reads them back yet. Shown separately and labelled,
            because a control that looks identical to an enforced one and quietly
            does nothing is how a plan gets sold on a promise the product does not
            keep. */}
        <h3 className="mb-2 mt-5 text-sm font-semibold">
          Not enforced yet{" "}
          <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
            Saved, not applied
          </span>
        </h3>
        <p className="mb-2 text-xs text-slate-500">
          These are stored on the plan and will be honoured once the work behind
          them lands. Setting them changes nothing today.
        </p>
        <div className="space-y-2 opacity-80">
          <div className="rounded-lg border border-slate-200 p-3">
            <label className="mb-1 block text-sm font-medium" htmlFor="plan-email-limit">
              Monthly Email Limit
            </label>
            <p className="mb-1.5 text-xs text-slate-500">
              Needs per-tenant send counting, which arrives with the move off the
              shared mail account.
            </p>
            <input
              id="plan-email-limit"
              type="number"
              min={0}
              value={limits.monthlyEmailLimit}
              onChange={(e) => patch({ limits: { ...limits, monthlyEmailLimit: Number(e.target.value) || 0 } })}
              className="input w-40"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <p className="text-sm font-medium">White Label</p>
              <p className="text-xs text-slate-500">
                Enable white-label branding for this client. Nothing is branded
                per client yet, so there is nothing for this to switch.
              </p>
            </div>
            <Toggle checked={limits.whiteLabel} onChange={(v) => patch({ limits: { ...limits, whiteLabel: v } })} />
          </div>
        </div>
      </div>

      {/* Feature groups */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Client features</h3>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">Total {total}</span>
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">On {on}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">Off {total - on}</span>
          <div className="ml-auto flex items-center gap-2">
            <input
              placeholder="Search features…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-sm"
            />
            <button
              onClick={() => setAllFeatures(false)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
            >
              Disable All
            </button>
            <button
              onClick={() => setAllFeatures(true)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
            >
              Enable All
            </button>
          </div>
        </div>

        <p className="mb-2 text-xs text-slate-500">
          Features marked <span className="rounded bg-emerald-50 px-1 text-emerald-700">live</span>{" "}
          are enforced today — a client without them can&apos;t see or use that section. Others are
          stored on the plan for features as they ship.
        </p>

        <div className="space-y-3">
          {catalog.map((group) => {
            const shown = term
              ? group.features.filter((f) => f.label.toLowerCase().includes(term))
              : group.features;
            if (shown.length === 0) return null;

            const groupOn = group.features.filter((f) => features[f.key]).length;
            const allOn = groupOn === group.features.length;

            return (
              <div key={group.key} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-semibold">{group.label}</span>
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                    {groupOn}/{group.features.length}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-slate-400">All on</span>
                    <Toggle checked={allOn} onChange={(v) => setGroup(group, v)} />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {shown.map((f) => (
                    <div
                      key={f.key}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <Toggle checked={!!features[f.key]} onChange={(v) => setFeature(f.key, v)} />
                      <span className="text-sm">{f.label}</span>
                      {f.enforced && (
                        <span className="ml-auto rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                          live
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add-ons */}
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">📦 Add-ons — Pre-built Templates</h3>
          <Toggle
            checked={addOns.prebuiltTemplates}
            onChange={(v) => patch({ addOns: { ...addOns, prebuiltTemplates: v } })}
          />
        </div>
        {addOns.prebuiltTemplates && (
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ["funnelTemplates", "Funnel Templates"],
              ["emailTemplates", "Email Templates"],
              ["whatsappTemplates", "WhatsApp Templates"],
              ["automationTemplates", "Automation Templates"],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <Toggle
                  checked={addOns[key]}
                  onChange={(v) => patch({ addOns: { ...addOns, [key]: v } })}
                />
                <span className="text-sm">{label}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
          <span className="text-sm font-medium">Custom Themes</span>
          <Toggle checked={addOns.customThemes} onChange={(v) => patch({ addOns: { ...addOns, customThemes: v } })} />
        </div>
      </div>

      {/* Lifecycle */}
      <div className="rounded-xl border border-slate-200 p-3">
        <h3 className="mb-3 text-sm font-semibold">⏱ Lifecycle & grace policy</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Grace Period (days)</label>
            <input
              type="number"
              min={0}
              value={lifecycle.gracePeriodDays}
              onChange={(e) =>
                patch({ lifecycle: { ...lifecycle, gracePeriodDays: Number(e.target.value) || 0 } })
              }
              className="input"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Lock Mode</label>
            <select
              value={lifecycle.lockMode}
              onChange={(e) => patch({ lifecycle: { ...lifecycle, lockMode: e.target.value } })}
              className="input"
            >
              <option value="no_lock">No Lock</option>
              <option value="soft_lock">Soft Lock</option>
              <option value="hard_lock">Hard Lock</option>
            </select>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
          <div>
            <p className="text-sm font-medium">Overdue Policy</p>
            <p className="text-xs text-slate-500">Auto-enforce actions after the grace period</p>
          </div>
          <Toggle
            checked={lifecycle.overduePolicy}
            onChange={(v) => patch({ lifecycle: { ...lifecycle, overduePolicy: v } })}
          />
        </div>
      </div>
    </div>
  );
}

function LimitRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
      />
    </div>
  );
}

function CheckoutTab({
  draft,
  featureCount,
  activeCycles,
}: {
  draft: Draft;
  featureCount: { on: number; total: number };
  activeCycles: number;
}) {
  const currency = draft.pricing.currency === "INR" ? "₹" : draft.pricing.currency + " ";
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Checkout summary</h3>
      <div className="rounded-xl border border-slate-200 p-4 text-sm">
        <Row label="Plan" value={draft.name || "Untitled"} />
        <Row label="Features enabled" value={`${featureCount.on} of ${featureCount.total}`} />
        <Row label="Billing cycles active" value={String(activeCycles)} />
        <Row label="Trial" value={draft.pricing.trialDays > 0 ? `${draft.pricing.trialDays} days` : "None"} />
        <Row
          label="Tax"
          value={draft.tax.apply ? `GST ${draft.tax.ratePct}% (${draft.tax.inclusive ? "inclusive" : "exclusive"})` : "Not applied"}
        />
        <Row label="White label" value={draft.limits.whiteLabel ? "Enabled" : "Disabled"} />
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <p className="mb-2 text-sm font-semibold">Active prices</p>
        <div className="space-y-1 text-sm">
          {draft.pricing.cycles
            .filter((c) => c.active)
            .map((c) => (
              <div key={c.key} className="flex justify-between">
                <span className="text-slate-600">{c.label}</span>
                <span className="font-medium">
                  {currency}
                  {c.price.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          {activeCycles === 0 && <p className="text-slate-400">No active billing cycles.</p>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
