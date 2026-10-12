"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAsk } from "@/components/PromptProvider";
import type { SMTPConnection } from "@/lib/types";

// The Custom SMTP detail view: list of a tenant's SMTP connections with add,
// edit, test, set-default, and delete. Reached from the App Store card.
export function SMTPManager({ onBack }: { onBack: () => void }) {
  const ask = useAsk();
  const [conns, setConns] = useState<SMTPConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<SMTPConnection | "new" | null>(null);
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      setConns(await api<SMTPConnection[]>("/smtp/connections"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load SMTP connections");
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

  async function remove(conn: SMTPConnection) {
    if (!window.confirm(`Delete "${conn.displayName}"?`)) return;
    try {
      await api(`/smtp/connections/${conn._id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete connection");
    }
  }

  async function makeDefault(conn: SMTPConnection) {
    try {
      await api(`/smtp/connections/${conn._id}/default`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set default");
    }
  }

  async function test(conn: SMTPConnection) {
    const to = await ask({
      title: "Send a test email",
      label: "Send it to",
      defaultValue: conn.fromEmail,
      type: "email",
      hint: `Sent through "${conn.displayName}". Nothing else is changed.`,
      confirmLabel: "Send test",
      required: true,
    });
    if (to === null) return;
    setNotice("");
    setError("");
    try {
      await api(`/smtp/connections/${conn._id}/test`, { method: "POST", body: { to } });
      setNotice(`Test email sent to ${to.trim() || conn.fromEmail}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test send failed");
    }
  }

  const connected = conns.some((c) => c.isDefault);

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        ← Back to App Store
      </button>

      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-2xl">🗄</span>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Custom SMTP</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Connect any SMTP server for sending emails with your own mail infrastructure.
          </p>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 font-semibold">SMTP Connections</h3>

        {loading ? (
          <p className="p-6 text-center text-sm text-slate-500">Loading…</p>
        ) : conns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center">
            <div className="mx-auto mb-2 text-2xl">🗄</div>
            <p className="text-sm font-medium text-slate-600">No SMTP connections configured</p>
            <p className="mt-1 text-sm text-slate-400">
              Add your SMTP credentials to start sending emails through Custom SMTP.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {conns.map((conn) => (
              <div key={conn._id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{conn.displayName}</p>
                      {conn.isDefault && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {conn.host}:{conn.port} · {conn.encryption.toUpperCase()} · from{" "}
                      {conn.fromEmail}
                    </p>
                    <p className="text-xs text-slate-400">
                      Limits: {conn.dailyLimit}/day · {conn.hourlyLimit}/hr · burst {conn.maxBurst}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!conn.isDefault && (
                      <button
                        onClick={() => makeDefault(conn)}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
                      >
                        Set default
                      </button>
                    )}
                    <button
                      onClick={() => test(conn)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
                    >
                      Send test
                    </button>
                    <button
                      onClick={() => setEditing(conn)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(conn)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setEditing("new")}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add Custom SMTP Connection
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-2 font-semibold">Resources</h3>
        <p className="text-sm text-slate-500">
          Enter your SMTP server details from your email provider (host, port, username, and
          password). Port 587 uses STARTTLS; port 465 uses SSL.
        </p>
        {/* Said here as well as in the error, because reading it first saves the
            round trip. 465 is the port hosting providers block most often, and a
            blocked port times out silently rather than refusing. */}
        <p className="mt-2 text-sm text-slate-500">
          <span className="font-medium text-slate-700">Use port 587 if you can.</span>{" "}
          Many hosting providers block outgoing connections on port 465 to prevent
          spam, and a blocked port shows up as a connection timeout rather than a
          clear refusal.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          For Gmail or Google Workspace your normal account password will not
          work — create an App Password in your Google security settings and use
          that as the password here.
        </p>
      </div>

      {editing && (
        <SMTPDialog
          conn={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

const EMPTY = {
  displayName: "Custom SMTP",
  host: "",
  port: 587,
  username: "",
  password: "",
  encryption: "tls" as const,
  fromEmail: "",
  fromName: "",
  replyTo: "",
  dailyLimit: 500,
  hourlyLimit: 100,
  maxBurst: 20,
  isDefault: false,
};

function SMTPDialog({
  conn,
  onClose,
  onSaved,
}: {
  conn: SMTPConnection | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() =>
    conn
      ? {
          displayName: conn.displayName,
          host: conn.host,
          port: conn.port,
          username: conn.username,
          password: "", // blank keeps the stored one
          encryption: conn.encryption,
          fromEmail: conn.fromEmail,
          fromName: conn.fromName,
          replyTo: conn.replyTo,
          dailyLimit: conn.dailyLimit,
          hourlyLimit: conn.hourlyLimit,
          maxBurst: conn.maxBurst,
          isDefault: conn.isDefault,
        }
      : { ...EMPTY },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (conn) {
        await api(`/smtp/connections/${conn._id}`, { method: "PUT", body: form });
      } else {
        await api("/smtp/connections", { method: "POST", body: form });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save connection");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {conn ? "Edit SMTP Connection" : "Add Custom SMTP Connection"}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Display Name">
            <input className="input" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Host">
              <input className="input" value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.example.com" />
            </Field>
            <Field label="Port">
              <input type="number" className="input" value={form.port} onChange={(e) => set("port", Number(e.target.value) || 0)} placeholder="587" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Username">
              <input className="input" value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="user@example.com" autoComplete="off" />
            </Field>
            <Field label={conn?.hasPassword ? "Password (leave blank to keep)" : "Password"}>
              <input type="password" className="input" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </Field>
          </div>

          <Field label="Encryption">
            <select className="input" value={form.encryption} onChange={(e) => set("encryption", e.target.value as typeof form.encryption)}>
              <option value="tls">TLS (STARTTLS, port 587)</option>
              <option value="ssl">SSL (implicit TLS, port 465)</option>
              <option value="none">None</option>
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From Email">
              <input className="input" value={form.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} placeholder="noreply@yourdomain.com" />
            </Field>
            <Field label="From Name">
              <input className="input" value={form.fromName} onChange={(e) => set("fromName", e.target.value)} placeholder="My Brand" />
            </Field>
          </div>

          <Field label="Reply-To Email (optional)">
            <input className="input" value={form.replyTo} onChange={(e) => set("replyTo", e.target.value)} placeholder="support@yourdomain.com" />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Daily Limit">
              <input type="number" className="input" value={form.dailyLimit} onChange={(e) => set("dailyLimit", Number(e.target.value) || 0)} />
            </Field>
            <Field label="Hourly Limit">
              <input type="number" className="input" value={form.hourlyLimit} onChange={(e) => set("hourlyLimit", Number(e.target.value) || 0)} />
            </Field>
            <Field label="Max Burst">
              <input type="number" className="input" value={form.maxBurst} onChange={(e) => set("maxBurst", Number(e.target.value) || 0)} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => set("isDefault", e.target.checked)} />
            Set as default SMTP
          </label>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving…" : conn ? "Save Changes" : "Add Connection"}
          </button>
        </div>
      </form>
    </div>
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
