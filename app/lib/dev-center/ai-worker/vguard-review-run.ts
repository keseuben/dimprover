import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { openDevEngineSession, advanceDevEngineSession, bindDevEngineReviewTaskSession } from "../engine-repository";
import { executeExternalAiProviderText, type ExternalProviderExecutionResult, type ExternalProviderId } from "./provider-executor";
import { recordExternalAiUsage, newExternalAiRunId, summarizeExternalAiTaskUsage } from "./run-ledger";
import { scanSensitiveText } from "./secret-scanner";
import { parseVGuardReviewOutput } from "./vguard-review-core";
import { verifyVGuardReviewPrompt } from "./vguard-review-prompt";
import { getVGuardReviewReadiness } from "./vguard-review-readiness";

type Row = Record<string, unknown>;
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function list(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : []; }
function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function requestVGuardReviewRun(taskId: string) {
  const readiness = await getVGuardReviewReadiness(taskId);
  if (!readiness.ok) return readiness;
  if (!readiness.ready || !readiness.provider?.provider || !readiness.provider.modelId) {
    return { ok: false as const, state: "BLOCKED" as const, code: "AI_WORKER_VGUARD_REVIEW_NOT_READY", error: "A V.Guard review futási kapu BLOCKED.", readiness };
  }
  const provider = readiness.provider.provider;
  if (provider !== "openai" && provider !== "anthropic") return { ok: false as const, state: "BLOCKED" as const, code: "AI_WORKER_VGUARD_PROVIDER_INVALID", error: "A V.Guard provider nem végrehajtható külső adapter." };

  const db = client();
  const taskResult = await db.from("dev_center_tasks").select("id,project_id,status,metadata").eq("id", taskId).single();
  if (taskResult.error) throw new Error(taskResult.error.message);
  const task = taskResult.data, meta = record(task.metadata), forge = record(meta.mforgeResult), promptSummary = record(meta.vguardReviewPrompt);
  const promptVerification = await verifyVGuardReviewPrompt(promptSummary);
  if (!promptVerification.valid || !("path" in promptVerification) || !promptVerification.path) throw new Error("A V.Guard review prompt integritása nem megfelelő.");
  const prompt = await readFile(promptVerification.path, "utf8");
  const changedPaths = list(forge.changedPaths);
  const retryIndex = (await summarizeExternalAiTaskUsage(taskId)).maxRetryIndex;
  const runId = newExternalAiRunId("VGUARD");
  let sessionId = "";
  const startedAt = Date.now();
  let providerResult: ExternalProviderExecutionResult | null = null;
  let usageRecorded = false;
  try {
    const opened = await openDevEngineSession({ openedBy: "BenAI", environmentId: "env_dev", note: `V.Guard independent review · ${taskId}`, metadata: { origin: "EXTERNAL_AI_WORKER_V13_REVIEW", taskId, productionAccess: "DENY", reviewOnly: true } });
    sessionId = opened.session.id;
    await advanceDevEngineSession(sessionId, "assign_benai", {});
    const bound = await advanceDevEngineSession(sessionId, "bind_worker", { workerId: "worker_vguard" });
    if (!bound.ok) throw new Error(bound.error || "V.Guard worker binding sikertelen.");
    await bindDevEngineReviewTaskSession(sessionId, taskId, "worker_vguard");
    const runningMeta = { ...meta, workflowState: "REVIEW_GUARD", vguardRun: { state: "RUNNING", runId, sessionId, provider, modelId: readiness.provider.modelId, startedAt: new Date().toISOString(), productionAccess: "DENY", reviewOnly: true } };
    const running = await db.from("dev_center_tasks").update({ status: "in_progress", metadata: runningMeta, updated_at: new Date().toISOString() }).eq("id", taskId);
    if (running.error) throw new Error(running.error.message);

    providerResult = await executeExternalAiProviderText({ provider: provider as ExternalProviderId, modelId: readiness.provider.modelId, prompt, maxOutputTokens: 8192 });
    if (scanSensitiveText(providerResult.outputText).length) throw new Error("A V.Guard provider output érzékeny mintát tartalmaz; feldolgozás tiltott.");
    const review = parseVGuardReviewOutput(providerResult.outputText, changedPaths);
    await recordExternalAiUsage({ taskId, workerCode: "VGUARD", provider, model: providerResult.modelId, runId: providerResult.providerRunId || runId, inputTokens: providerResult.inputTokens, outputTokens: providerResult.outputTokens, totalTokens: providerResult.totalTokens, costHuf: providerResult.costHuf, wallTimeMs: providerResult.durationMs, activeTimeMs: providerResult.durationMs, retryIndex, changedFiles: changedPaths.length, testsPassed: 0, testsFailed: 0, reviewResult: review.result, stopReason: providerResult.stopReason, finishedAt: new Date().toISOString() });
    usageRecorded = true;
    const workflowState = review.result === "FAIL" ? "HUMAN_DECISION_REQUIRED" : "APPROVED";
    const reviewMeta = { version: "1.3-vguard-review", state: "COMPLETED", reviewedAt: new Date().toISOString(), runId, sessionId, provider, modelId: providerResult.modelId, providerRunId: providerResult.providerRunId, result: review.result, summary: review.summary, findings: review.findings, tests: review.tests, notes: review.notes, mforgeCommit: text(forge.commit), baselineCommit: text(forge.baselineCommit), costHuf: providerResult.costHuf, inputTokens: providerResult.inputTokens, outputTokens: providerResult.outputTokens, totalTokens: providerResult.totalTokens, durationMs: providerResult.durationMs, productionAccess: "DENY", reviewOnly: true };
    const completedRun = { ...record(runningMeta.vguardRun), state: "COMPLETED", finishedAt: new Date().toISOString(), result: review.result, durationMs: providerResult.durationMs };
    const update = await db.from("dev_center_tasks").update({ status: review.result === "FAIL" ? "blocked" : "ready", requested_worker_id: null, assigned_worker_id: null, claimed_by_session_id: null, claim_expires_at: null, metadata: { ...meta, workflowState, vguardRun: completedRun, vguardReview: reviewMeta }, updated_at: new Date().toISOString() }).eq("id", taskId);
    if (update.error) throw new Error(update.error.message);
    await advanceDevEngineSession(sessionId, "close", { reason: `V.Guard review complete: ${review.result}` });
    const audit = await db.from("dev_center_audit_events").insert({ id: `dev-audit-${randomUUID().slice(0, 12)}`, actor_type: "system", actor_id: "VGUARD", action: "AI_WORKER_VGUARD_REVIEW_COMPLETED", entity_type: "task", entity_id: taskId, task_id: taskId, project_id: task.project_id, summary: `V.Guard review: ${review.result} · ${review.findings.length} finding.`, metadata: reviewMeta });
    if (audit.error) throw new Error(audit.error.message);
    return { ok: true as const, taskId, workflowState, review: reviewMeta };
  } catch (error) {
    if (providerResult && !usageRecorded) {
      try { await recordExternalAiUsage({ taskId, workerCode: "VGUARD", provider, model: providerResult.modelId, runId: providerResult.providerRunId || runId, inputTokens: providerResult.inputTokens, outputTokens: providerResult.outputTokens, totalTokens: providerResult.totalTokens, costHuf: providerResult.costHuf, wallTimeMs: providerResult.durationMs, activeTimeMs: providerResult.durationMs, retryIndex, changedFiles: changedPaths.length, testsPassed: 0, testsFailed: 1, reviewResult: null, stopReason: error instanceof Error ? error.message.slice(0, 160) : "review_parse_failed", finishedAt: new Date().toISOString() }); } catch {}
    }
    if (sessionId) await advanceDevEngineSession(sessionId, "close", { reason: "V.Guard review futás megszakadt." }).catch(() => undefined);
    try { await db.from("dev_center_workers").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", "worker_vguard"); } catch {}
    try { await db.from("dev_center_tasks").update({ status: "ready", requested_worker_id: "worker_vguard", assigned_worker_id: null, claimed_by_session_id: null, claim_expires_at: null, metadata: { ...meta, workflowState: "WORKER_DONE", vguardRun: { state: "FAILED", failedAt: new Date().toISOString(), runId, sessionId: sessionId || null, productionAccess: "DENY", error: error instanceof Error ? error.message.slice(0, 500) : "ismeretlen hiba", durationMs: Date.now() - startedAt } }, updated_at: new Date().toISOString() }).eq("id", taskId); } catch {}
    throw error;
  }
}
