#!/usr/bin/env node
// Verifies the plan/entitlement system end to end against a running API:
// an admin creates a restricted plan, assigns it to a client, and the client is
// blocked from disabled features (API 403) while allowed the enabled ones.

const BASE = process.env.API_URL ?? "http://localhost:5000";
const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };

let pass = 0,
  fail = 0;
const fails = [];
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, data };
}

const uniq = () => Math.random().toString(36).slice(2, 8);

async function main() {
  if (!ADMIN.email || !ADMIN.password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD.");
    process.exit(2);
  }
  console.log(`Verifying plans at ${BASE}`);

  const login = await call("/auth/login", { method: "POST", body: ADMIN });
  if (login.status !== 200) {
    console.error("Admin login failed:", login.status, login.data);
    process.exit(1);
  }
  const adminToken = login.data.token;

  // The catalog drives the editor and the enforcement.
  const catalog = await call("/plans/catalog", { token: adminToken });
  check("GET /plans/catalog returns grouped features", Array.isArray(catalog.data) && catalog.data.length > 0);
  const enforcedKeys = catalog.data.flatMap((g) => g.features.filter((f) => f.enforced).map((f) => f.key));
  check("Catalog marks enforced features (pipeline, contacts, email, waba)", ["pipeline", "contacts", "email", "waba"].every((k) => enforcedKeys.includes(k)));

  // Build a feature map: everything on EXCEPT contacts and waba, so we can prove
  // both an allowed and a blocked path.
  const features = {};
  for (const g of catalog.data) for (const f of g.features) features[f.key] = true;
  features.contacts = false;
  features.waba = false;

  const tag = uniq();
  const planReq = {
    name: `Starter ${tag}`,
    features,
    pricing: { currency: "INR", cycles: [{ key: "monthly", label: "Monthly", price: 97, active: true, visible: true }] },
  };
  const plan = await call("/plans", { method: "POST", body: planReq, token: adminToken });
  check("Admin creates a plan", plan.status === 201 && !!plan.data?._id, `status=${plan.status}`);

  // Duplicate name → 409.
  const dup = await call("/plans", { method: "POST", body: planReq, token: adminToken });
  check("Duplicate plan name → 409", dup.status === 409, `status=${dup.status}`);

  // Create a client on this plan.
  const client = {
    name: "Gated Client",
    email: `gated-${tag}@test.local`,
    password: "password123",
    role: "client",
    planId: plan.data._id,
  };
  const created = await call("/auth/users", { method: "POST", body: client, token: adminToken });
  check("Client created with a plan", created.status === 201 && created.data?.planId === plan.data._id, `status=${created.status}`);

  const clientLogin = await call("/auth/login", { method: "POST", body: client });
  const clientToken = clientLogin.data.token;

  // /auth/me reflects the plan's features.
  const me = await call("/auth/me", { token: clientToken });
  check("Client /auth/me returns the plan feature map", me.data?.features && me.data.features.contacts === false && me.data.features.pipeline === true, JSON.stringify(me.data?.features?.contacts));

  // Enforcement: disabled features are blocked, enabled ones allowed.
  const contacts = await call("/contacts", { token: clientToken });
  check("★ Disabled feature (contacts) → 403 for the client", contacts.status === 403, `status=${contacts.status}`);

  const waba = await call("/waba", { token: clientToken });
  check("★ Disabled feature (waba) → 403 for the client", waba.status === 403, `status=${waba.status}`);

  const templates = await call("/templates", { token: clientToken });
  check("Enabled feature (email/templates) → allowed", templates.status === 200, `status=${templates.status}`);

  const pipelines = await call("/pipelines", { token: clientToken });
  check("Shared lookup (GET /pipelines) stays open", pipelines.status === 200, `status=${pipelines.status}`);

  // The admin is never gated.
  const adminContacts = await call("/contacts", { token: adminToken });
  check("Admin is never gated (contacts 200)", adminContacts.status === 200, `status=${adminContacts.status}`);

  // A client with no plan is not gated.
  const freeClient = { name: "Free", email: `free-${tag}@test.local`, password: "password123", role: "client" };
  await call("/auth/users", { method: "POST", body: freeClient, token: adminToken });
  const freeToken = (await call("/auth/login", { method: "POST", body: freeClient })).data.token;
  const freeContacts = await call("/contacts", { token: freeToken });
  check("Client with NO plan is not gated (contacts 200)", freeContacts.status === 200, `status=${freeContacts.status}`);

  // Deleting the plan detaches it from the client, who then falls back to full access.
  await call(`/plans/${plan.data._id}`, { method: "DELETE", token: adminToken });
  const afterDelete = await call("/contacts", { token: clientToken });
  check("Deleting the plan frees the client (contacts 200 again)", afterDelete.status === 200, `status=${afterDelete.status}`);

  console.log(`\n${"─".repeat(56)}\n${pass} passed, ${fail} failed`);
  if (fails.length) {
    console.log("\nFailures:");
    fails.forEach((f) => console.log(`  ✗ ${f}`));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("crashed:", e);
  process.exit(1);
});
