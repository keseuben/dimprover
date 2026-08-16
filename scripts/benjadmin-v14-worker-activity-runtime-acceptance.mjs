#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}

const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const marker = `V14-WORKER-ACTIVITY-${Date.now()}`;
const rawSecret = `supersecretvalue-${Date.now()}-0123456789`;
let passed = 0;
function check(name, ok, detail = "") { if (!ok) throw new Error(`${name}${detail ? ` :: ${detail}` : ""}`); passed += 1; console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`); }
const headers = { host, "x-dimpro-license-admin-key": key, "content-type": "application/json" };
async function api(path, method = "GET", body, authenticated = true) {
  const requestHeaders = authenticated ? headers : { host, "content-type": "application/json" };
  const response = await fetch(`${apiBase}${path}`, { method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
async function cleanup() {
  await db.from("dev_center_live_worklog").delete().like("summary", `${marker}%`);
}

try {
  let r = await api("/api/dev/console/activity", "POST", { workerCode: "ARMINAI", phase: "coding", summary: `${marker} coding`, detail: "Drive komponens módosítása", projectId: "project_dimprover", progressPercent: 24 }, false);
  check("Unauth worker activity denied", r.response.status === 401, `status=${r.response.status}`);

  r = await api("/api/dev/console/activity", "POST", { workerCode: "UNKNOWN", phase: "coding", summary: `${marker} invalid` });
  check("Unknown worker denied", r.response.status === 400, `status=${r.response.status}`);

  r = await api("/api/dev/console/activity", "POST", { workerCode: "ARMINAI", phase: "coding", summary: `${marker} coding`, detail: "Drive komponens módosítása", projectId: "project_dimprover", progressPercent: 24 });
  check("Coding activity accepted", r.response.status === 201 && r.payload?.message?.kind === "CODE_ACTIVITY", JSON.stringify({ status: r.response.status, kind: r.payload?.message?.kind }));
  check("Coding progress preserved", r.payload?.message?.progressPercent === 24, String(r.payload?.message?.progressPercent));

  r = await api("/api/dev/console/activity", "POST", { workerCode: "ARMINAI", phase: "file-change", summary: `${marker} file`, filePath: ".env.local", diffSummary: "+12 / -3", projectId: "project_dimprover" });
  check("Sensitive path activity accepted sanitized", r.response.status === 201 && r.payload?.sanitized === true, JSON.stringify(r.payload));
  check("Sensitive file path masked in response", r.payload?.message?.metadata?.filePath === "[ÉRZÉKENY ÚTVONAL MASZKOLVA]", String(r.payload?.message?.metadata?.filePath));

  r = await api("/api/dev/console/activity", "POST", { workerCode: "JAZMINAI", phase: "terminal", summary: `${marker} secret`, detail: `api_key="${rawSecret}"`, command: `token="${rawSecret}" npm run test`, projectId: "project_dimprover" });
  check("Secret-bearing activity sanitized", r.response.status === 201 && r.payload?.sanitized === true, JSON.stringify({ status: r.response.status, findings: r.payload?.sensitiveFindings }));
  check("Raw secret absent from API response", !JSON.stringify(r.payload).includes(rawSecret));

  const helperPayload = { workerCode: "ARMINAI", phase: "diff", summary: `${marker} helper`, diffSummary: "+48 / -12", projectId: "project_dimprover", progressPercent: 41 };
  const helper = spawnSync(process.execPath, ["scripts/benjadmin-worker-activity.mjs"], {
    cwd: process.cwd(),
    input: JSON.stringify(helperPayload),
    encoding: "utf8",
    env: { ...process.env, DIMPRO_PROJECT_ROOT: process.cwd(), BENJADMIN_ACTIVITY_BASE_URL: apiBase, BENJADMIN_ACTIVITY_HOST: host },
  });
  check("Worker helper stdin post succeeds", helper.status === 0, `status=${helper.status} stderr=${helper.stderr.trim()}`);
  const helperResult = JSON.parse(helper.stdout.trim() || "{}");
  check("Worker helper returns DIFF message", helperResult.ok === true && helperResult.kind === "DIFF", helper.stdout.trim());

  const deniedHelper = spawnSync(process.execPath, ["scripts/benjadmin-worker-activity.mjs"], {
    cwd: process.cwd(),
    input: JSON.stringify(helperPayload),
    encoding: "utf8",
    env: { ...process.env, DIMPRO_PROJECT_ROOT: process.cwd(), BENJADMIN_ACTIVITY_BASE_URL: apiBase, BENJADMIN_ACTIVITY_HOST: "admin.dimpro.hu" },
  });
  check("Worker helper non-DEV host fails closed", deniedHelper.status === 78, `status=${deniedHelper.status}`);

  const yesterday = new Date(Date.now() - 26 * 3600000).toISOString();
  const tenDays = new Date(Date.now() - 10 * 86400000).toISOString();
  const inserted = await db.from("dev_center_live_worklog").insert([
    { worker_code: "ARMINAI", task_id: null, phase: "coding", level: "info", summary: `${marker} yesterday`, detail: "", progress_percent: 15, source: "worker-activity", metadata: { kind: "CODE_ACTIVITY", projectId: "project_dimprover", productionAccess: "DENY" }, created_at: yesterday },
    { worker_code: "JAZMINAI", task_id: null, phase: "test", level: "success", summary: `${marker} week`, detail: "", progress_percent: 100, source: "worker-activity", metadata: { kind: "TEST_RESULT", projectId: "project_dimprover", productionAccess: "DENY" }, created_at: tenDays },
  ]).select("id");
  check("Historical archive fixtures inserted", !inserted.error && (inserted.data || []).length === 2, inserted.error?.message || "");

  const before = encodeURIComponent(new Date(Date.now() - 1 * 3600000).toISOString());
  r = await api(`/api/dev/console/messages?limit=120&before=${before}`);
  check("Cursor history GET succeeds", r.response.status === 200 && r.payload?.page?.before, `status=${r.response.status}`);
  check("Cursor history returns yesterday fixture", (r.payload?.messages || []).some((item) => item.summary === `${marker} yesterday`), `messages=${(r.payload?.messages || []).length}`);
  check("Cursor page exposes oldest/newest metadata", typeof r.payload?.page?.oldestAt === "string" && typeof r.payload?.page?.newestAt === "string", JSON.stringify(r.payload?.page));

  const stored = await db.from("dev_center_live_worklog").select("summary,detail,source,metadata,progress_percent").like("summary", `${marker}%`).order("created_at", { ascending: true });
  check("Worker activity rows persisted", !stored.error && (stored.data || []).length >= 6, `rows=${(stored.data || []).length}`);
  check("All worker activity rows deny PROD", (stored.data || []).every((row) => row.metadata?.productionAccess === "DENY"), JSON.stringify((stored.data || []).map((row) => row.metadata?.productionAccess)));
  check("Raw secret absent from persisted rows", !JSON.stringify(stored.data || []).includes(rawSecret));

  console.log(JSON.stringify({ ok: true, passed, failed: 0, marker }, null, 2));
} finally {
  await cleanup();
}
