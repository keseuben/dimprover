#!/usr/bin/env node
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}

const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const marker = `WORKER-CONTEXT-V1-${Date.now()}`;
const taskId = `dev-task-context-${Date.now().toString(36)}`;
let passed = 0;
function check(name, ok, detail = "") { if (!ok) throw new Error(`${name}${detail ? ` :: ${detail}` : ""}`); passed += 1; console.log(`PASS ${String(passed).padStart(2, "0")} ${name}${detail ? ` :: ${detail}` : ""}`); }
const headers = { host, "x-dimpro-license-admin-key": key, "content-type": "application/json" };
async function api(path, method = "GET", body) {
  const response = await fetch(`${apiBase}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
async function cleanup() {
  await db.from("dev_center_live_worklog").delete().like("summary", `${marker}%`);
  await db.from("dev_center_tasks").delete().eq("id", taskId);
}

try {
  const inserted = await db.from("dev_center_tasks").insert({
    id: taskId,
    project_id: "project_dimprover",
    repository_id: "repo_dimprover",
    title: `${marker} BENJADMIN közös fejlesztői csevegés worker context cards`,
    description: "A Közös Fejlesztői Csevegés kódmérnök-kártyáin jelenjen meg a főmodul, modul, almodul, munkarész, részletes aktuális művelet és a hatfokozatú munkafázis.",
    status: "queued",
    priority: 50,
    requested_worker_id: null,
    assigned_worker_id: null,
    branch_name: null,
    worktree_path: null,
    scope: [],
    acceptance: [],
    created_by: "BENJADMIN worker context acceptance",
    metadata: { origin: "WORKER_CONTEXT_ACCEPTANCE", productionAccess: "DENY" },
  }).select("id").single();
  check("Task fixture created", !inserted.error && inserted.data?.id === taskId, inserted.error?.message || taskId);

  let r = await api("/api/dev/console/activity", "POST", {
    workerCode: "ARMINAI",
    phase: "test",
    summary: `${marker} structured`,
    detail: "A strukturált kártyaadatokat ellenőrzi. A modulhierarchia és a fázisjelző helyes megjelenését validálja.",
    taskId,
    projectId: "project_dimprover",
    mainModule: "BENJADMIN",
    moduleName: "Fejlesztői Konzol",
    submoduleName: "Közös fejlesztői csevegés",
    workItem: "Kódmérnök aktivitáskártya",
    activityAction: "A worker-kártya részletes kontextusát teszteli.",
    activityNarrative: "A kártyán ellenőrzi a főmodul–modul–almodul útvonalat és a munkarész megnevezését. Emellett validálja, hogy a 6/3 TESZTELÉS állapot a worker aktuális fázisát mutatja.",
    workStageIndex: 3,
    progressPercent: 58,
  });
  check("Structured activity accepted", r.response.status === 201, `status=${r.response.status}`);
  check("Stage 3 persisted by activity API", r.payload?.message?.metadata?.workStageIndex === 3 && r.payload?.message?.metadata?.workStageLabel === "TESZTELÉS", JSON.stringify(r.payload?.message?.metadata));
  check("Explicit hierarchy persisted", r.payload?.message?.metadata?.mainModule === "BENJADMIN" && r.payload?.message?.metadata?.moduleName === "Fejlesztői Konzol" && r.payload?.message?.metadata?.submoduleName === "Közös fejlesztői csevegés");

  r = await api("/api/dev/console/activity", "POST", {
    workerCode: "ARMINAI",
    phase: "build",
    summary: `${marker} inferred`,
    taskId,
    projectId: "project_dimprover",
  });
  check("Fallback activity accepted", r.response.status === 201, `status=${r.response.status}`);

  r = await api("/api/dev/console/messages?limit=240");
  check("Messages endpoint returns context data", r.response.status === 200 && Array.isArray(r.payload?.messages), `status=${r.response.status}`);
  const structured = (r.payload.messages || []).find((item) => item.summary === `${marker} structured`);
  const inferred = (r.payload.messages || []).find((item) => item.summary === `${marker} inferred`);
  check("Structured card enriched", structured?.metadata?.mainModule === "BENJADMIN" && structured?.metadata?.moduleName === "Fejlesztői Konzol" && structured?.metadata?.submoduleName === "Közös fejlesztői csevegés");
  check("Structured card shows 6/3 testing data", structured?.metadata?.workStageIndex === 3 && structured?.metadata?.workStageLabel === "TESZTELÉS", JSON.stringify(structured?.metadata));
  check("Structured narrative remains detailed", String(structured?.metadata?.activityNarrative || "").includes("főmodul–modul–almodul") && String(structured?.metadata?.activityNarrative || "").includes("6/3 TESZTELÉS"));
  check("Historical/task inference provides main module", inferred?.metadata?.mainModule === "BENJADMIN", JSON.stringify(inferred?.metadata));
  check("Historical/task inference provides submodule", inferred?.metadata?.submoduleName === "Közös fejlesztői csevegés", JSON.stringify(inferred?.metadata));
  check("Build phase maps to stage 5", inferred?.metadata?.workStageIndex === 5 && inferred?.metadata?.workStageLabel === "BUILD / KIADÁS", JSON.stringify(inferred?.metadata));
  check("Fallback generates explanatory narrative", String(inferred?.metadata?.activityNarrative || "").length > 80, String(inferred?.metadata?.activityNarrative || ""));

  const stored = await db.from("dev_center_live_worklog").select("summary,metadata").like("summary", `${marker}%`);
  check("Worker context rows remain DEV/PROD denied", !stored.error && (stored.data || []).every((row) => row.metadata?.productionAccess === "DENY"), JSON.stringify(stored.data));

  console.log(JSON.stringify({ ok: true, passed, failed: 0, taskId, marker }, null, 2));
} finally {
  await cleanup();
}
