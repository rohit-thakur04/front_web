#!/usr/bin/env node
/**
 * End-to-end verification of the §12 definition of done.
 *
 * Run the API with a short interval so the sequence can be exercised in seconds:
 *   EMAIL_DRY_RUN=true EMAIL_INTERVAL_HOURS=0.003 go run ./cmd/api
 * then:
 *   node verify.mjs
 *
 * It creates two throwaway accounts and their data, and cleans up its pipelines
 * at the end.
 */

const BASE = process.env.API_URL ?? "http://localhost:5000";
const INTERVAL_HOURS = Number(process.env.EMAIL_INTERVAL_HOURS ?? 0.003);
const INTERVAL_MS = INTERVAL_HOURS * 3600_000;

const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uniq = () => Math.random().toString(36).slice(2, 8);

async function main() {
  if (!ADMIN.email || !ADMIN.password) {
    console.error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD to an existing admin account.\n" +
        "Create one with:  go run ./cmd/api create-user -name Admin -email a@b.com -password secret123 -role admin",
    );
    process.exit(2);
  }

  console.log(`Verifying ${BASE} (interval ${INTERVAL_HOURS}h = ${INTERVAL_MS / 1000}s)`);

  // --- Auth -----------------------------------------------------------------
  section("§12.1  Auth");

  const noToken = await call("/pipelines");
  check("GET /api/pipelines without a token → 401", noToken.status === 401, `got ${noToken.status}`);

  const badPass = await call("/auth/login", {
    method: "POST",
    body: { email: ADMIN.email, password: "definitely-wrong" },
  });
  check("Login with a bad password → 401", badPass.status === 401, `got ${badPass.status}`);

  const adminLogin = await call("/auth/login", { method: "POST", body: ADMIN });
  check("Login works", adminLogin.status === 200 && !!adminLogin.data?.token, `got ${adminLogin.status}`);
  if (adminLogin.status !== 200) {
    console.error("\nCannot continue without an admin session.");
    process.exit(1);
  }
  const adminToken = adminLogin.data.token;

  // Two tenants to prove isolation.
  const tag = uniq();
  const userA = { name: "Tenant A", email: `a-${tag}@test.local`, password: "password123", role: "client" };
  const userB = { name: "Tenant B", email: `b-${tag}@test.local`, password: "password123", role: "client" };

  await call("/auth/users", { method: "POST", body: userA, token: adminToken });
  await call("/auth/users", { method: "POST", body: userB, token: adminToken });

  const tokenA = (await call("/auth/login", { method: "POST", body: userA })).data.token;
  const tokenB = (await call("/auth/login", { method: "POST", body: userB })).data.token;

  // --- Multi-tenancy --------------------------------------------------------
  section("§12.2  Multi-tenancy");

  const pipeA = (await call("/pipelines", { method: "POST", body: { name: "A's pipeline" }, token: tokenA })).data;
  const listB = await call("/pipelines", { token: tokenB });
  check(
    "User B sees none of user A's pipelines",
    Array.isArray(listB.data) && listB.data.every((p) => p._id !== pipeA._id),
    `B saw ${listB.data?.length ?? "?"}`,
  );

  const crossRead = await call(`/pipelines/${pipeA._id}`, { token: tokenB });
  check(
    "B fetching A's record by id → 404 (not 403, so existence isn't leaked)",
    crossRead.status === 404,
    `got ${crossRead.status}`,
  );

  // --- Admin guard ----------------------------------------------------------
  section("§12.3  Admin guard");

  const clientCreatesUser = await call("/auth/users", {
    method: "POST",
    body: { name: "X", email: `x-${uniq()}@test.local`, password: "password123", role: "client" },
    token: tokenB,
  });
  check("A client calling POST /api/auth/users → 403", clientCreatesUser.status === 403, `got ${clientCreatesUser.status}`);

  // --- Board ----------------------------------------------------------------
  section("§12.4  Board");

  const board = (await call(`/pipelines/${pipeA._id}`, { token: tokenA })).data;
  check("New pipeline seeds 4 default stages", board.stages?.length === 4, `got ${board.stages?.length}`);
  check(
    "Stage positions are contiguous from 0",
    board.stages.every((s, i) => s.position === i),
    board.stages.map((s) => s.position).join(","),
  );

  const reordered = [...board.stages].reverse().map((s) => s._id);
  await call("/stages/reorder", { method: "PUT", body: { stageIds: reordered }, token: tokenA });
  const afterReorder = (await call(`/pipelines/${pipeA._id}`, { token: tokenA })).data;
  check(
    "Column reorder persists and stays contiguous",
    afterReorder.stages.every((s, i) => s.position === i && s._id === reordered[i]),
  );

  // --- Automation -----------------------------------------------------------
  section("§12.5  Automation (the core)");

  const stage1 = afterReorder.stages[0];
  const stage2 = afterReorder.stages[1];

  // Three templates on stage 1, one on stage 2.
  for (const day of [1, 2, 3]) {
    await call("/templates", {
      method: "POST",
      body: {
        name: `Day ${day}`,
        subject: `Day ${day} for {{name}}`,
        fromName: "Sales",
        content: `<p>Hello {{name}}, this is day ${day}.</p>`,
        dayNumber: day,
        stageId: stage1._id,
      },
      token: tokenA,
    });
  }
  await call("/templates", {
    method: "POST",
    body: { name: "S2 Day 1", subject: "Stage 2", fromName: "Sales", content: "<p>Hi</p>", dayNumber: 1, stageId: stage2._id },
    token: tokenA,
  });

  const card = (
    await call("/cards", {
      method: "POST",
      body: { name: "Ada Lovelace", email: "ada@test.local", phone: "+911234567890", value: 50000, stageId: stage1._id },
      token: tokenA,
    })
  ).data;

  // The on-entry send is fire-and-forget, so give the goroutine a beat.
  await sleep(1500);

  const progressOf = async (cardId, stageId) => {
    const res = await call(`/automation/board/${pipeA._id}`, { token: tokenA });
    return res.data.progress.find((p) => p.cardId === cardId && p.stageId === stageId);
  };

  let p = await progressOf(card._id, stage1._id);
  check("Day 1 sends immediately on entry → currentDay=1", p?.currentDay === 1, `currentDay=${p?.currentDay}`);
  check("Progress is active", p?.status === "active", `status=${p?.status}`);

  // Before the interval, nothing is due — this is the duplicate-send guard.
  const early = await call("/automation/trigger-check", { method: "POST", token: tokenA });
  check("trigger-check BEFORE the interval sends nothing", early.data?.processed === 0, `processed=${early.data?.processed}`);
  p = await progressOf(card._id, stage1._id);
  check("…and currentDay is still 1", p?.currentDay === 1, `currentDay=${p?.currentDay}`);

  // After the interval, the next day goes out.
  await sleep(INTERVAL_MS + 1500);
  await call("/automation/trigger-check", { method: "POST", token: tokenA });
  await sleep(500);
  p = await progressOf(card._id, stage1._id);
  check("trigger-check AFTER the interval → day 2", p?.currentDay === 2, `currentDay=${p?.currentDay}`);

  // Leaving preserves currentDay.
  await call(`/cards/${card._id}/move`, { method: "PUT", body: { stageId: stage2._id }, token: tokenA });
  await sleep(1000);
  p = await progressOf(card._id, stage1._id);
  check("Moving away → old progress stopped", p?.status === "stopped", `status=${p?.status}`);
  check("…and currentDay is preserved at 2", p?.currentDay === 2, `currentDay=${p?.currentDay}`);

  // THE key test: returning resumes rather than restarting.
  await call(`/cards/${card._id}/move`, { method: "PUT", body: { stageId: stage1._id }, token: tokenA });
  await sleep(1500);
  p = await progressOf(card._id, stage1._id);
  check(
    "★ Moving BACK resumes at day 3, NOT day 1",
    p?.currentDay === 3,
    `currentDay=${p?.currentDay} (1 would mean it restarted)`,
  );
  check("…and is active again", p?.status === "active", `status=${p?.status}`);

  // Day 4 doesn't exist → completed.
  await sleep(INTERVAL_MS + 1500);
  await call("/automation/trigger-check", { method: "POST", token: tokenA });
  await sleep(500);
  p = await progressOf(card._id, stage1._id);
  check("No template for the next day → completed", p?.status === "completed", `status=${p?.status}`);
  check("…and currentDay stays at the last sent day (3)", p?.currentDay === 3, `currentDay=${p?.currentDay}`);

  // Exactly one record per (card, stage).
  const boardAuto = await call(`/automation/board/${pipeA._id}`, { token: tokenA });
  const forCardStage = boardAuto.data.progress.filter((x) => x.cardId === card._id && x.stageId === stage1._id);
  check("Exactly ONE progress record per (card, stage)", forCardStage.length === 1, `found ${forCardStage.length}`);

  // Audit trail.
  const logs = (await call(`/automation/logs?cardId=${card._id}`, { token: tokenA })).data;
  const stage1Actions = logs
    .filter((l) => l.stageId === stage1._id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((l) => l.action);
  const expected = ["entered", "sent", "sent", "stopped", "entered", "sent", "completed"];
  check(
    `Audit trail reads ${expected.join(" → ")}`,
    JSON.stringify(stage1Actions) === JSON.stringify(expected),
    stage1Actions.join(" → "),
  );

  // --- Import ---------------------------------------------------------------
  section("§12.6  CSV import");

  const importRows = [
    { name: "Grace Hopper", email: "grace@test.local", phone: "1", value: 50000 },
    { name: "Alan Turing", email: "alan@test.local", phone: "2", value: 1200 },
  ];

  const imp1 = await call("/contacts/import", {
    method: "POST",
    body: { pipelineId: pipeA._id, stageId: stage1._id, rows: importRows },
    token: tokenA,
  });
  check("Default import creates the contacts", imp1.data?.created === 2, `created=${imp1.data?.created}`);

  const autoAfterImport = await call(`/automation/board/${pipeA._id}`, { token: tokenA });
  const importedIds = (await call(`/cards?stageId=${stage1._id}`, { token: tokenA })).data
    .filter((c) => c.email === "grace@test.local" || c.email === "alan@test.local")
    .map((c) => c._id);
  const importedProgress = autoAfterImport.data.progress.filter((x) => importedIds.includes(x.cardId));
  check(
    "★ Default import creates ZERO automation records (no email blast)",
    importedProgress.length === 0,
    `found ${importedProgress.length}`,
  );

  // Re-importing the same emails is a no-op.
  const imp2 = await call("/contacts/import", {
    method: "POST",
    body: { pipelineId: pipeA._id, stageId: stage1._id, rows: importRows },
    token: tokenA,
  });
  check("Duplicate emails are skipped", imp2.data?.skipped === 2, `skipped=${imp2.data?.skipped}`);

  // Bad rows are reported by row number.
  const imp3 = await call("/contacts/import", {
    method: "POST",
    body: {
      pipelineId: pipeA._id,
      stageId: stage1._id,
      rows: [{ name: "", email: "blank@test.local" }],
    },
    token: tokenA,
  });
  check("Rows missing a name are reported by row number", imp3.data?.errors?.[0]?.row === 2, JSON.stringify(imp3.data?.errors));

  // Opt-in import DOES start automation.
  const imp4 = await call("/contacts/import", {
    method: "POST",
    body: {
      pipelineId: pipeA._id,
      stageId: stage1._id,
      rows: [{ name: "Katherine Johnson", email: "katherine@test.local", value: 0 }],
      startAutomation: true,
    },
    token: tokenA,
  });
  await sleep(1500);
  const kId = (await call(`/cards?stageId=${stage1._id}`, { token: tokenA })).data.find(
    (c) => c.email === "katherine@test.local",
  )?._id;
  const kProgress = (await call(`/automation/board/${pipeA._id}`, { token: tokenA })).data.progress.find(
    (x) => x.cardId === kId,
  );
  check("Opt-in import DOES create automation", !!kProgress && imp4.data?.created === 1, `progress=${!!kProgress}`);

  const grace = (await call(`/contacts?pipelineId=${pipeA._id}&search=Grace`, { token: tokenA })).data;
  check("₹50,000 imported as the number 50000", grace.contacts?.[0]?.value === 50000, `value=${grace.contacts?.[0]?.value}`);
  check(
    "Contact summary reflects the current filter",
    grace.summary?.totalContacts === grace.contacts.length,
    `summary=${grace.summary?.totalContacts} rows=${grace.contacts?.length}`,
  );

  // --- WABA -----------------------------------------------------------------
  section("§12.7  WABA");

  const gapped = await call("/waba", {
    method: "POST",
    body: { name: `gap_${tag}`, category: "MARKETING", body: "Hi {{1}}, see {{3}}" },
    token: tokenA,
  });
  check("Body with {{1}},{{3}} → 400", gapped.status === 400, `got ${gapped.status}: ${gapped.data?.message}`);

  const wt = (
    await call("/waba", {
      method: "POST",
      body: {
        name: `welcome_${tag}`,
        category: "MARKETING",
        language: "en_US",
        body: "Hi {{1}}, thanks for your interest in {{2}}!",
        variableSamples: [],
        variableMap: ["name", "custom"],
      },
      token: tokenA,
    })
  ).data;
  check("Valid template saves as DRAFT", wt?.status === "DRAFT", `status=${wt?.status}`);

  const noSamples = await call(`/waba/${wt._id}/submit`, { method: "POST", token: tokenA });
  check("Submit without samples → 400", noSamples.status === 400, `got ${noSamples.status}`);

  await call(`/waba/${wt._id}`, {
    method: "PUT",
    body: {
      name: wt.name,
      category: "MARKETING",
      language: "en_US",
      body: wt.body,
      variableSamples: ["Ada", "our villas"],
      variableMap: ["name", "custom"],
    },
    token: tokenA,
  });
  const submitted = await call(`/waba/${wt._id}/submit`, { method: "POST", token: tokenA });
  check("Submit with samples (dry-run) → PENDING", submitted.data?.status === "PENDING", `status=${submitted.data?.status}`);

  const test = await call(`/waba/${wt._id}/send-test`, { method: "POST", body: { cardId: card._id }, token: tokenA });
  check(
    "★ Send-test with cardId resolves {{1}} to the card's name",
    test.data?.variables?.[0] === "Ada Lovelace",
    `variables=${JSON.stringify(test.data?.variables)}`,
  );
  check("…and defaults the phone to the card's number", test.data?.to === "+911234567890", `to=${test.data?.to}`);

  // --- Cleanup --------------------------------------------------------------
  await call(`/pipelines/${pipeA._id}`, { method: "DELETE", token: tokenA });

  // --- Report ---------------------------------------------------------------
  console.log(`\n${"─".repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nVerification crashed:", err);
  process.exit(1);
});
