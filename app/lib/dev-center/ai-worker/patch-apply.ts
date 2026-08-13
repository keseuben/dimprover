import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertDevEngineOperation } from "../engine-repository";
import { parseAndValidateMForgeProviderOutput, readVerifiedMForgeOutputArtifact } from "./provider-output-artifact";
import { validateMForgePatchApplyPlan } from "./patch-apply-plan";
import { applyPatchToVerifiedWorktree, resetVerifiedWorktree } from "./patch-worktree-core";

const PATCH_ROOT = path.resolve(process.env.DIMPRO_AI_WORKER_PATCH_ROOT?.trim() || "/srv/dimpro-dev/data/benjadmin-ai-worker-patches");
type Row = Record<string, unknown>;
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function dbClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function scopePaths(value: unknown) {
  return Array.isArray(value) ? value.map(record).filter((item) => text(item.type) === "path" && text(item.key)).map((item) => text(item.key)) : [];
}

export async function applyValidatedMForgePatch(input: { taskId: string; sessionId: string }) {
  const db = dbClient();
  const taskResult = await db.from("dev_center_tasks").select("id,project_id,status,scope,metadata,assigned_worker_id,branch_name,worktree_path").eq("id", input.taskId).maybeSingle();
  if (taskResult.error) throw new Error(taskResult.error.message);
  if (!taskResult.data) throw new Error("A M.Forge patch task nem található.");
  const task = taskResult.data;
  const meta = record(task.metadata);
  const jit = record(meta.jitWorkspace);
  const outputSummary = record(meta.providerOutputArtifact);
  if (jit.state !== "READY" || text(jit.sessionId) !== input.sessionId || task.assigned_worker_id !== "worker_mforge") throw new Error("A M.Forge JIT workspace/session nincs READY állapotban.");

  const artifact = await readVerifiedMForgeOutputArtifact(outputSummary);
  if (text(artifact.payload.taskId) !== input.taskId) throw new Error("A provider output artifact másik taskhoz tartozik.");
  const allowedPaths = scopePaths(task.scope);
  const revalidated = parseAndValidateMForgeProviderOutput(JSON.stringify({
    schemaVersion: artifact.payload.schemaVersion,
    summary: artifact.payload.summary,
    unifiedDiff: artifact.unifiedDiff,
    tests: artifact.payload.tests,
    notes: artifact.payload.notes,
  }), allowedPaths);
  if (JSON.stringify([...revalidated.changedPaths].sort()) !== JSON.stringify([...artifact.changedPaths].sort())) throw new Error("A provider output artifact changedPaths mezője eltér az újra validált diff tartalmától.");

  const plan = validateMForgePatchApplyPlan({
    taskId: input.taskId,
    sessionId: input.sessionId,
    worktreePath: text(task.worktree_path),
    branchName: text(task.branch_name),
    baselineCommit: text(jit.baselineCommit),
    allowedPaths,
    changedPaths: revalidated.changedPaths,
  });
  await assertDevEngineOperation(input.sessionId, "write");

  const taskDir = path.join(PATCH_ROOT, input.taskId);
  await mkdir(taskDir, { recursive: true, mode: 0o700 });
  const patchPath = path.join(taskDir, `${text(outputSummary.id)}.diff`);
  await writeFile(patchPath, revalidated.unifiedDiff.endsWith("\n") ? revalidated.unifiedDiff : `${revalidated.unifiedDiff}\n`, { mode: 0o600, flag: "wx" });
  const expected = [...revalidated.changedPaths].sort();
  await applyPatchToVerifiedWorktree({ worktreePath: plan.worktreePath, branchName: plan.branchName, baselineCommit: plan.baselineCommit, patchPath, expectedPaths: expected });

  const patchApplication = {
    version: "1.2-patch",
    state: "APPLIED_UNCOMMITTED",
    appliedAt: new Date().toISOString(),
    sessionId: input.sessionId,
    outputArtifactId: text(outputSummary.id),
    outputArtifactSha256: text(outputSummary.sha256),
    patchPath,
    baselineCommit: plan.baselineCommit,
    branchName: plan.branchName,
    worktreePath: plan.worktreePath,
    changedPaths: expected,
    changedFileCount: expected.length,
    productionAccess: "DENY",
    integrated: false,
    committed: false,
  };
  try {
    const update = await db.from("dev_center_tasks").update({ metadata: { ...meta, patchApplication }, updated_at: new Date().toISOString() }).eq("id", input.taskId);
    if (update.error) throw new Error(update.error.message);
    const audit = await db.from("dev_center_audit_events").insert({
      id: `dev-audit-${randomUUID().slice(0, 12)}`,
      actor_type: "system",
      actor_id: "MFORGE",
      action: "AI_WORKER_PATCH_APPLIED_ISOLATED",
      entity_type: "task",
      entity_id: input.taskId,
      task_id: input.taskId,
      project_id: task.project_id,
      summary: `M.Forge patch izolált DEV worktree-ban alkalmazva · ${expected.length} fájl · még nincs commit/integráció.`,
      metadata: patchApplication,
    });
    if (audit.error) throw new Error(audit.error.message);
  } catch (error) {
    await resetVerifiedWorktree(plan.worktreePath, plan.baselineCommit).catch(() => undefined);
    const rolledBack = { ...patchApplication, state: "ROLLED_BACK", rolledBackAt: new Date().toISOString(), rollbackReason: error instanceof Error ? error.message.slice(0, 500) : "Patch metadata/audit persistence failed." };
    try { await db.from("dev_center_tasks").update({ metadata: { ...meta, patchApplication: rolledBack }, updated_at: new Date().toISOString() }).eq("id", input.taskId); } catch {}
    throw error;
  }
  return { ok: true as const, taskId: input.taskId, patchApplication };
}
