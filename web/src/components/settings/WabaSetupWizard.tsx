"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { IntegrationProvider } from "@/lib/types";

// Deep links into Meta's tooling. These open in a new tab; the user performs the
// task there and pastes the resulting values back into the wizard.
const META_APPS = "https://developers.facebook.com/apps/";
const META_SYSTEM_USERS = "https://business.facebook.com/settings/system-users";
const WA_GET_STARTED = "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started";
const WA_MANAGER = "https://business.facebook.com/wa/manage/";
const META_BILLING = "https://business.facebook.com/billing_hub/accounts";
const WA_PRICING = "https://developers.facebook.com/docs/whatsapp/pricing";

/*
Indicative Indian per-message rates, shown so a client can decide whether to
proceed rather than discover the cost on a Meta invoice later.

Deliberately approximate and labelled as such. Meta sets these, has revised them
more than once, and the figure that matters to a client is the ratio — marketing
costs roughly seven times utility, which is the one choice they control when
writing a template.
*/
const RATES = [
  { category: "Marketing", example: "offers, re-engagement", cost: "~Rs 0.78" },
  { category: "Utility", example: "order and appointment updates", cost: "~Rs 0.11" },
  { category: "Authentication", example: "OTPs", cost: "~Rs 0.12" },
  { category: "Service", example: "your replies within 24h", cost: "Free" },
];

/*
What Meta says about the token itself.

Absent when the introspection call failed, which is a distinct state from "the
token is permanent" and is rendered as such — a client reassured by silence is a
client who never creates the permanent token.
*/
interface TokenReport {
  neverExpires: boolean;
  expiresAt?: string;
  expiresInHours?: number;
  /** Set to "temporary" when the token dies too soon to rely on. */
  warning?: string;
  missingScopes?: string[] | null;
}

interface TestResult {
  ok: boolean;
  phone?: string;
  name?: string;
  message?: string;
  token?: TokenReport | null;
}

const STEPS = ["Create app", "Access token", "IDs", "Add recipient", "Billing", "Test", "Finish"];

export function WabaSetupWizard({
  provider,
  onClose,
  onConnected,
}: {
  provider: IntegrationProvider;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [step, setStep] = useState(0);
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [recipientDone, setRecipientDone] = useState(false);
  // Self-reported, and stays in the wizard rather than being stored: we cannot
  // verify a client's Meta payment method, and a stored claim that we never
  // check would read as verified when it is not.
  const [billingDone, setBillingDone] = useState(false);

  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const last = STEPS.length - 1;

  // Per-step gate on the Next button.
  const canNext = (() => {
    switch (step) {
      case 1:
        return accessToken.trim() !== "";
      case 2:
        return phoneNumberId.trim() !== "" && wabaId.trim() !== "";
      default:
        return true;
    }
  })();

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const res = await api<TestResult>("/waba/verify", {
        method: "POST",
        body: {
          accessToken: accessToken.trim(),
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim(),
        },
      });
      setTest(res);
    } catch (e) {
      setTest({ ok: false, message: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  async function finish() {
    setSaving(true);
    setError("");
    try {
      await api(`/integrations/${provider.key}/connect`, {
        method: "POST",
        body: {
          credentials: {
            accessToken: accessToken.trim(),
            phoneNumberId: phoneNumberId.trim(),
            wabaId: wabaId.trim(),
          },
        },
      });
      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save connection");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
      >
        {/* Header + progress */}
        <div className="border-b border-slate-200 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-lg">
                {provider.icon}
              </span>
              <div>
                <h2 className="text-base font-semibold">Set up WhatsApp</h2>
                <p className="text-xs text-slate-500">
                  Step {step + 1} of {STEPS.length} · {STEPS[step]}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
              ✕
            </button>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-blue-600" : "bg-slate-200"}`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 0 && (
            <StepShell
              title="Create your WhatsApp app on Meta"
              body="You'll create a WhatsApp Business app on Meta for Developers. Open it below, create an app of type Business, then add the WhatsApp product — that gives you a test number to start with."
            >
              <MetaLink href={META_APPS}>Open Meta for Developers</MetaLink>
              <MetaLink href={WA_GET_STARTED} subtle>
                Read the get-started guide
              </MetaLink>
              <Tip>Already have an app with WhatsApp added? Skip ahead with Next.</Tip>
            </StepShell>
          )}

          {step === 1 && (
            <StepShell
              title="Get your access token"
              body="In your app, go to WhatsApp → API Setup and copy the access token. The temporary token expires in ~24h — for a token that never expires, create a System User token instead."
            >
              <MetaLink href={META_APPS}>Open API Setup</MetaLink>
              <MetaLink href={META_SYSTEM_USERS} subtle>
                Create a permanent System User token
              </MetaLink>
              <Field label="Access Token">
                <input
                  type="password"
                  autoComplete="off"
                  className="input font-mono"
                  placeholder="EAAB…"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                />
              </Field>
            </StepShell>
          )}

          {step === 2 && (
            <StepShell
              title="Copy your IDs"
              body="On the same API Setup page, copy the Phone Number ID and the WhatsApp Business Account ID."
            >
              <MetaLink href={META_APPS}>Open API Setup</MetaLink>
              <Field label="Phone Number ID">
                <input
                  className="input font-mono"
                  placeholder="1320723731124362"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                />
              </Field>
              <Field label="WhatsApp Business Account ID">
                <input
                  className="input font-mono"
                  placeholder="1148607454408079"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                />
              </Field>
            </StepShell>
          )}

          {step === 3 && (
            <StepShell
              title="Add a test recipient"
              body="On the test number you can only message numbers you've verified. In API Setup → the 'To' field → Manage phone number list, add and verify your own WhatsApp number so you can receive test messages."
            >
              <MetaLink href={META_APPS}>Open API Setup</MetaLink>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={recipientDone}
                  onChange={(e) => setRecipientDone(e.target.checked)}
                />
                I&apos;ve added and verified my number
              </label>
              <Tip>
                Once you move to a production number with business verification, this restriction goes
                away and you can message anyone.
              </Tip>
            </StepShell>
          )}

          {step === 4 && (
            <StepShell
              title="Add your payment method on Meta"
              body="Meta bills you directly for the messages you send — Arkquen never charges for them and never sees your card. Add a payment method to your WhatsApp Business Account now, or template sending will start failing once your free allowance runs out."
            >
              <MetaLink href={WA_MANAGER}>Open WhatsApp Manager</MetaLink>
              <MetaLink href={META_BILLING} subtle>
                Open Meta billing settings
              </MetaLink>

              <div className="mt-1 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2.5 py-1.5 font-medium">Message type</th>
                      <th className="px-2.5 py-1.5 font-medium">Per message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RATES.map((r) => (
                      <tr key={r.category} className="border-t border-slate-100">
                        <td className="px-2.5 py-1.5">
                          <span className="font-medium">{r.category}</span>
                          <span className="block text-slate-500">{r.example}</span>
                        </td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap font-medium">{r.cost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500">
                Indian rates, approximate. Meta sets them and changes them from time to time — see
                the{" "}
                <a
                  href={WA_PRICING}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-slate-700"
                >
                  current rate card
                </a>
                .
              </p>

              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={billingDone}
                  onChange={(e) => setBillingDone(e.target.checked)}
                />
                I&apos;ve added a payment method to my WhatsApp Business Account
              </label>
              <Tip>
                Replying to a customer within 24 hours of their message is always free. Most of what
                this product does for you costs nothing to send.
              </Tip>
            </StepShell>
          )}

          {step === 5 && (
            <StepShell
              title="Test the connection"
              body="We'll call Meta with your details to confirm they work — without saving anything yet."
            >
              <button
                onClick={runTest}
                disabled={testing || !accessToken || !phoneNumberId}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {testing ? "Testing…" : "Test connection"}
              </button>
              {test?.ok && (
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  ✓ Connected to <span className="font-medium">{test.phone}</span>
                  {test.name ? ` (${test.name})` : ""}
                </div>
              )}
              {/* Shown here rather than only in the summary: this is the last
                  point at which the client is still on Meta's site in another
                  tab and will go back to fix it. */}
              {test?.ok && <TokenNotice token={test.token} />}
              {test && !test.ok && (
                <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  ✗ {test.message || "Connection failed"}
                </div>
              )}
              <Tip>
                A token error here usually means it expired — regenerate it in API Setup and paste the
                new one in step 2.
              </Tip>
            </StepShell>
          )}

          {step === 6 && (
            <StepShell
              title="Finish"
              body="Save the connection. Your credentials are encrypted at rest and used to send WhatsApp templates from your workflows."
            >
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <Row label="Access Token" value={accessToken ? "•••• set" : "— missing"} />
                <Row label="Phone Number ID" value={phoneNumberId || "— missing"} />
                <Row label="Business Account ID" value={wabaId || "— missing"} />
                <Row
                  label="Connection test"
                  value={test?.ok ? "✓ passed" : test ? "✗ failed" : "not tested"}
                />
                <Row label="Access token life" value={tokenSummary(test)} />
                <Row
                  label="Payment method"
                  value={billingDone ? "✓ confirmed" : "— not confirmed"}
                />
              </div>
              {!test?.ok && (
                <Tip>
                  You can save without a passing test, but sending won&apos;t work until the
                  connection is valid.
                </Tip>
              )}
              <TokenNotice token={test?.token} />
              {!billingDone && (
                <Tip>
                  No payment method confirmed. Sending works until your free allowance runs out, then
                  stops — add one in WhatsApp Manager whenever you&apos;re ready.
                </Tip>
              )}
              {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            </StepShell>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-slate-200 p-4">
          <button
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < last ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save & connect"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/*
tokenSummary renders the token's lifetime for the summary table.

Keeps three states apart that it would be easy to collapse into two: we never
asked, we asked and Meta would not say, and we know. Only the third justifies a
claim either way.
*/
function tokenSummary(test?: TestResult | null): string {
  if (!test?.ok) return "not checked";
  if (!test.token) return "couldn't be checked";
  if (test.token.neverExpires) return "✓ permanent";
  const hours = test.token.expiresInHours;
  if (hours === undefined) return "expires — unknown when";
  return `${test.token.warning === "temporary" ? "✗" : "·"} expires in ~${hours}h`;
}

/*
TokenNotice is the warning that a connection which just passed its test is going
to stop working anyway.

Renders nothing when there is nothing to say — including when Meta would not
tell us, because an unprompted "we could not check your token" is alarming
without being actionable.
*/
function TokenNotice({ token }: { token?: TokenReport | null }) {
  if (!token) return null;

  const missing = token.missingScopes ?? [];
  const temporary = token.warning === "temporary";
  if (!temporary && missing.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {temporary && (
        <p>
          <span className="font-medium">
            This token expires in about {token.expiresInHours ?? 24} hours.
          </span>{" "}
          It&apos;s the temporary one from API Setup, so sending will stop tomorrow. Create a System
          User token and paste that in step 2 instead — it doesn&apos;t expire.
        </p>
      )}
      {missing.length > 0 && (
        <p>
          This token is missing {missing.join(" and ")}. Sending may be refused by Meta — add the
          permission where you created the token.
        </p>
      )}
      {temporary && (
        <MetaLink href={META_SYSTEM_USERS} subtle>
          Create a permanent System User token
        </MetaLink>
      )}
    </div>
  );
}

function StepShell({

  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-slate-500">{body}</p>
      {children}
    </div>
  );
}

function MetaLink({
  href,
  subtle,
  children,
}: {
  href: string;
  subtle?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        subtle
          ? "inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
          : "inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
      }
    >
      {children} ↗
    </a>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{children}</p>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-700">{value}</span>
    </div>
  );
}
