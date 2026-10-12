"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Button, EmptyState, Panel } from "@/components/kit";

type DomainStatus = "pending" | "verified" | "failed";
type DomainUse = "sites" | "links" | "both";

interface Domain {
  _id: string;
  host: string;
  use: DomainUse;
  status: DomainStatus;
  detail: string;
  verifyToken: string;
  lastCheckedAt?: string | null;
  verifiedAt?: string | null;
}

interface DomainsResponse {
  domains: Domain[];
  /** The host a CNAME should point at. Empty means the platform has none set. */
  target: string;
  txtName: string;
}

const USE_LABEL: Record<DomainUse, string> = {
  sites: "Landing pages",
  links: "Short links",
  both: "Pages and links",
};

/*
Custom domains.

Everything customer-facing is served from a platform host today, and a
railway.app address in a WhatsApp message is a common phishing signal — so
previews and click-through suffer. The short-link host is also shared across
every account, which means one client's spam complaint can hurt deliverability
for all of them.

The screen's real job is DNS, which is the part people get wrong. So the two
records are shown exactly as they must be typed, each with its own copy button,
and every failure names the specific problem rather than saying "verification
failed" — which is the message that generates a support request every time.
*/
export function DomainManager() {
  const [data, setData] = useState<DomainsResponse | null>(null);
  const [host, setHost] = useState("");
  const [use, setUse] = useState<DomainUse>("both");
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function load() {
    try {
      setData(await api<DomainsResponse>("/domains"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load domains");
    }
  }

  useEffect(() => {
    async function run() {
      await load();
    }
    void run();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError("");
    try {
      await api("/domains", { method: "POST", body: { host, use } });
      setHost("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that domain");
    } finally {
      setAdding(false);
    }
  }

  async function verify(domain: Domain) {
    setChecking(domain._id);
    setError("");
    try {
      await api(`/domains/${domain._id}/verify`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check DNS");
    } finally {
      setChecking("");
    }
  }

  async function remove(domain: Domain) {
    if (!window.confirm(`Disconnect ${domain.host}? Anything served on it stops working.`)) {
      return;
    }
    setError("");
    try {
      await api(`/domains/${domain._id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove that domain");
    }
  }

  async function copy(text: string, which: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      // Clipboard needs a secure context; the value is selectable by hand.
    }
  }

  if (!data) {
    return (
      <Panel>
        <p className="text-sm text-[var(--ark-ink-3)]">Loading domains…</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Connect a domain"
        description="Serve your landing pages and short links on your own name instead of a platform address."
      >
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            required
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="go.yourbusiness.com"
            className="input"
          />
          <select
            value={use}
            onChange={(e) => setUse(e.target.value as DomainUse)}
            className="input w-auto"
          >
            <option value="both">Pages and links</option>
            <option value="sites">Landing pages only</option>
            <option value="links">Short links only</option>
          </select>
          <Button tone="primary" busy={adding} type="submit">
            Add domain
          </Button>
        </form>

        <p className="mt-2 text-xs text-[var(--ark-ink-3)]">
          {/* Said before they type, because picking an apex is the decision
              that costs an afternoon and cannot be undone by retrying. */}
          A subdomain works everywhere. A root domain like yourbusiness.com needs
          an ALIAS or ANAME record, which not every DNS provider offers.
        </p>

        {!data.target && (
          <p className="mt-2 rounded-[var(--ark-r-md)] bg-[var(--ark-warn-soft)] px-3 py-2 text-sm text-[var(--ark-warn-ink)]">
            This platform has no custom-domain target configured, so a domain
            added here cannot be verified yet.
          </p>
        )}
      </Panel>

      {error && (
        <p className="rounded-[var(--ark-r-md)] bg-[var(--ark-danger-soft)] px-3 py-2 text-sm text-[var(--ark-danger-ink)]">
          {error}
        </p>
      )}

      {data.domains.length === 0 ? (
        <Panel flush>
          <EmptyState
            title="No domains connected"
            body="Your pages and links are served on the platform address. A domain of your own gets better click-through, and keeps your link reputation separate from every other account."
          />
        </Panel>
      ) : (
        data.domains.map((d) => (
          <Panel
            key={d._id}
            title={d.host}
            description={USE_LABEL[d.use]}
            actions={
              <>
                <Badge
                  tone={
                    d.status === "verified" ? "ok" : d.status === "failed" ? "danger" : "warn"
                  }
                >
                  {d.status === "verified"
                    ? "DNS verified"
                    : d.status === "failed"
                      ? "Needs attention"
                      : "Waiting for DNS"}
                </Badge>
                <Button
                  size="sm"
                  busy={checking === d._id}
                  onClick={() => verify(d)}
                >
                  Check DNS
                </Button>
                <Button tone="danger" size="sm" onClick={() => remove(d)}>
                  Remove
                </Button>
              </>
            }
          >
            {d.detail && (
              <p className="mb-3 text-sm text-[var(--ark-ink-2)]">{d.detail}</p>
            )}

            {d.status !== "verified" && (
              <>
                <p className="mb-2 text-[13px] font-medium">
                  Create these two records with your DNS provider
                </p>
                <div className="space-y-2">
                  {/* Both records, exactly as they must be typed. The TXT
                      proves control of the zone; the CNAME is what actually
                      routes traffic. Checking only the second would let
                      somebody connect a domain that happens to point here. */}
                  <Record
                    label="1. Proves the domain is yours"
                    type="TXT"
                    name={`${data.txtName}.${d.host}`}
                    value={d.verifyToken}
                    copied={copied}
                    onCopy={copy}
                    id={`txt-${d._id}`}
                  />
                  <Record
                    label="2. Sends visitors here"
                    type="CNAME"
                    name={d.host}
                    value={data.target || "not configured"}
                    copied={copied}
                    onCopy={copy}
                    id={`cname-${d._id}`}
                  />
                </div>
                <p className="mt-2 text-xs text-[var(--ark-ink-3)]">
                  DNS usually updates within a few minutes, and can take up to an
                  hour. Press Check DNS when you have added them.
                </p>
              </>
            )}

            {d.status === "verified" && (
              <p className="text-sm text-[var(--ark-ink-2)]">
                {/* Deliberately not claiming it is live. A domain reported as
                    live before its certificate exists sends a client's traffic
                    to a browser security warning. */}
                DNS is correct. HTTPS is issued separately — the domain begins
                serving once its certificate is ready.
              </p>
            )}
          </Panel>
        ))
      )}
    </div>
  );
}

/** One DNS record, laid out so it can be copied field by field. */
function Record({
  label,
  type,
  name,
  value,
  copied,
  onCopy,
  id,
}: {
  label: string;
  type: string;
  name: string;
  value: string;
  copied: string;
  onCopy: (text: string, which: string) => void;
  id: string;
}) {
  return (
    <div className="rounded-[var(--ark-r-md)] border border-[var(--ark-line)] p-2.5">
      <p className="mb-1.5 text-xs text-[var(--ark-ink-3)]">{label}</p>
      <div className="grid gap-2 sm:grid-cols-[70px_1fr_auto]">
        <span className="rounded-[var(--ark-r-sm)] bg-[var(--ark-surface-2)] px-2 py-1 text-center text-xs font-semibold">
          {type}
        </span>
        <div className="min-w-0 space-y-1">
          <code className="block truncate font-mono text-xs" title={name}>
            {name}
          </code>
          <code
            className="block truncate font-mono text-xs text-[var(--ark-ink-3)]"
            title={value}
          >
            {value}
          </code>
        </div>
        <Button size="sm" onClick={() => onCopy(value, id)}>
          {copied === id ? "Copied" : "Copy value"}
        </Button>
      </div>
    </div>
  );
}
