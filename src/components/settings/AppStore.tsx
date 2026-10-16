"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
  Integration,
  IntegrationGroup,
  IntegrationProvider,
  SMTPConnection,
} from "@/lib/types";
import { SMTPManager } from "./SMTPManager";
import { WabaSetupWizard } from "./WabaSetupWizard";

// Providers with a dedicated flow instead of the generic connect dialog.
const CUSTOM_SMTP = "custom_smtp";
const WHATSAPP = "whatsapp";

export function AppStore() {
  /*
   * Every /waba/* route is gated on the "waba" plan feature, but saving the
   * credentials is not. Without this, a client on a plan without WhatsApp could
   * walk the whole wizard and fail at the connection test with "Your plan does
   * not include this feature" — which reads as their Meta details being wrong,
   * sending them back to Meta to fix something that was never broken.
   */
  const { hasFeature } = useAuth();
  const [catalog, setCatalog] = useState<IntegrationGroup[]>([]);
  const [connections, setConnections] = useState<Integration[]>([]);
  const [smtpConns, setSmtpConns] = useState<SMTPConnection[]>([]);
  const [connecting, setConnecting] = useState<IntegrationProvider | null>(null);
  const [wabaSetup, setWabaSetup] = useState<IntegrationProvider | null>(null);
  const [smtpOpen, setSmtpOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  /*
   * Which card is mid-test, and what each test said.
   *
   * Kept per provider rather than as one shared message, so testing a second
   * connection does not wipe the result of the first — the comparison between
   * two providers is exactly what somebody is doing when one of them refuses.
   */
  const [testing, setTesting] = useState("");
  const [tested, setTested] = useState<Record<string, { ok: boolean; message: string }>>({});

  async function load() {
    try {
      const [cat, conns] = await Promise.all([
        api<IntegrationGroup[]>("/integrations/catalog"),
        api<Integration[]>("/integrations"),
      ]);
      setCatalog(cat);
      setConnections(conns);
      // SMTP connections drive the Custom SMTP card's status; a failure here
      // shouldn't break the whole App Store.
      try {
        setSmtpConns(await api<SMTPConnection[]>("/smtp/connections"));
      } catch {
        setSmtpConns([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load integrations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function run() {
      await load();
    }
    run();
  }, []);

  // Fast lookup of a provider's connection state.
  const byProvider = useMemo(() => {
    const m: Record<string, Integration> = {};
    for (const c of connections) m[c.provider] = c;
    return m;
  }, [connections]);

  /*
   * Sends a real email through a stored connection.
   *
   * The result stays on the card instead of going to the page-level error line,
   * because the useful failures name the provider that produced them — an
   * unverified domain is a fact about one connection, not about the page.
   */
  async function sendTest(provider: IntegrationProvider) {
    setTesting(provider.key);
    setTested((t) => ({ ...t, [provider.key]: { ok: false, message: "" } }));
    try {
      const res = await api<{ message: string }>(`/integrations/${provider.key}/test`, {
        method: "POST",
        body: {},
      });
      setTested((t) => ({ ...t, [provider.key]: { ok: true, message: res.message } }));
    } catch (e) {
      setTested((t) => ({
        ...t,
        [provider.key]: {
          ok: false,
          message: e instanceof Error ? e.message : "Test send failed",
        },
      }));
    } finally {
      setTesting("");
    }
  }

  async function disconnect(provider: IntegrationProvider) {
    if (!window.confirm(`Disconnect ${provider.name}? Stored credentials are removed.`)) return;
    try {
      await api(`/integrations/${provider.key}/disconnect`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect");
    }
  }

  const smtpConnected = smtpConns.some((c) => c.isDefault);
  // Counts only connections that actually work, so the number at the top of the
  // page agrees with the badges underneath it.
  const connectedCount =
    connections.filter((c) => c.status === "connected" && c.usable !== false).length +
    (smtpConnected ? 1 : 0);
  const brokenCount = connections.filter(
    (c) => c.status === "connected" && c.usable === false,
  ).length;

  if (loading) return <p className="p-6 text-sm text-slate-500">Loading…</p>;

  // The Custom SMTP provider has its own dedicated manager view.
  if (smtpOpen) {
    return (
      <SMTPManager
        onBack={async () => {
          setSmtpOpen(false);
          await load();
        }}
      />
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        {connectedCount} connected. Connecting stores your API keys encrypted. It
        doesn&apos;t check them against the provider — use <b>Send test</b> on an
        email connection to prove one actually sends.
      </p>

      {brokenCount > 0 && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {brokenCount} connection{brokenCount === 1 ? "" : "s"} can no longer be
          read and {brokenCount === 1 ? "is" : "are"} not working. Enter the keys
          again on the card{brokenCount === 1 ? "" : "s"} below.
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      <div className="space-y-6">
        {catalog.map((group) => (
          <div key={group.key}>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">{group.label}</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.providers.map((p) => {
                const isSmtp = p.key === CUSTOM_SMTP;
                const locked = p.key === WHATSAPP && !hasFeature("waba");
                const conn = byProvider[p.key];
                const connected = isSmtp ? smtpConnected : conn?.status === "connected";
                /*
                 * Connected is not the same as working.
                 *
                 * `status` is a string written once when the keys were saved, and
                 * it keeps saying "connected" after the stored secrets have
                 * stopped being decryptable — most often because JWT_SECRET
                 * changed, since it doubles as the encryption key. The server now
                 * actually opens each connection and reports `usable`, so this
                 * card can stop claiming something it has not checked.
                 *
                 * Without this the App Store said WhatsApp was connected while
                 * WhatsApp Templates said it was not, and both were right.
                 */
                const broken = !isSmtp && connected && conn?.usable === false;
                return (
                  <div key={p.key} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 flex items-start justify-between">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-lg">
                        {p.icon}
                      </span>
                      {p.required && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">
                          Required
                        </span>
                      )}
                    </div>

                    <p className="font-semibold">{p.name}</p>
                    <p className="mt-1 flex-1 text-sm text-slate-500">{p.description}</p>

                    {/* Masked hints for a connected provider. These come from
                        plaintext display hints, which is why they keep rendering
                        perfectly for a connection that no longer works — hence
                        the warning below them rather than trust in them. */}
                    {!isSmtp && connected && conn && (
                      <div className="mt-2 space-y-0.5">
                        {p.fields.map((f) => (
                          <p key={f.key} className="text-xs text-slate-400">
                            {f.label}: <span className="font-mono">{conn.hints[f.key] || "••••"}</span>
                          </p>
                        ))}
                      </div>
                    )}

                    {broken && (
                      <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                        These keys can no longer be read, so anything using this
                        connection will fail. The values above are only a saved
                        preview. Enter the keys again to reconnect.
                      </p>
                    )}

                    {/* What the last test said. The provider's own sentence,
                        which is the difference between a client fixing their
                        domain verification and a client giving up. */}
                    {tested[p.key]?.message && (
                      <p
                        className={`mt-2 rounded-lg px-2.5 py-2 text-xs ${
                          tested[p.key].ok
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {tested[p.key].ok ? "✓ " : ""}
                        {tested[p.key].message}
                      </p>
                    )}

                    {isSmtp && smtpConns.length > 0 && (
                      <p className="mt-2 text-xs text-slate-400">
                        {smtpConns.length} connection{smtpConns.length === 1 ? "" : "s"}
                        {smtpConnected ? " · default set" : ""}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          broken
                            ? "text-amber-600"
                            : connected
                              ? "text-emerald-600"
                              : "text-slate-400"
                        }`}
                        title={
                          broken
                            ? "The saved keys can no longer be read. Enter them again to reconnect."
                            : undefined
                        }
                      >
                        {broken
                          ? "▲ Needs reconnecting"
                          : connected
                            ? "● Connected"
                            : "○ Disconnected"}
                      </span>
                      {locked ? (
                        <span
                          title="Ask your administrator to enable WhatsApp on your plan."
                          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400"
                        >
                          Not in your plan
                        </span>
                      ) : isSmtp ? (
                        <button
                          onClick={() => setSmtpOpen(true)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                            connected
                              ? "border border-slate-300 hover:bg-slate-50"
                              : "bg-blue-600 text-white hover:bg-blue-700"
                          }`}
                        >
                          {connected ? "Manage" : "Set up"}
                        </button>
                      ) : connected ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          {/* Offered even when the saved keys cannot be read:
                              the test is how somebody confirms that reconnecting
                              worked, so hiding it there removes it exactly when
                              it is wanted. */}
                          {p.testable && (
                            <button
                              onClick={() => sendTest(p)}
                              disabled={testing === p.key}
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                            >
                              {testing === p.key ? "Sending…" : "Send test"}
                            </button>
                          )}
                          <button
                            onClick={() => (p.key === WHATSAPP ? setWabaSetup(p) : setConnecting(p))}
                            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
                          >
                            {p.key === WHATSAPP ? "Set up" : "Update"}
                          </button>
                          <button
                            onClick={() => disconnect(p)}
                            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
                          >
                            Disconnect
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => (p.key === WHATSAPP ? setWabaSetup(p) : setConnecting(p))}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          {p.key === WHATSAPP ? "Set up" : "Connect"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {connecting && (
        <ConnectDialog
          provider={connecting}
          onClose={() => setConnecting(null)}
          onConnected={async () => {
            setConnecting(null);
            await load();
          }}
        />
      )}

      {wabaSetup && (
        <WabaSetupWizard
          provider={wabaSetup}
          onClose={() => setWabaSetup(null)}
          onConnected={async () => {
            setWabaSetup(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function ConnectDialog({
  provider,
  onClose,
  onConnected,
}: {
  provider: IntegrationProvider;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(`/integrations/${provider.key}/connect`, {
        method: "POST",
        body: { credentials: values },
      });
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-lg">
            {provider.icon}
          </span>
          <div>
            <h2 className="text-base font-semibold">Connect {provider.name}</h2>
            <p className="text-xs text-slate-500">Credentials are encrypted at rest.</p>
          </div>
        </div>

        <div className="space-y-3">
          {provider.fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-sm font-medium">{f.label}</label>
              <input
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="input font-mono"
              />
            </div>
          ))}

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Connecting…" : "Connect"}
          </button>
        </div>
      </form>
    </div>
  );
}
