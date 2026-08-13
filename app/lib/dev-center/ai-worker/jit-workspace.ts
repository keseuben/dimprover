import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { openDevEngineSession, advanceDevEngineSession, assertDevEngineOperation } from "../engine-repository";
import { acquireScopeBundleAtomic, claimTaskAtomic, releaseSessionAtomic } from "../orchestration-repository";
import { prepareExternalWorkspace, removeExternalWorkspace } from "./external-workspace";
import { validateMForgeJitWorkspacePlan, type MForgeJitWorkspacePlan } from "./jit-workspace-plan";

type Row = Record<string, unknown>;
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function dbClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function restoreTaskAfterAbort(db: SupabaseClient, taskId: string, input: { scope: MForgeJitWorkspacePlan["scope"]; metadata: Row }) {
  const restoredMetadata = {
    ...input.metadata,
    workflowState: "PREFLIGHT",
    jitWorkspace: {
      state: "ABORTED",
      abortedAt: new Date().toISOString(),
      sideEffectsRemaining: false,
    },
  };
  const result = await db.from("dev_center_tasks").update({
    status: "ready",
    requested_worker_id: "worker_mforge",
    assigned_worker_id: null,
    claimed_by_session_id: null,
    claim_expires_at: null,
    branch_name: null,
    worktree_path: null,
    scope: input.scope,
    metadata: restoredMetadata,
    updated_at: new Date().toISOString(),
  }).eq("id", taskId);
  if (result.error) throw new Error(`A JIT workspace rollback task-helyreállítása sikertelen: ${result.error.message}`);
}

export async function prepareMForgeJitWorkspace(input: MForgeJitWorkspacePlan) {
  const plan = validateMForgeJitWorkspacePlan(input as unknown as Record<string, unknown>);
  const db = dbClient();
  const taskResult = await db.from("dev_center_tasks").select("id,project_id,repository_id,status,scope,metadata,requested_worker_id,assigned_worker_id").eq("id", plan.taskId).maybeSingle();
  if (taskResult.error) throw new Error(taskResult.error.message);
  if (!taskResult.data) throw new Error("A M.Forge JIT task nem található.");
  const task = taskResult.data;
  const metadata = record(task.metadata);
  if (metadata.workflowTarget !== "EXTERNAL_AI_WORKER_V1" || metadata.recordType !== "WORKER_TASK" || metadata.workflowState !== "PREFLIGHT") throw new Error("JIT workspace csak PREFLIGHT állapotú Külső AI Worker V1 taskhoz készíthető.");
  if (task.status !== "ready" || task.repository_id !== plan.repositoryId || task.requested_worker_id !== plan.workerId || task.assigned_worker_id) throw new Error("A task engine állapota nem alkalmas M.Forge JIT claimre.");
  const taskScope = Array.isArray(task.scope) ? task.scope.map((item) => item as { type: string; key: string }) : [];
  if (JSON.stringify(taskScope) !== JSON.stringify(plan.scope)) throw new Error("A JIT workspace scope eltér a task aktuális GREEN scope-jától.");
  const workspaceMeta = record(metadata.workspacePlan);
  if (workspaceMeta.baselineCommit !== plan.baselineCommit || workspaceMeta.branchName !== plan.branchName || workspaceMeta.worktreePath !== plan.worktreePath || workspaceMeta.workerId !== plan.workerId) throw new Error("A JIT workspace terv eltér a BENJADMIN preflight workspacePlan állapotától.");

  let sessionId = "";
  let physicalWorkspaceCreated = false;
  try {
    const opened = await openDevEngineSession({ openedBy: "BenAI", environmentId: plan.environmentId, note: `M.Forge JIT workspace · ${plan.taskId}`, metadata: { origin: "EXTERNAL_AI_WORKER_V12_JIT", taskId: plan.taskId, productionAccess: "DENY" } });
    sessionId = opened.session.id;
    await advanceDevEngineSession(sessionId, "assign_benai", {});
    const worker = await advanceDevEngineSession(sessionId, "bind_worker", { workerId: plan.workerId });
    if (!worker.ok) throw new Error(worker.error || "M.Forge worker binding sikertelen.");
    await claimTaskAtomic({ sessionId, workerId: plan.workerId, taskId: plan.taskId, leaseSeconds: 900 });
    const branch = await advanceDevEngineSession(sessionId, "bind_branch", { branchName: plan.branchName });
    if (!branch.ok) throw new Error(branch.error || "M.Forge branch binding sikertelen.");
    await prepareExternalWorkspace({ workerCode: plan.workerCode, branchName: plan.branchName, worktreePath: plan.worktreePath, baselineCommit: plan.baselineCommit });
    physicalWorkspaceCreated = true;
    const worktree = await advanceDevEngineSession(sessionId, "bind_worktree", { worktreePath: plan.worktreePath });
    if (!worktree.ok) throw new Error(worktree.error || "M.Forge worktree binding sikertelen.");
    const lease = await acquireScopeBundleAtomic({ sessionId, scope: plan.scope, leaseSeconds: 900 });
    const authorization = await assertDevEngineOperation(sessionId, "write");
    const jitWorkspace = {
      version: "1.2-jit",
      state: "READY",
      preparedAt: new Date().toISOString(),
      sessionId,
      workerId: plan.workerId,
      workerCode: plan.workerCode,
      environmentId: plan.environmentId,
      repositoryId: plan.repositoryId,
      baselineCommit: plan.baselineCommit,
      branchName: plan.branchName,
      worktreePath: plan.worktreePath,
      scopeCount: plan.scope.length,
      productionAccess: "DENY",
      writeAuthorized: true,
      worktreeLeaseId: typeof lease.result.worktreeLeaseId === "string" ? lease.result.worktreeLeaseId : null,
    };
    const update = await db.from("dev_center_tasks").update({ metadata: { ...metadata, jitWorkspace }, updated_at: new Date().toISOString() }).eq("id", plan.taskId);
    if (update.error) throw new Error(update.error.message);
    return { ok: true as const, taskId: plan.taskId, sessionId, jitWorkspace, authorization: { operation: authorization.operation, activeLockCount: authorization.activeLockCount, activeWorktreeLeaseCount: authorization.activeWorktreeLeaseCount } };
  } catch (error) {
    const cleanupErrors: string[] = [];
    if (sessionId) {
      try { await releaseSessionAtomic(sessionId, "M.Forge JIT workspace előkészítés megszakadt.", true); } catch (cleanupError) { cleanupErrors.push(cleanupError instanceof Error ? cleanupError.message : "session release hiba"); }
    }
    if (physicalWorkspaceCreated) {
      try { await removeExternalWorkspace({ workerCode: plan.workerCode, branchName: plan.branchName, worktreePath: plan.worktreePath, baselineCommit: plan.baselineCommit }); } catch (cleanupError) { cleanupErrors.push(cleanupError instanceof Error ? cleanupError.message : "workspace cleanup hiba"); }
    }
    try { await restoreTaskAfterAbort(db, plan.taskId, { scope: plan.scope, metadata }); } catch (cleanupError) { cleanupErrors.push(cleanupError instanceof Error ? cleanupError.message : "task restore hiba"); }
    const message = error instanceof Error ? error.message : "M.Forge JIT workspace előkészítési hiba.";
    throw new Error(cleanupErrors.length ? `${message} Cleanup: ${cleanupErrors.join(" | ")}` : message);
  }
}

export async function releaseMForgeJitWorkspace(input: MForgeJitWorkspacePlan & { sessionId: string; reason: string; requeueTask?: boolean; removeWorkspace?: boolean }) {
  const plan = validateMForgeJitWorkspacePlan(input as unknown as Record<string, unknown>);
  if (!input.sessionId) throw new Error("A JIT workspace release sessionId értéke kötelező.");
  const released = await releaseSessionAtomic(input.sessionId, input.reason || "M.Forge JIT session lezárva.", input.requeueTask !== false);
  if (input.removeWorkspace !== false) await removeExternalWorkspace({ workerCode: plan.workerCode, branchName: plan.branchName, worktreePath: plan.worktreePath, baselineCommit: plan.baselineCommit });
  return { ok: true as const, session: released, workspaceRemoved: input.removeWorkspace !== false };
}
