import { readFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyValidatedMForgePatch } from "./patch-apply";
import { finalizeMForgeResult } from "./mforge-finalize";
import { prepareMForgeJitWorkspace, releaseMForgeJitWorkspace } from "./jit-workspace";
import type { MForgeJitWorkspacePlan } from "./jit-workspace-plan";
import { executeExternalAiProviderText, type ExternalProviderExecutionResult, type ExternalProviderId } from "./provider-executor";
import { persistValidatedMForgeOutputArtifact } from "./provider-output-artifact";
import { verifyMForgeProviderPrompt } from "./provider-prompt";
import { recordExternalAiUsage, newExternalAiRunId, summarizeExternalAiTaskUsage } from "./run-ledger";
import { getExternalAiRunReadiness } from "./run-readiness";

type Row = Record<string, unknown>;
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function scopeList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => record(item)).map((item) => ({ type: text(item.type), key: text(item.key) })).filter((item) => item.type && item.key)
    : [];
}
function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function executeMForgeRun(taskId: string) {
  const readiness = await getExternalAiRunReadiness(taskId, "MFORGE");
  if (!readiness.ok) return readiness;
  if (!readiness.ready || !readiness.provider?.provider || !readiness.provider.modelId) {
    return { ok: false as const, state: "BLOCKED" as const, code: "AI_WORKER_RUN_READINESS_BLOCKED", error: "M.Forge nem indítható: a futási readiness kapu blokkol.", readiness };
  }
  const provider = readiness.provider.provider;
  if (provider !== "openai" && provider !== "anthropic") {
    return { ok: false as const, state: "BLOCKED" as const, code: "AI_WORKER_PROVIDER_INVALID", error: "Az M.Forge provider nem végrehajtható külső adapter." };
  }

  const db = client();
  const taskResult = await db.from("dev_center_tasks").select("id,project_id,repository_id,status,scope,metadata").eq("id", taskId).maybeSingle();
  if (taskResult.error) throw new Error(taskResult.error.message);
  if (!taskResult.data) return { ok: false as const, code: "AI_WORKER_TASK_NOT_FOUND", error: "Az AI worker task nem található." };
  const task = taskResult.data;
  const meta = record(task.metadata);
  const workspace = record(meta.workspacePlan);
  const promptSummary = record(meta.providerPrompt);
  const scope = scopeList(task.scope);
  const allowedPaths = scope.filter((item) => item.type === "path").map((item) => item.key);
  const promptVerification = await verifyMForgeProviderPrompt(promptSummary);
  if (!promptVerification.valid || !("path" in promptVerification) || !promptVerification.path) throw new Error("Az M.Forge provider prompt integritása nem megfelelő.");
  const prompt = await readFile(promptVerification.path, "utf8");
  const jitPlan: MForgeJitWorkspacePlan = {
    taskId,
    workerId: "worker_mforge",
    workerCode: "MFORGE",
    environmentId: "env_dev",
    repositoryId: "repo_dimprover",
    baselineCommit: text(workspace.baselineCommit),
    branchName: text(workspace.branchName),
    worktreePath: text(workspace.worktreePath),
    scope,
  };
  const runId = newExternalAiRunId("MFORGE");
  const retryIndex = (await summarizeExternalAiTaskUsage(taskId)).maxRetryIndex;
  let sessionId = "";
  let providerResult: ExternalProviderExecutionResult | null = null;
  let usageRecorded = false;
  let workspacePrepared = false;
  const startedAt = Date.now();

  try {
    const prepared = await prepareMForgeJitWorkspace(jitPlan);
    sessionId = prepared.sessionId;
    workspacePrepared = true;

    const latestBeforeRun = await db.from("dev_center_tasks").select("metadata").eq("id", taskId).single();
    if (latestBeforeRun.error) throw new Error(latestBeforeRun.error.message);
    const latestMeta = record(latestBeforeRun.data.metadata);
    const runningMeta = {
      ...latestMeta,
      workflowState: "RUNNING_FORGE",
      runCoordinator: {
        version: "1.3-executor",
        state: "RUNNING",
        runId,
        sessionId,
        provider,
        modelId: readiness.provider.modelId,
        startedAt: new Date().toISOString(),
        productionAccess: "DENY",
        sideEffectsCreated: true,
      },
    };
    const running = await db.from("dev_center_tasks").update({ metadata: runningMeta, updated_at: new Date().toISOString() }).eq("id", taskId);
    if (running.error) throw new Error(running.error.message);

    providerResult = await executeExternalAiProviderText({ provider: provider as ExternalProviderId, modelId: readiness.provider.modelId, prompt, maxOutputTokens: 16384 });
    const artifact = await persistValidatedMForgeOutputArtifact({
      taskId,
      rawOutput: providerResult.outputText,
      allowedPaths,
      provider,
      modelId: providerResult.modelId,
      providerRunId: providerResult.providerRunId || runId,
    });
    const changedFiles = artifact.artifact.changedFileCount || 0;
    const applied = await applyValidatedMForgePatch({ taskId, sessionId });
    const finalized = await finalizeMForgeResult({ taskId, sessionId });

    await recordExternalAiUsage({
      taskId,
      workerCode: "MFORGE",
      provider,
      model: providerResult.modelId,
      runId: providerResult.providerRunId || runId,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      totalTokens: providerResult.totalTokens,
      costHuf: providerResult.costHuf,
      wallTimeMs: providerResult.durationMs,
      activeTimeMs: providerResult.durationMs,
      retryIndex,
      changedFiles,
      testsPassed: 1,
      testsFailed: 0,
      reviewResult: null,
      stopReason: providerResult.stopReason,
      finishedAt: new Date().toISOString(),
    });
    usageRecorded = true;
    return {
      ok: true as const,
      state: "WORKER_DONE" as const,
      taskId,
      runId,
      sessionId,
      provider,
      modelId: providerResult.modelId,
      artifact: artifact.artifact,
      patchApplication: applied.patchApplication,
      mforgeResult: finalized.mforgeResult,
    };
  } catch (error) {
    if (providerResult && !usageRecorded) {
      try {
        await recordExternalAiUsage({
          taskId,
          workerCode: "MFORGE",
          provider,
          model: providerResult.modelId,
          runId: providerResult.providerRunId || runId,
          inputTokens: providerResult.inputTokens,
          outputTokens: providerResult.outputTokens,
          totalTokens: providerResult.totalTokens,
          costHuf: providerResult.costHuf,
          wallTimeMs: providerResult.durationMs,
          activeTimeMs: providerResult.durationMs,
          retryIndex,
          changedFiles: 0,
          testsPassed: 0,
          testsFailed: 1,
          reviewResult: null,
          stopReason: error instanceof Error ? error.message.slice(0, 160) : "mforge_run_failed",
          finishedAt: new Date().toISOString(),
        });
      } catch {}
    }
    if (workspacePrepared && sessionId) {
      try {
        await releaseMForgeJitWorkspace({ ...jitPlan, sessionId, reason: "M.Forge provider futás megszakadt.", requeueTask: true, removeWorkspace: true });
      } catch {}
    }
    try {
      const failedTask = await db.from("dev_center_tasks").select("metadata").eq("id", taskId).maybeSingle();
      const failedMeta = record(failedTask.data?.metadata);
      await db.from("dev_center_tasks").update({
        status: "ready",
        requested_worker_id: "worker_mforge",
        assigned_worker_id: null,
        claimed_by_session_id: null,
        claim_expires_at: null,
        branch_name: null,
        worktree_path: null,
        metadata: {
          ...failedMeta,
          workflowState: "PREFLIGHT",
          jitWorkspace: { state: "ABORTED", abortedAt: new Date().toISOString(), sideEffectsRemaining: false },
          runCoordinator: {
            version: "1.3-executor",
            state: "FAILED",
            runId,
            sessionId: sessionId || null,
            failedAt: new Date().toISOString(),
            productionAccess: "DENY",
            sideEffectsCreated: workspacePrepared,
            sideEffectsRemaining: false,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message.slice(0, 500) : "ismeretlen M.Forge futási hiba",
          },
        },
        updated_at: new Date().toISOString(),
      }).eq("id", taskId);
    } catch {}
    throw error;
  }
}
