import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile?.(".env.local"); } catch {}
const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const marker = `PLUS-V12-${Date.now()}`;
const headers = { host, "x-dimpro-license-admin-key": adminKey, "content-type": "application/json" };
const taskIds = [];
const workerStatusSnapshot = new Map();
let passed = 0;
function check(name, ok, details = "") { if (!ok) throw new Error(`${name}: ${details}`); passed += 1; console.log(`PASS ${name}${details ? ` :: ${details}` : ""}`); }
async function call(path, method, body) {
  const response = await fetch(`${apiBase}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
async function cleanupTask(taskId) {
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
}
async function cleanup() {
  for (const taskId of [...taskIds].reverse()) await cleanupTask(taskId);
  for (const [id, status] of workerStatusSnapshot) await db.from("dev_center_workers").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
}

try {
  const workersBefore = await db.from("dev_center_workers").select("id,code,status").in("code", ["ARMINAI", "JAZMINAI", "OUTMINAI"]);
  for (const worker of workersBefore.data || []) workerStatusSnapshot.set(worker.id, worker.status);

  let result = await call("/api/dev/console/messages", "POST", {
    text: `${marker} AUTO Plus-only task pull és strukturált eredmény acceptance`,
    target: "BENAI",
    projectId: "project_dimprover",
    createTask: true,
    kind: "INSTRUCTION",
  });
  const primaryTaskId = result.payload?.task?.id || "";
  if (primaryTaskId) taskIds.push(primaryTaskId);
  check("AUTO task creation 201", result.response.status === 201 && result.payload?.ok === true && Boolean(primaryTaskId), `status=${result.response.status}`);
  check("Ben-AI auto routing executed", result.payload?.autoRouting?.routed === true, JSON.stringify({ reason: result.payload?.autoRouting?.reason, worker: result.payload?.autoRouting?.worker?.code }));
  const primaryWorkerCode = String(result.payload?.autoRouting?.worker?.code || "");
  const primaryWorkerId = String(result.payload?.autoRouting?.worker?.id || "");
  check("AUTO selected internal worker", ["ARMINAI", "JAZMINAI", "OUTMINAI"].includes(primaryWorkerCode) && Boolean(primaryWorkerId), `${primaryWorkerCode} ${primaryWorkerId}`);
  check("AUTO task persisted coordinator metadata", result.payload?.task?.metadata?.coordinator === "BENAI" && result.payload?.task?.metadata?.coordinatorAutoRouted === true, JSON.stringify(result.payload?.task?.metadata?.coordinatorSelection || {}));

  result = await call(`/api/dev/console/plus-bridge/${encodeURIComponent(primaryWorkerCode)}/next`, "POST");
  check("One-command Plus pull succeeds", result.response.status === 200 && result.payload?.found === true && result.payload?.task?.id === primaryTaskId, `status=${result.response.status}`);
  check("Plus pull moves bridge RUNNING", result.payload?.handoff?.bridgeState === "RUNNING" && result.payload?.task?.metadata?.bridgeState === "RUNNING", JSON.stringify({ bridgeState: result.payload?.handoff?.bridgeState }));
  check("Plus pull returns task-bound handoff", typeof result.payload?.handoff?.prompt === "string" && result.payload.handoff.prompt.includes(primaryTaskId) && result.payload.handoff.prompt.includes(marker), String(result.payload?.handoff?.prompt || "").slice(0, 220));
  check("Plus pull remains DEV-only", result.payload?.handoff?.prompt?.includes("DEV-only végrehajtás") && result.payload?.handoff?.prompt?.includes("PROD módosítás nincs"), "");
  const sessionId = String(result.payload?.task?.metadata?.activeSessionId || "");
  check("Plus pull creates real M3 session", Boolean(sessionId) && result.payload?.task?.metadata?.executionGate === "TASK_BOUND", `session=${sessionId}`);

  const preferredMarker = `${marker}-PREFERRED`;
  result = await call("/api/dev/console/messages", "POST", {
    text: `${preferredMarker} foglalt worker preferencia acceptance`,
    target: primaryWorkerCode,
    projectId: "project_dimprover",
    createTask: true,
    kind: "INSTRUCTION",
  });
  const preferredTaskId = result.payload?.task?.id || "";
  if (preferredTaskId) taskIds.push(preferredTaskId);
  check("Preferred busy task creation 201", result.response.status === 201 && Boolean(preferredTaskId), `status=${result.response.status}`);
  check("Busy preferred worker is not silently assigned", result.payload?.autoRouting?.routed === false && result.payload?.autoRouting?.reason === "PREFERRED_UNAVAILABLE", JSON.stringify({ routed: result.payload?.autoRouting?.routed, reason: result.payload?.autoRouting?.reason }));
  check("Busy preference state persisted", result.payload?.task?.metadata?.coordinatorPreferenceState === "PREFERRED_BUSY", String(result.payload?.task?.metadata?.coordinatorPreferenceState || ""));
  const suggestedWorkerCode = String(result.payload?.autoRouting?.suggestedWorker?.code || result.payload?.task?.metadata?.coordinatorSuggestedWorker?.workerCode || "");
  check("Ben-AI offers next free coder", Boolean(suggestedWorkerCode) && suggestedWorkerCode !== primaryWorkerCode, `preferred=${primaryWorkerCode} suggested=${suggestedWorkerCode}`);
  check("Coordinator response explains suggestion", String(result.payload?.dispatch?.nextStep || "").includes("Ben-AI javaslata"), String(result.payload?.dispatch?.nextStep || ""));

  result = await call(`/api/dev/console/tasks/${preferredTaskId}`, "PATCH", { action: "ACCEPT_SUGGESTION" });
  check("Suggested worker can be accepted", result.response.status === 200 && result.payload?.result?.routed === true, `status=${result.response.status}`);
  check("Accepted worker differs from busy preferred", result.payload?.result?.worker?.code === suggestedWorkerCode && result.payload?.result?.worker?.code !== primaryWorkerCode, String(result.payload?.result?.worker?.code || ""));
  check("Accepted preference state persisted", result.payload?.result?.task?.metadata?.coordinatorPreferenceState === "PREFERRED_ACCEPTED", String(result.payload?.result?.task?.metadata?.coordinatorPreferenceState || ""));

  const fakeSecret = `API_KEY="${marker}_SHOULD_NOT_SURVIVE"`;
  result = await call(`/api/dev/console/tasks/${primaryTaskId}`, "PATCH", {
    action: "RESULT_REPORT",
    summary: `${marker} fejlesztés elkészült`,
    commit: "abcdef1234567",
    buildId: `V12-${Date.now()}`,
    tests: `46/46 PASS; ${fakeSecret}`,
    docs: "248_plus_only_v12_checkpoint.md",
    nextStep: "TESTING majd COMPLETE",
  });
  check("Structured result report succeeds", result.response.status === 200 && result.payload?.result?.bridgeState === "RESULT_PENDING", `status=${result.response.status}`);
  const bridgeResult = result.payload?.result?.result || {};
  check("Structured result stores summary/commit/build", bridgeResult.summary?.includes(marker) && bridgeResult.commit === "abcdef1234567" && /^V12-/.test(String(bridgeResult.buildId || "")), JSON.stringify({ commit: bridgeResult.commit, buildId: bridgeResult.buildId }));
  check("Structured result masks secret", bridgeResult.sanitized === true && !JSON.stringify(bridgeResult).includes(`${marker}_SHOULD_NOT_SURVIVE`), JSON.stringify({ sanitized: bridgeResult.sanitized, findings: bridgeResult.sensitiveFindings }));
  check("Structured result has SHA/version", /^[0-9a-f]{64}$/.test(String(bridgeResult.sha256 || "")) && bridgeResult.version === 1, JSON.stringify({ version: bridgeResult.version, sha: bridgeResult.sha256 }));
  check("Testing is suggested after result", result.payload?.result?.testingSuggested === true && result.payload?.result?.task?.metadata?.testingSuggested === true, "");
  check("Result history persisted", Array.isArray(result.payload?.result?.task?.metadata?.bridgeResultHistory) && result.payload.result.task.metadata.bridgeResultHistory.length === 1, `history=${result.payload?.result?.task?.metadata?.bridgeResultHistory?.length}`);

  result = await call(`/api/dev/console/tasks/${primaryTaskId}`, "PATCH", { action: "TESTING" });
  check("Plus task enters TESTING", result.response.status === 200 && result.payload?.result?.task?.status === "testing", `status=${result.response.status}`);
  result = await call(`/api/dev/console/tasks/${primaryTaskId}`, "PATCH", { action: "COMPLETE", note: `${marker} plus-only complete` });
  check("Plus task completes", result.response.status === 200 && result.payload?.result?.task?.status === "completed", `status=${result.response.status}`);
  check("Completion returns Ben-AI rebalance result", result.payload?.result && Object.prototype.hasOwnProperty.call(result.payload.result, "rebalance"), JSON.stringify(result.payload?.result?.rebalance || null));

  const [audit, session] = await Promise.all([
    db.from("dev_center_audit_events").select("action,metadata").eq("task_id", primaryTaskId),
    db.from("dev_center_worker_sessions").select("status").eq("id", sessionId).single(),
  ]);
  const actions = (audit.data || []).map((row) => row.action);
  check("Audit contains Plus pull and result", actions.includes("TASK_PLUS_BRIDGE_PULLED") && actions.includes("TASK_BRIDGE_RESULT_RECORDED"), JSON.stringify(actions));
  check("Plus/result audits keep PROD denied", (audit.data || []).filter((row) => ["TASK_PLUS_BRIDGE_PULLED", "TASK_BRIDGE_RESULT_RECORDED"].includes(row.action)).every((row) => row.metadata?.productionAccess === "DENY"), "");
  check("Completion closes Plus M3 session", session.data?.status === "closed", JSON.stringify(session.data));

  console.log(JSON.stringify({ ok: true, passed, failed: 0, primaryTaskId, preferredTaskId, primaryWorkerCode, suggestedWorkerCode }, null, 2));
} finally {
  await cleanup();
}
