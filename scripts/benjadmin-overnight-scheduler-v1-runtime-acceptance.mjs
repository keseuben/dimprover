import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile?.(".env.local"); } catch {}

const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const headers = { host, "x-dimpro-license-admin-key": key, "content-type": "application/json" };
const marker = `SCHED-V1-${Date.now()}`;
const projectId = `project_sched_${Date.now().toString(36)}`;
const projectSlug = `sched-${Date.now().toString(36)}`;
const taskId = `dev-task-sched-${Date.now().toString(36)}`;
let scheduleId = "";
let workerSnapshot = [];
let workerCode = "";
let browserLikeRunKey = "";
let passed = 0;

function check(name, ok, detail = "") {
  if (!ok) throw new Error(`${name}: ${detail}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${name}${detail ? ` :: ${detail}` : ""}`);
}
async function api(path, method = "GET", body, authorized = true) {
  const h = authorized ? headers : { host, "content-type": "application/json" };
  const response = await fetch(`${apiBase}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
async function cleanupTask(id) {
  if (!id) return;
  const sessions = await db.from("dev_center_worker_sessions").select("id").eq("task_id", id);
  for (const session of sessions.data || []) {
    await db.from("dev_center_scope_locks").delete().eq("session_id", session.id);
    await db.from("dev_center_worktree_leases").delete().eq("session_id", session.id);
    await db.from("dev_center_session_events").delete().eq("session_id", session.id);
    await db.from("dev_center_worker_sessions").delete().eq("id", session.id);
  }
  await db.from("dev_center_scope_locks").delete().eq("task_id", id);
  await db.from("dev_center_worktree_leases").delete().eq("task_id", id);
  await db.from("dev_center_task_dependencies").delete().eq("task_id", id);
  await db.from("dev_center_task_dependencies").delete().eq("depends_on_task_id", id);
  await db.from("dev_center_conflicts").delete().eq("task_id", id);
  await db.from("dev_center_live_worklog").delete().eq("task_id", id);
  await db.from("dev_center_audit_events").delete().eq("task_id", id);
  await db.from("dev_center_tasks").delete().eq("id", id);
}
async function cleanup() {
  try {
    await cleanupTask(taskId);
    if (scheduleId) {
      await db.from("dev_center_decision_memory").delete().eq("category", "development_scheduler_run").like("decision_key", `benjadmin:scheduler-run:${scheduleId}:%`);
      await db.from("dev_center_decision_memory").delete().eq("id", scheduleId).eq("category", "development_scheduler");
      await db.from("dev_center_audit_events").delete().eq("entity_id", scheduleId);
    }
    await db.from("dev_center_audit_events").delete().eq("project_id", projectId);
    await db.from("dev_center_live_worklog").delete().ilike("summary", `%${marker}%`);
    await db.from("dev_center_projects").delete().eq("id", projectId);
    for (const worker of workerSnapshot) await db.from("dev_center_workers").update({ status: worker.status, updated_at: new Date().toISOString() }).eq("id", worker.id);
  } catch (error) {
    console.error("CLEANUP_WARNING", error instanceof Error ? error.message : String(error));
  }
}

try {
  let result = await api("/api/dev/console/scheduler", "GET", undefined, false);
  check("Scheduler API denies unauthenticated read", result.response.status === 401, `status=${result.response.status}`);

  result = await api(`/api/dev/console/scheduler?projectId=${encodeURIComponent(projectId)}`);
  check("Scheduler snapshot is ready without new migration", result.response.status === 200 && result.payload?.scheduler?.ready === true, `status=${result.response.status}`);
  check("Scheduler uses decision-memory storage", result.payload?.scheduler?.storageMode === "CONTROL_PLANE_DECISION_MEMORY_V1", String(result.payload?.scheduler?.storageMode || ""));

  const workers = await db.from("dev_center_workers").select("id,code,name,status").in("code", ["ARMINAI", "JAZMINAI"]);
  if (workers.error) throw workers.error;
  workerSnapshot = workers.data || [];
  for (const worker of workerSnapshot) await db.from("dev_center_workers").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", worker.id);
  check("Internal scheduler worker pool prepared", workerSnapshot.length >= 2, workerSnapshot.map((worker) => worker.code).join(","));

  const project = await db.from("dev_center_projects").insert({
    id: projectId, name: `${marker} projekt`, slug: projectSlug, category: "Acceptance", description: "BENJADMIN Scheduler V1 acceptance fixture",
    status: "active", accent: "cyan", metadata: { marker, productionAccess: "DENY" },
  });
  if (project.error) throw project.error;

  const task = await db.from("dev_center_tasks").insert({
    id: taskId, project_id: projectId, title: `${marker} órás task`, description: "Scheduler acceptance task", status: "ready", priority: 99,
    requested_worker_id: null, assigned_worker_id: null, created_by: "BenjAdmin", metadata: { marker, origin: "SCHEDULER_ACCEPTANCE", productionAccess: "DENY" },
  });
  if (task.error) throw task.error;
  check("Isolated project and queued task fixture created", true, `${projectId} / ${taskId}`);

  const baseMs = Date.now() - 60_000;
  const startAt = new Date(baseMs).toISOString();
  const endAt = new Date(baseMs + 3 * 60 * 60_000).toISOString();
  result = await api("/api/dev/console/scheduler", "POST", {
    action: "CREATE", projectId, title: `${marker} night chain`, startAt, endAt, cadenceMinutes: 60, maxRuns: 3, timezone: "Europe/Budapest", missedRunPolicy: "catch_up_once",
  });
  scheduleId = String(result.payload?.schedule?.id || "");
  check("Schedule creation succeeds", result.response.status === 201 && Boolean(scheduleId), `${scheduleId}`);
  check("Schedule cadence is hourly", result.payload?.schedule?.cadenceMinutes === 60, String(result.payload?.schedule?.cadenceMinutes));

  const firstNow = new Date(baseMs + 60_000).toISOString();
  result = await api("/api/dev/console/scheduler/tick", "POST", { source: "manual", scheduleId, now: firstNow });
  const firstOutcome = result.payload?.outcomes?.[0];
  workerCode = String(firstOutcome?.run?.workerCode || workerCode);
  check("First due slot becomes ready for Plus pull", result.response.status === 200 && result.payload?.dueCount === 1 && firstOutcome?.outcome === "ready_for_pull", JSON.stringify(firstOutcome));
  check("Tick remains PROD denied", result.payload?.productionAccess === "DENY", String(result.payload?.productionAccess || ""));

  const taskRow = await db.from("dev_center_tasks").select("status,metadata,assigned_worker_id").eq("id", taskId).single();
  check("Task is marked READY_FOR_PLUS_PULL", taskRow.data?.metadata?.coordinatorChainState === "READY_FOR_PLUS_PULL", JSON.stringify(taskRow.data?.metadata || {}));
  check("Scheduler chain source persisted", taskRow.data?.metadata?.coordinatorChainSource === "BENJADMIN_SCHEDULER", String(taskRow.data?.metadata?.coordinatorChainSource || ""));

  const runRows = await db.from("dev_center_decision_memory").select("id,decision_key,category,metadata").eq("category", "development_scheduler_run").like("decision_key", `benjadmin:scheduler-run:${scheduleId}:%`);
  check("Exactly one durable run ledger row exists", (runRows.data || []).length === 1, `rows=${(runRows.data || []).length}`);
  const runRow = runRows.data?.[0];
  browserLikeRunKey = String(runRow?.decision_key || "");
  check("Run key is deterministic and schedule-scoped", browserLikeRunKey.startsWith(`benjadmin:scheduler-run:${scheduleId}:`), browserLikeRunKey);
  check("Run metadata denies PROD", runRow?.metadata?.productionAccess === "DENY" && runRow?.metadata?.storageMode === "CONTROL_PLANE_DECISION_MEMORY_V1", JSON.stringify(runRow?.metadata || {}));

  result = await api("/api/dev/console/scheduler/tick", "POST", { source: "manual", scheduleId, now: firstNow });
  check("Repeated heartbeat does not duplicate an advanced slot", result.response.status === 200 && result.payload?.dueCount === 0, `due=${result.payload?.dueCount}`);
  const runCountCheck = await db.from("dev_center_decision_memory").select("id").eq("category", "development_scheduler_run").like("decision_key", `benjadmin:scheduler-run:${scheduleId}:%`);
  check("Repeated heartbeat keeps one run row", (runCountCheck.data || []).length === 1, `rows=${(runCountCheck.data || []).length}`);

  const missedNow = new Date(baseMs + 20 * 60_000).toISOString();
  result = await api("/api/dev/console/scheduler/tick", "POST", { source: "manual", scheduleId, now: missedNow });
  check("Missing external ChatGPT wake is detected", result.payload?.externalWake?.missed === 1, JSON.stringify(result.payload?.externalWake || {}));
  let snapshot = await api(`/api/dev/console/scheduler?projectId=${encodeURIComponent(projectId)}`);
  let schedule = snapshot.payload?.scheduler?.schedules?.find((item) => item.id === scheduleId);
  check("Wake miss counter increments once", Number(schedule?.metadata?.externalWakeMissCount || 0) === 1, JSON.stringify(schedule?.metadata || {}));

  const repeatedMissNow = new Date(baseMs + 25 * 60_000).toISOString();
  result = await api("/api/dev/console/scheduler/tick", "POST", { source: "manual", scheduleId, now: repeatedMissNow });
  check("Wake miss alert is idempotent", result.payload?.externalWake?.missed === 0, JSON.stringify(result.payload?.externalWake || {}));
  snapshot = await api(`/api/dev/console/scheduler?projectId=${encodeURIComponent(projectId)}`);
  schedule = snapshot.payload?.scheduler?.schedules?.find((item) => item.id === scheduleId);
  check("Wake miss counter is not double-counted", Number(schedule?.metadata?.externalWakeMissCount || 0) === 1, JSON.stringify(schedule?.metadata || {}));

  result = await api(`/api/dev/console/plus-bridge/${encodeURIComponent(workerCode)}/next`, "POST");
  check("Later Folytasd pull claims the scheduled task", result.response.status === 200 && result.payload?.found === true && result.payload?.task?.id === taskId, `status=${result.response.status} task=${result.payload?.task?.id || ""}`);

  const observedNow = new Date(baseMs + 30 * 60_000).toISOString();
  result = await api("/api/dev/console/scheduler/tick", "POST", { source: "manual", scheduleId, now: observedNow });
  check("Scheduler observes the later Plus pull", result.payload?.externalWake?.observed === 1, JSON.stringify(result.payload?.externalWake || {}));
  snapshot = await api(`/api/dev/console/scheduler?projectId=${encodeURIComponent(projectId)}`);
  let run = snapshot.payload?.scheduler?.runs?.find((item) => item.scheduleId === scheduleId);
  check("Observed pull completes run ledger", run?.status === "completed" && Boolean(run?.metadata?.wakeObservedAt), JSON.stringify(run || {}));

  const scheduleMemory = await db.from("dev_center_decision_memory").select("metadata").eq("id", scheduleId).single();
  const crashMeta = { ...(scheduleMemory.data?.metadata || {}), nextRunAt: startAt, runCount: 0, lastRunAt: null, scheduleStatus: "active" };
  const crashWrite = await db.from("dev_center_decision_memory").update({ metadata: crashMeta, status: "active", updated_at: new Date().toISOString() }).eq("id", scheduleId);
  if (crashWrite.error) throw crashWrite.error;
  result = await api("/api/dev/console/scheduler/tick", "POST", { source: "recovery", scheduleId, now: new Date(baseMs + 31 * 60_000).toISOString() });
  check("Crash window recovers a completed-but-unadvanced slot", result.payload?.outcomes?.[0]?.outcome === "duplicate_recovered", JSON.stringify(result.payload?.outcomes?.[0] || {}));
  snapshot = await api(`/api/dev/console/scheduler?projectId=${encodeURIComponent(projectId)}`);
  schedule = snapshot.payload?.scheduler?.schedules?.find((item) => item.id === scheduleId);
  check("Crash recovery advances nextRun without duplicate run row", Number(schedule?.runCount || 0) === 1 && new Date(schedule?.nextRunAt).getTime() > new Date(startAt).getTime(), JSON.stringify({ runCount: schedule?.runCount, nextRunAt: schedule?.nextRunAt }));
  const postRecoveryRuns = await db.from("dev_center_decision_memory").select("id").eq("category", "development_scheduler_run").like("decision_key", `benjadmin:scheduler-run:${scheduleId}:%`);
  check("Crash recovery still keeps one run key", (postRecoveryRuns.data || []).length === 1, `rows=${(postRecoveryRuns.data || []).length}`);

  result = await api("/api/dev/console/scheduler", "POST", { action: "PAUSE", scheduleId });
  check("Schedule pause works", result.payload?.schedule?.status === "paused", String(result.payload?.schedule?.status || ""));
  result = await api("/api/dev/console/scheduler", "POST", { action: "RESUME", scheduleId });
  check("Schedule resume works", result.payload?.schedule?.status === "active", String(result.payload?.schedule?.status || ""));
  result = await api("/api/dev/console/scheduler", "POST", { action: "CANCEL", scheduleId });
  check("Schedule cancel works", result.payload?.schedule?.status === "cancelled", String(result.payload?.schedule?.status || ""));

  const audits = await db.from("dev_center_audit_events").select("action,metadata").eq("project_id", projectId);
  const actions = (audits.data || []).map((row) => row.action);
  check("Audit contains creation ready wake-miss recovery lifecycle", ["DEVELOPMENT_SCHEDULE_CREATED", "DEVELOPMENT_SCHEDULER_READY_FOR_PULL", "DEVELOPMENT_SCHEDULER_EXTERNAL_WAKE_MISSED", "DEVELOPMENT_SCHEDULER_SLOT_RECOVERED"].every((action) => actions.includes(action)), JSON.stringify(actions));

  console.log(JSON.stringify({ ok: true, passed, failed: 0, projectId, taskId, scheduleId, workerCode, runKey: browserLikeRunKey }, null, 2));
} finally {
  await cleanup();
}
