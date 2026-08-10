import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const base = "http://127.0.0.1:3301";
const host = "admin.dev.dimpro.hu";
const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const headers = { host, "x-dimpro-license-admin-key": key, "content-type": "application/json" };
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const versionId = "version_d4bf9700-96e";
const repoId = "repo_dimprover";
const projectId = "project_dimprover";
const checks = [];

function pass(name, details = "") { checks.push({ name, ok: true, details }); console.log(`PASS ${name}${details ? ` :: ${details}` : ""}`); }
function fail(name, details = "") { checks.push({ name, ok: false, details }); console.error(`FAIL ${name}${details ? ` :: ${details}` : ""}`); }
function assert(name, condition, details = "") { if (condition) pass(name, details); else { fail(name, details); throw new Error(`${name}: ${details}`); } }

async function request(path, method = "GET", body = undefined) {
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}
async function createTask(title) {
  const result = await request("/api/dev/engine/tasks", "POST", { projectId, versionId, repositoryId: repoId, title, priority: 95, acceptance: ["M3 acceptance"] });
  assert(`task created ${title}`, result.status === 201 && result.payload?.task?.id, `status=${result.status}`);
  return result.payload.task.id;
}
async function openWorker(workerId, label) {
  let result = await request("/api/dev/engine/sessions", "POST", { environmentId: "env_dev", note: `M3 acceptance ${label}` });
  assert(`${label} session open`, result.status === 201 && result.payload?.session?.id, `status=${result.status}`);
  const sessionId = result.payload.session.id;
  result = await request(`/api/dev/engine/sessions/${sessionId}`, "PATCH", { action: "assign_benai" });
  assert(`${label} BenAI assigned`, result.status === 200 && result.payload?.session?.handshakeStage === "BENAI_ASSIGNED");
  result = await request(`/api/dev/engine/sessions/${sessionId}`, "PATCH", { action: "bind_worker", workerId });
  assert(`${label} worker bound`, result.status === 200 && result.payload?.session?.handshakeStage === "WORKER_BOUND");
  return sessionId;
}
async function claim(sessionId, workerId, taskId) {
  return request("/api/dev/engine/orchestration", "POST", { action: "claim_task", sessionId, workerId, taskId, leaseSeconds: 900 });
}
async function bindWorkspace(sessionId, branchName, worktreePath) {
  let result = await request(`/api/dev/engine/sessions/${sessionId}`, "PATCH", { action: "bind_branch", branchName });
  assert(`${sessionId} branch bound`, result.status === 200 && result.payload?.session?.handshakeStage === "BRANCH_BOUND");
  result = await request(`/api/dev/engine/sessions/${sessionId}`, "PATCH", { action: "bind_worktree", worktreePath });
  assert(`${sessionId} worktree bound`, result.status === 200 && result.payload?.session?.handshakeStage === "WORKTREE_BOUND");
}
async function acquire(sessionId, scope) {
  return request("/api/dev/engine/orchestration", "POST", { action: "acquire_scope", sessionId, scope, leaseSeconds: 900 });
}

const raceTask = await createTask("M3 acceptance atomic claim race");
const fallbackTask = await createTask("M3 acceptance loser independent task");
const outminTask = await createTask("M3 acceptance Outmin independent task");
const recoveryTask = await createTask("M3 acceptance stale recovery task");

const armin = await openWorker("worker_arminai", "ArminAI");
const jazmin = await openWorker("worker_jazminai", "JazminAI");
const race = await Promise.all([claim(armin, "worker_arminai", raceTask), claim(jazmin, "worker_jazminai", raceTask)]);
const winners = race.map((result, index) => ({ result, sessionId: index === 0 ? armin : jazmin, workerId: index === 0 ? "worker_arminai" : "worker_jazminai" })).filter((item) => item.result.status === 200);
const losers = race.map((result, index) => ({ result, sessionId: index === 0 ? armin : jazmin, workerId: index === 0 ? "worker_arminai" : "worker_jazminai" })).filter((item) => item.result.status === 409);
assert("atomic claim exactly one winner", winners.length === 1, `winnerCount=${winners.length}`);
assert("atomic claim exactly one conflict", losers.length === 1, `conflictCount=${losers.length}`);
const winner = winners[0];
const loser = losers[0];

await bindWorkspace(winner.sessionId, `worker/m3-race-${winner.workerId}`, `/srv/dimpro-dev/worktrees/m3-race-${winner.workerId}`);
let result = await acquire(winner.sessionId, [{ type: "module", key: "benjadmin-m3-shared" }]);
assert("winner scope acquired", result.status === 200, `status=${result.status}`);

result = await claim(loser.sessionId, loser.workerId, fallbackTask);
assert("loser claims independent task", result.status === 200, `status=${result.status}`);
await bindWorkspace(loser.sessionId, `worker/m3-independent-${loser.workerId}`, `/srv/dimpro-dev/worktrees/m3-independent-${loser.workerId}`);
result = await acquire(loser.sessionId, [{ type: "module", key: "benjadmin-m3-shared" }]);
assert("scope conflict blocked", result.status === 409 && result.payload?.code === "DEV_CENTER_SCOPE_CONFLICT", `status=${result.status} code=${result.payload?.code}`);
result = await acquire(loser.sessionId, [{ type: "module", key: "benjadmin-m3-independent" }]);
assert("loser independent scope acquired", result.status === 200, `status=${result.status}`);

const outmin = await openWorker("worker_outminai", "OutminAI");
result = await claim(outmin, "worker_outminai", outminTask);
assert("Outmin task claimed", result.status === 200, `status=${result.status}`);
await bindWorkspace(outmin, "worker/m3-outmin", "/srv/dimpro-dev/worktrees/m3-outmin");
result = await acquire(outmin, [{ type: "release", key: "benjadmin-m3-candidate" }]);
assert("Outmin release scope acquired", result.status === 200, `status=${result.status}`);

result = await request("/api/dev/engine/gate");
assert("three READY sessions gate", result.status === 200 && result.payload?.gate?.sessions?.ready >= 3, `ready=${result.payload?.gate?.sessions?.ready}`);
assert("three worktree leases visible", result.payload?.gate?.orchestration?.activeWorktreeLeases >= 3, `leases=${result.payload?.gate?.orchestration?.activeWorktreeLeases}`);

result = await request("/api/dev/engine/orchestration", "POST", { action: "heartbeat", sessionId: winner.sessionId, leaseSeconds: 900 });
assert("heartbeat renews lease", result.status === 200 && result.payload?.session?.lease_expires_at, `status=${result.status}`);

for (const [sessionId, operation] of [[winner.sessionId, "write"], [loser.sessionId, "migration"], [outmin, "build"]]) {
  const auth = await request("/api/dev/engine/authorize", "POST", { sessionId, operation });
  assert(`operation authorized ${operation}`, auth.status === 200 && auth.payload?.ok === true, `status=${auth.status}`);
}

result = await request("/api/dev/engine/orchestration", "POST", { action: "complete_task", sessionId: outmin, summary: "M3 Outmin acceptance complete" });
assert("Outmin completion releases worker", result.status === 200, `status=${result.status}`);

const recoverySession = await openWorker("worker_outminai", "OutminAI recovery");
result = await claim(recoverySession, "worker_outminai", recoveryTask);
assert("recovery task claimed", result.status === 200, `status=${result.status}`);
await bindWorkspace(recoverySession, "worker/m3-recovery", "/srv/dimpro-dev/worktrees/m3-recovery");
result = await acquire(recoverySession, [{ type: "module", key: "benjadmin-m3-recovery" }]);
assert("recovery scope acquired", result.status === 200, `status=${result.status}`);
const expired = new Date(Date.now() - 60000).toISOString();
const expiryUpdate = await db.from("dev_center_worker_sessions").update({ lease_expires_at: expired }).eq("id", recoverySession);
assert("test lease forced stale", !expiryUpdate.error, expiryUpdate.error?.message || "");
result = await request("/api/dev/engine/orchestration", "POST", { action: "recover_stale", limit: 20 });
assert("stale recovery executed", result.status === 200 && Number(result.payload?.recovery?.recoveredCount || 0) >= 1, `recovered=${result.payload?.recovery?.recoveredCount}`);
const recoveredSession = await db.from("dev_center_worker_sessions").select("status,recovery_count").eq("id", recoverySession).single();
assert("stale session closed", recoveredSession.data?.status === "closed" && Number(recoveredSession.data?.recovery_count || 0) >= 1, JSON.stringify(recoveredSession.data));
const recoveredTask = await db.from("dev_center_tasks").select("status,assigned_worker_id,claimed_by_session_id").eq("id", recoveryTask).single();
assert("stale task requeued", recoveredTask.data?.status === "queued" && !recoveredTask.data?.assigned_worker_id && !recoveredTask.data?.claimed_by_session_id, JSON.stringify(recoveredTask.data));

for (const sessionId of [winner.sessionId, loser.sessionId]) {
  const complete = await request("/api/dev/engine/orchestration", "POST", { action: "complete_task", sessionId, summary: "M3 acceptance complete" });
  assert(`session completed ${sessionId}`, complete.status === 200, `status=${complete.status}`);
}
await db.from("dev_center_tasks").update({ status: "cancelled", completed_at: new Date().toISOString(), metadata: { acceptanceCleanup: true } }).eq("id", recoveryTask).eq("status", "queued");

const snapshot = await request("/api/dev/engine/orchestration");
assert("conflict audit recorded", snapshot.status === 200 && snapshot.payload?.orchestration?.openConflicts?.some((item) => item.conflict_type === "scope"), `openConflicts=${snapshot.payload?.orchestration?.openConflicts?.length}`);

const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({ ok: failed.length === 0, passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
if (failed.length) process.exit(1);
