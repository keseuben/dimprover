import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile?.(".env.local"); } catch {}
const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
if (!supabaseUrl || !serviceKey) throw new Error("DEV Supabase service-role environment missing");
const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const marker = `AI-DEV-SPACE-V1-${Date.now()}`;
const headers = { host, "x-dimpro-license-admin-key": adminKey, "content-type": "application/json" };
let taskId = "";
let passed = 0;
function check(name, ok, details = "") { if (!ok) throw new Error(`${name}: ${details}`); passed += 1; console.log(`PASS ${name}${details ? ` :: ${details}` : ""}`); }
async function call(path, method, body) {
  const response = await fetch(`${apiBase}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
async function cleanup() {
  if (!taskId) return;
  const sessions = await db.from("dev_center_worker_sessions").select("id").eq("task_id", taskId);
  for (const session of sessions.data || []) {
    for (const query of [
      db.from("dev_center_scope_locks").delete().eq("session_id", session.id),
      db.from("dev_center_worktree_leases").delete().eq("session_id", session.id),
      db.from("dev_center_session_events").delete().eq("session_id", session.id),
    ]) await query;
    await db.from("dev_center_worker_sessions").delete().eq("id", session.id);
  }
  for (const query of [
    db.from("dev_center_scope_locks").delete().eq("task_id", taskId),
    db.from("dev_center_worktree_leases").delete().eq("task_id", taskId),
    db.from("dev_center_live_worklog").delete().eq("task_id", taskId),
    db.from("dev_center_audit_events").delete().eq("task_id", taskId),
    db.from("dev_center_task_dependencies").delete().eq("task_id", taskId),
    db.from("dev_center_conflicts").delete().eq("task_id", taskId),
  ]) await query;
  await db.from("dev_center_tasks").delete().eq("id", taskId);
  await db.from("dev_center_workers").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", "worker_arminai");
}

try {
  const created = await call("/api/dev/console/messages", "POST", { text: `${marker} teljes task lifecycle acceptance`, target: "ARMINAI", projectId: "project_dimprover", createTask: true, kind: "INSTRUCTION" });
  taskId = created.payload?.task?.id || "";
  check("Task creation 201", created.response.status === 201 && created.payload?.ok === true, `status=${created.response.status}`);
  check("Task direct routing READY", Boolean(taskId) && created.payload?.task?.status === "ready" && created.payload?.task?.requestedWorkerId === "worker_arminai", JSON.stringify(created.payload?.task || {}));
  check("Estimate generated", Number(created.payload?.dispatch?.estimate?.minutes || 0) >= 30, JSON.stringify(created.payload?.dispatch?.estimate || {}));

  let action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "ESTIMATE", estimateMinutes: 75, note: "runtime acceptance" });
  check("Estimate PATCH", action.response.status === 200 && action.payload?.ok && action.payload?.result?.estimateMinutes === 75, `status=${action.response.status}`);

  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "START" });
  const firstSessionId = action.payload?.result?.session?.id || "";
  check("START creates real M3 session", action.response.status === 200 && action.payload?.ok && firstSessionId, `status=${action.response.status}`);
  check("START stops at TASK_BOUND", action.payload?.result?.session?.handshakeStage === "TASK_BOUND" && action.payload?.result?.task?.status === "claimed", JSON.stringify(action.payload?.result || {}));
  const firstTaskDb = await db.from("dev_center_tasks").select("status,assigned_worker_id,metadata").eq("id", taskId).single();
  check("DB claimed owner + ETA", !firstTaskDb.error && firstTaskDb.data?.status === "claimed" && firstTaskDb.data?.assigned_worker_id === "worker_arminai" && typeof firstTaskDb.data?.metadata?.expectedFinishAt === "string", JSON.stringify(firstTaskDb.data || {}));

  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "TESTING" });
  check("TESTING transition", action.response.status === 200 && action.payload?.result?.task?.status === "testing", `status=${action.response.status}`);

  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "FAIL", note: `${marker} synthetic blocker` });
  check("FAIL transition blocked", action.response.status === 200 && action.payload?.result?.task?.status === "blocked", `status=${action.response.status}`);
  const failedState = await Promise.all([
    db.from("dev_center_worker_sessions").select("status").eq("id", firstSessionId).single(),
    db.from("dev_center_workers").select("status").eq("id", "worker_arminai").single(),
    db.from("dev_center_tasks").select("status,assigned_worker_id,claimed_by_session_id,blocked_reason").eq("id", taskId).single(),
  ]);
  check("FAIL closes session and releases worker", failedState[0].data?.status === "closed" && failedState[1].data?.status === "ready", JSON.stringify({ session: failedState[0].data, worker: failedState[1].data }));
  check("FAIL clears claim and persists reason", failedState[2].data?.status === "blocked" && !failedState[2].data?.assigned_worker_id && !failedState[2].data?.claimed_by_session_id && String(failedState[2].data?.blocked_reason || "").includes("synthetic blocker"), JSON.stringify(failedState[2].data || {}));

  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "ROUTE", workerCode: "ARMINAI", estimateMinutes: 45, note: "retry after synthetic failure" });
  check("Blocked task can be safely re-routed", action.response.status === 200 && action.payload?.result?.task?.status === "ready", `status=${action.response.status}`);
  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "START" });
  const secondSessionId = action.payload?.result?.session?.id || "";
  check("Retry START creates new session", action.response.status === 200 && secondSessionId && secondSessionId !== firstSessionId, `session=${secondSessionId}`);
  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "COMPLETE", note: `${marker} synthetic success` });
  check("COMPLETE closes task", action.response.status === 200 && action.payload?.result?.task?.status === "completed", `status=${action.response.status}`);
  const completedState = await Promise.all([
    db.from("dev_center_worker_sessions").select("status").eq("id", secondSessionId).single(),
    db.from("dev_center_workers").select("status").eq("id", "worker_arminai").single(),
    db.from("dev_center_tasks").select("status,completed_at,metadata").eq("id", taskId).single(),
    db.from("dev_center_live_worklog").select("source,worker_code,metadata,summary").eq("task_id", taskId),
  ]);
  check("COMPLETE releases worker", completedState[0].data?.status === "closed" && completedState[1].data?.status === "ready", JSON.stringify({ session: completedState[0].data, worker: completedState[1].data }));
  check("Completion persisted", completedState[2].data?.status === "completed" && Boolean(completedState[2].data?.completed_at) && completedState[2].data?.metadata?.workflowState === "COMPLETED", JSON.stringify(completedState[2].data || {}));
  check("Worklog contains routing/start/failure/completion", !completedState[3].error && (completedState[3].data || []).some((row) => row.metadata?.action === "ROUTE") && (completedState[3].data || []).some((row) => row.metadata?.action === "START") && (completedState[3].data || []).some((row) => row.metadata?.outcome === "failed") && (completedState[3].data || []).some((row) => row.metadata?.outcome === "completed"), JSON.stringify(completedState[3].data || []));
  console.log(JSON.stringify({ ok: true, passed, failed: 0, pushResult: action.payload?.notification || null }, null, 2));
} finally {
  await cleanup();
}
