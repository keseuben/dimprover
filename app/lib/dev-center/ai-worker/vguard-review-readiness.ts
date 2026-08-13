import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { externalAiBudgetConfiguration, evaluateExternalAiBudget } from "./budget-policy";
import { probeWorkerModelAdapters, resolveWorkerModelAdapter } from "./model-adapter";
import { summarizeExternalAiTaskUsage, summarizeExternalAiUsage } from "./run-ledger";
import { verifyVGuardReviewPrompt } from "./vguard-review-prompt";

type Row = Record<string, unknown>;
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function num(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback; }
function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function getVGuardReviewReadiness(taskId: string) {
  const db = client();
  const taskResult = await db.from("dev_center_tasks").select("id,status,repository_id,requested_worker_id,metadata").eq("id", taskId).maybeSingle();
  if (taskResult.error) throw new Error(taskResult.error.message);
  if (!taskResult.data) return { ok: false as const, error: "A V.Guard review task nem található." };
  const task = taskResult.data;
  const meta = record(task.metadata), forge = record(meta.mforgeResult), prompt = record(meta.vguardReviewPrompt);
  const blockers: string[] = [], warnings: string[] = [];
  if (meta.workflowTarget !== "EXTERNAL_AI_WORKER_V1" || meta.recordType !== "WORKER_TASK") blockers.push("A task nem Külső AI Worker V1 task.");
  if (meta.workflowState !== "WORKER_DONE" || forge.state !== "WORKER_DONE") blockers.push("M.Forge eredmény még nincs WORKER_DONE állapotban.");
  if (task.status !== "ready" || task.requested_worker_id !== "worker_vguard") blockers.push("A task még nincs V.Guard review-ra előirányozva.");
  if (task.repository_id !== "repo_dimprover") blockers.push("A review repository nem repo_dimprover.");
  const baselineCommit = text(forge.baselineCommit), resultCommit = text(forge.commit);
  if (!/^[0-9a-f]{40}$/i.test(baselineCommit) || !/^[0-9a-f]{40}$/i.test(resultCommit)) blockers.push("A M.Forge baseline/result commit meta hiányos.");
  const promptVerification = text(prompt.id) ? await verifyVGuardReviewPrompt(prompt) : { valid: false, reason: "V.Guard review prompt hiányzik." };
  if (!promptVerification.valid) blockers.push(promptVerification.reason);
  if (text(prompt.baselineCommit) && text(prompt.baselineCommit) !== baselineCommit) blockers.push("A V.Guard prompt baseline eltér a M.Forge eredménytől.");
  if (text(prompt.resultCommit) && text(prompt.resultCommit) !== resultCommit) blockers.push("A V.Guard prompt másik M.Forge commitra épül.");
  const worker = await db.from("dev_center_workers").select("id,code,status,metadata").eq("id", "worker_vguard").maybeSingle();
  if (worker.error) throw new Error(worker.error.message);
  if (!worker.data || worker.data.code !== "VGUARD" || worker.data.status !== "ready" || worker.data.metadata?.productionAccess !== "DENY" || worker.data.metadata?.reviewOnly !== true) blockers.push("V.Guard worker policy nem READY/review-only/PROD-DENY.");
  const [taskUsage, systemUsage, probes] = await Promise.all([summarizeExternalAiTaskUsage(taskId), summarizeExternalAiUsage(), probeWorkerModelAdapters()]);
  const config = externalAiBudgetConfiguration();
  const budget = evaluateExternalAiBudget({
    taskCostHuf: taskUsage.costHuf, workerCostHuf: taskUsage.workers.VGUARD?.costHuf || 0,
    dailyCostHuf: systemUsage.dailyCostHuf, monthlyCostHuf: systemUsage.monthlyCostHuf,
    activeMinutes: (taskUsage.workers.VGUARD?.activeTimeMs || 0) / 60000, retryCount: taskUsage.maxRetryIndex,
    taskLimitHuf: num(meta.taskBudgetHuf, config.taskBudgetHuf), workerLimitHuf: num(meta.guardBudgetHuf, config.guardBudgetHuf),
    dailyLimitHuf: config.dailyLimitHuf, monthlyLimitHuf: config.monthlyLimitHuf,
    maxActiveMinutes: num(meta.maxActiveMinutesPerWorker, config.maxActiveMinutesPerWorker), maxRetries: num(meta.maxFixRounds, config.maxFixRounds),
  });
  if (budget.hardStop) blockers.push(...budget.reasons.map((reason) => `Budget hard stop: ${reason}`)); else if (budget.state !== "OK") warnings.push(...budget.reasons);
  const preference = (text(meta.modelPreference) || "AUTO") as "AUTO" | "CLAUDE" | "OPENAI_CODEX";
  const provider = await resolveWorkerModelAdapter(preference, "VGUARD");
  if (!provider) blockers.push("Nincs READY külső modelladapter V.Guard review-hoz.");
  const ready = blockers.length === 0 && Boolean(provider);
  return { ok: true as const, taskId, role: "VGUARD" as const, ready, state: ready ? "READY" as const : "BLOCKED" as const,
    provider: provider ? { provider: provider.provider, label: provider.label, modelId: provider.modelId } : null,
    providerProbes: probes.map((item) => ({ provider: item.provider, label: item.label, configured: item.configured, executionGateEnabled: item.executionGateEnabled, ready: item.ready, modelId: item.modelId })),
    mforgeResult: { baselineCommit, resultCommit, changedFileCount: Array.isArray(forge.changedPaths) ? forge.changedPaths.length : 0 },
    prompt: { valid: promptVerification.valid, reason: promptVerification.reason, sha256: "sha256" in promptVerification ? promptVerification.sha256 : null }, budget, blockers, warnings };
}
