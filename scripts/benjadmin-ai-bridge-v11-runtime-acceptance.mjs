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
const marker = `AI-BRIDGE-V11-${Date.now()}`;
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
  const created = await call("/api/dev/console/messages", "POST", { text: `${marker} worker inbox és kézi bridge teljes runtime acceptance`, target: "ARMINAI", projectId: "project_dimprover", createTask: true, kind: "INSTRUCTION" });
  taskId = created.payload?.task?.id || "";
  check("V1.1 task creation 201", created.response.status === 201 && created.payload?.ok === true && Boolean(taskId), `status=${created.response.status}`);
  const routedMeta = created.payload?.task?.metadata || {};
  check("Routing starts WAITING_HANDOFF", routedMeta.bridgeState === "WAITING_HANDOFF", JSON.stringify({ bridgeState: routedMeta.bridgeState }));
  check("Task persists handoff prompt", typeof routedMeta.handoffPrompt === "string" && routedMeta.handoffPrompt.includes(marker) && /Felelős:\s*Ármin(?:-?AI)/i.test(routedMeta.handoffPrompt), String(routedMeta.handoffPrompt || "").slice(0, 240));
  check("Task persists handoff SHA", /^[0-9a-f]{64}$/.test(String(routedMeta.handoffPromptSha256 || "")), String(routedMeta.handoffPromptSha256 || ""));
  check("Safe task is not marked sanitized", routedMeta.handoffSanitized === false && Array.isArray(routedMeta.handoffSensitiveFindings) && routedMeta.handoffSensitiveFindings.length === 0, JSON.stringify({ sanitized: routedMeta.handoffSanitized, findings: routedMeta.handoffSensitiveFindings }));
  check("Handoff prompt is DEV-only", routedMeta.handoffPrompt.includes("DEV-only végrehajtás") && routedMeta.handoffPrompt.includes("PROD módosítás nincs"), "");

  let action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "HANDOFF" });
  check("HANDOFF before START is fail-closed", action.response.status === 409 && action.payload?.code === "DEV_CENTER_BRIDGE_TASK_NOT_STARTED", JSON.stringify({ status: action.response.status, code: action.payload?.code }));

  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "START" });
  const sessionId = action.payload?.result?.session?.id || "";
  check("START creates M3 session", action.response.status === 200 && Boolean(sessionId), `session=${sessionId}`);
  check("START remains TASK_BOUND", action.payload?.result?.session?.handshakeStage === "TASK_BOUND" && action.payload?.result?.task?.metadata?.executionGate === "TASK_BOUND", JSON.stringify({ stage: action.payload?.result?.session?.handshakeStage, gate: action.payload?.result?.task?.metadata?.executionGate }));
  check("START preserves WAITING_HANDOFF", action.payload?.result?.task?.metadata?.bridgeState === "WAITING_HANDOFF", String(action.payload?.result?.task?.metadata?.bridgeState || ""));

  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "RUNNING" });
  check("RUNNING before HANDOFF denied", action.response.status === 409 && action.payload?.code === "DEV_CENTER_BRIDGE_TRANSITION_DENIED", JSON.stringify({ status: action.response.status, code: action.payload?.code }));

  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "HANDOFF" });
  check("HANDOFF transition", action.response.status === 200 && action.payload?.result?.bridgeState === "HANDED_OFF" && action.payload?.result?.task?.metadata?.bridgeState === "HANDED_OFF", JSON.stringify({ status: action.response.status, state: action.payload?.result?.bridgeState }));
  check("HANDOFF timestamp persisted", typeof action.payload?.result?.task?.metadata?.handoffAt === "string", String(action.payload?.result?.task?.metadata?.handoffAt || ""));

  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "RESULT_PENDING" });
  check("RESULT_PENDING before RUNNING denied", action.response.status === 409 && action.payload?.code === "DEV_CENTER_BRIDGE_TRANSITION_DENIED", JSON.stringify({ status: action.response.status, code: action.payload?.code }));

  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "RUNNING" });
  check("RUNNING transition", action.response.status === 200 && action.payload?.result?.bridgeState === "RUNNING" && action.payload?.result?.task?.metadata?.workflowState === "MANUAL_BRIDGE_RUNNING", JSON.stringify({ state: action.payload?.result?.bridgeState, workflow: action.payload?.result?.task?.metadata?.workflowState }));
  check("RUNNING timestamp persisted", typeof action.payload?.result?.task?.metadata?.bridgeRunningAt === "string", String(action.payload?.result?.task?.metadata?.bridgeRunningAt || ""));

  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "RESULT_PENDING" });
  check("RESULT_PENDING transition", action.response.status === 200 && action.payload?.result?.bridgeState === "RESULT_PENDING" && action.payload?.result?.task?.metadata?.workflowState === "RESULT_PENDING", JSON.stringify({ state: action.payload?.result?.bridgeState, workflow: action.payload?.result?.task?.metadata?.workflowState }));
  check("Result timestamp persisted", typeof action.payload?.result?.task?.metadata?.resultPendingAt === "string", String(action.payload?.result?.task?.metadata?.resultPendingAt || ""));

  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "TESTING" });
  check("TESTING after RESULT_PENDING", action.response.status === 200 && action.payload?.result?.task?.status === "testing" && action.payload?.result?.task?.metadata?.bridgeState === "RESULT_PENDING", JSON.stringify({ status: action.payload?.result?.task?.status, bridgeState: action.payload?.result?.task?.metadata?.bridgeState }));

  action = await call(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "COMPLETE", note: `${marker} bridge success` });
  check("COMPLETE still works", action.response.status === 200 && action.payload?.result?.task?.status === "completed" && action.payload?.result?.task?.metadata?.workflowState === "COMPLETED", `status=${action.response.status}`);
  check("Bridge finish timestamp persisted", typeof action.payload?.result?.task?.metadata?.bridgeFinishedAt === "string", String(action.payload?.result?.task?.metadata?.bridgeFinishedAt || ""));

  const [audit, worklog, session, worker] = await Promise.all([
    db.from("dev_center_audit_events").select("action,metadata").eq("task_id", taskId),
    db.from("dev_center_live_worklog").select("summary,metadata").eq("task_id", taskId),
    db.from("dev_center_worker_sessions").select("status").eq("id", sessionId).single(),
    db.from("dev_center_workers").select("status").eq("id", "worker_arminai").single(),
  ]);
  const auditActions = (audit.data || []).map((row) => row.action);
  check("Audit contains all bridge stages", ["TASK_BRIDGE_HANDED_OFF", "TASK_BRIDGE_RUNNING", "TASK_BRIDGE_RESULT_PENDING"].every((name) => auditActions.includes(name)), JSON.stringify(auditActions));
  check("Audit keeps PROD denied", (audit.data || []).filter((row) => String(row.action).startsWith("TASK_BRIDGE_")).every((row) => row.metadata?.productionAccess === "DENY"), "");
  const worklogActions = (worklog.data || []).map((row) => row.metadata?.action).filter(Boolean);
  check("Worklog contains HANDOFF/RUNNING/RESULT_PENDING", ["HANDOFF", "RUNNING", "RESULT_PENDING"].every((name) => worklogActions.includes(name)), JSON.stringify(worklogActions));
  check("Completion closes session and releases worker", session.data?.status === "closed" && worker.data?.status === "ready", JSON.stringify({ session: session.data, worker: worker.data }));

  console.log(JSON.stringify({ ok: true, passed, failed: 0, taskId, sessionId }, null, 2));
} finally {
  await cleanup();
}
