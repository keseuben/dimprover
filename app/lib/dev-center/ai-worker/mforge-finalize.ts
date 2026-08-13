import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertDevEngineOperation } from "../engine-repository";
import { releaseSessionAtomic } from "../orchestration-repository";
import { validateMForgeFinalizePlan } from "./mforge-finalize-plan";

const execFileAsync = promisify(execFile);
type Row = Record<string, unknown>;
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function list(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : []; }
function dbClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function git(worktreePath: string, args: string[]) {
  try {
    const { stdout } = await execFileAsync("/usr/bin/git", ["-C", worktreePath, ...args], { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    const detail = error as { stderr?: string; message?: string };
    throw new Error(`M.Forge finalize Git művelet sikertelen: ${(detail.stderr || detail.message || "ismeretlen hiba").slice(0, 800)}`);
  }
}
function statusPaths(status: string) {
  return status.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean).map((line) => line.slice(3).trim()).filter(Boolean).sort();
}

export async function finalizeMForgeResult(input: { taskId: string; sessionId: string }) {
  const db = dbClient();
  const taskResult = await db.from("dev_center_tasks").select("id,project_id,status,metadata,assigned_worker_id,branch_name,worktree_path").eq("id", input.taskId).maybeSingle();
  if (taskResult.error) throw new Error(taskResult.error.message);
  if (!taskResult.data) throw new Error("A M.Forge finalize task nem található.");
  const task = taskResult.data;
  const meta = record(task.metadata);
  const patch = record(meta.patchApplication);
  const jit = record(meta.jitWorkspace);
  if (patch.state !== "APPLIED_UNCOMMITTED" || patch.committed !== false || patch.integrated !== false) throw new Error("M.Forge finalize csak APPLIED_UNCOMMITTED patch állapotból indítható.");
  if (jit.state !== "READY" || text(jit.sessionId) !== input.sessionId || task.assigned_worker_id !== "worker_mforge") throw new Error("A M.Forge finalize JIT session nincs READY állapotban.");
  const plan = validateMForgeFinalizePlan({
    taskId: input.taskId,
    sessionId: input.sessionId,
    branchName: text(task.branch_name),
    worktreePath: text(task.worktree_path),
    baselineCommit: text(patch.baselineCommit),
    changedPaths: list(patch.changedPaths),
  });
  if (text(jit.baselineCommit) !== plan.baselineCommit || text(jit.branchName) !== plan.branchName || text(jit.worktreePath) !== plan.worktreePath) throw new Error("A finalize terv eltér a JIT workspace tervtől.");
  await assertDevEngineOperation(input.sessionId, "write");
  await git(plan.worktreePath, ["diff", "--check"]);
  const [branch, head, status] = await Promise.all([
    git(plan.worktreePath, ["branch", "--show-current"]),
    git(plan.worktreePath, ["rev-parse", "HEAD"]),
    git(plan.worktreePath, ["status", "--porcelain"]),
  ]);
  if (branch !== plan.branchName || head !== plan.baselineCommit) throw new Error("A finalize worktree branch/HEAD eltér a trusted baseline tervtől.");
  if (!status) throw new Error("A finalize worktree nem tartalmaz commitolandó diffet.");
  if (status.split(/\r?\n/).some((line) => line.startsWith("??") || line.startsWith("A ") || line.startsWith("D "))) throw new Error("A finalize worktree új/törölt/untracked fájlt tartalmaz; automatikus commit tiltott.");
  const actualPaths = statusPaths(status);
  if (JSON.stringify(actualPaths) !== JSON.stringify(plan.changedPaths)) throw new Error(`A finalize tényleges pathjai eltérnek a validált patchtől: ${actualPaths.join(", ")}`);

  await git(plan.worktreePath, ["add", "--", ...plan.changedPaths]);
  const staged = (await git(plan.worktreePath, ["diff", "--cached", "--name-only"])).split(/\r?\n/).map((item) => item.trim()).filter(Boolean).sort();
  if (JSON.stringify(staged) !== JSON.stringify(plan.changedPaths)) throw new Error("A staged M.Forge fájllista eltér a validált changedPaths listától.");
  const commitMessage = `M.Forge-AI: ${input.taskId}`;
  await git(plan.worktreePath, ["-c", "user.name=M.Forge-AI", "-c", "user.email=mforge-ai@dimpro.local", "commit", "-m", commitMessage, "--no-gpg-sign"]);
  const [commit, parent, subject, statusAfter] = await Promise.all([
    git(plan.worktreePath, ["rev-parse", "HEAD"]),
    git(plan.worktreePath, ["rev-parse", "HEAD^"]),
    git(plan.worktreePath, ["log", "-1", "--pretty=%s"]),
    git(plan.worktreePath, ["status", "--porcelain"]),
  ]);
  if (!/^[0-9a-f]{40}$/i.test(commit) || parent !== plan.baselineCommit || subject !== commitMessage || statusAfter) throw new Error("A M.Forge eredménycommit visszaellenőrzése sikertelen.");
  const commitReady = {
    version: "1.3-forge-result",
    state: "COMMIT_READY",
    committedAt: new Date().toISOString(),
    workerId: "worker_mforge",
    workerCode: "MFORGE",
    sessionId: input.sessionId,
    baselineCommit: plan.baselineCommit,
    commit,
    branchName: plan.branchName,
    worktreePath: plan.worktreePath,
    changedPaths: plan.changedPaths,
    changedFileCount: plan.changedPaths.length,
    outputArtifactId: text(patch.outputArtifactId),
    productionAccess: "DENY",
    integrated: false,
  };
  const persistCommit = await db.from("dev_center_tasks").update({ metadata: { ...meta, mforgeResult: commitReady }, updated_at: new Date().toISOString() }).eq("id", input.taskId);
  if (persistCommit.error) throw new Error(persistCommit.error.message);

  await releaseSessionAtomic(input.sessionId, "M.Forge result committed; handoff to V.Guard.", false);

  const result = {
    ...commitReady,
    state: "WORKER_DONE",
    finalizedAt: new Date().toISOString(),
    workspaceFrozenForReview: true,
    activeLeaseReleased: true,
  };
  const nextMeta = {
    ...meta,
    workflowState: "WORKER_DONE",
    mforgeResult: result,
    patchApplication: { ...patch, committed: true, commit, integrated: false },
  };
  const finalizeUpdate = await db.from("dev_center_tasks").update({
    status: "ready",
    requested_worker_id: "worker_vguard",
    assigned_worker_id: null,
    claimed_by_session_id: null,
    claim_expires_at: null,
    metadata: nextMeta,
    updated_at: new Date().toISOString(),
  }).eq("id", input.taskId);
  if (finalizeUpdate.error) throw new Error(finalizeUpdate.error.message);
  const audit = await db.from("dev_center_audit_events").insert({
    id: `dev-audit-${randomUUID().slice(0, 12)}`,
    actor_type: "system",
    actor_id: "MFORGE",
    action: "AI_WORKER_MFORGE_RESULT_FINALIZED",
    entity_type: "task",
    entity_id: input.taskId,
    task_id: input.taskId,
    project_id: task.project_id,
    summary: `M.Forge eredmény commitálva és V.Guard review-ra előkészítve · ${plan.changedPaths.length} fájl.`,
    metadata: result,
  });
  if (audit.error) throw new Error(audit.error.message);
  return { ok: true as const, taskId: input.taskId, workflowState: "WORKER_DONE" as const, mforgeResult: result };
}
