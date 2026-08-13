import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getExternalAiRunReadiness } from "./run-readiness";
import { EXTERNAL_AI_RUN_COORDINATOR_VERSION, getExternalAiRunLaunchPlan } from "./run-launch-plan";

type Row = Record<string, unknown>;

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function recordBlockedRunRequest(db: SupabaseClient, input: {
  taskId: string;
  projectId: string | null;
  metadata: Row;
  blockers: string[];
  warnings: string[];
  code: string;
}) {
  const now = new Date().toISOString();
  const runCoordinator = {
    version: EXTERNAL_AI_RUN_COORDINATOR_VERSION,
    state: "BLOCKED",
    checkedAt: now,
    workerId: "worker_mforge",
    workerCode: "MFORGE",
    blockers: input.blockers,
    warnings: input.warnings,
    code: input.code,
    sideEffectsCreated: false,
    sessionId: null,
    runId: null,
  };

  const update = await db.from("dev_center_tasks").update({
    metadata: { ...input.metadata, runCoordinator },
    updated_at: now,
  }).eq("id", input.taskId);
  if (update.error) throw new Error(update.error.message);

  const audit = await db.from("dev_center_audit_events").insert({
    id: `dev-audit-${randomUUID().slice(0, 12)}`,
    actor_type: "system",
    actor_id: "BenAI",
    action: "AI_WORKER_RUN_BLOCKED",
    entity_type: "task",
    entity_id: input.taskId,
    task_id: input.taskId,
    project_id: input.projectId,
    summary: `M.Forge indítás blokkolva · ${input.blockers.length} blocker.`,
    metadata: {
      coordinatorVersion: EXTERNAL_AI_RUN_COORDINATOR_VERSION,
      code: input.code,
      blockers: input.blockers,
      warnings: input.warnings,
      sideEffectsCreated: false,
    },
  });
  if (audit.error) throw new Error(audit.error.message);

  const worklog = await db.from("dev_center_live_worklog").insert({
    worker_code: "MFORGE",
    task_id: input.taskId,
    phase: "provider_gate",
    level: "warning",
    summary: "M.Forge indítás blokkolva — futási előfeltétel hiányzik.",
    detail: input.blockers.join("\n").slice(0, 4000),
    progress_percent: 0,
    source: "external-ai-worker",
    metadata: {
      recordType: "EXTERNAL_AI_RUN_GATE",
      coordinatorVersion: EXTERNAL_AI_RUN_COORDINATOR_VERSION,
      code: input.code,
      blockers: input.blockers,
      warnings: input.warnings,
      sideEffectsCreated: false,
    },
  });
  if (worklog.error) throw new Error(worklog.error.message);

  return runCoordinator;
}

export async function requestExternalAiWorkerRun(taskId: string) {
  const db = client();
  const taskResult = await db.from("dev_center_tasks").select("id,project_id,metadata").eq("id", taskId).maybeSingle();
  if (taskResult.error) throw new Error(taskResult.error.message);
  if (!taskResult.data) {
    return { ok: false as const, error: "Az AI worker task nem található.", code: "AI_WORKER_TASK_NOT_FOUND" };
  }

  const metadata = record(taskResult.data.metadata);
  if (metadata.workflowTarget !== "EXTERNAL_AI_WORKER_V1" || metadata.recordType !== "WORKER_TASK") {
    return { ok: false as const, error: "A task nem Külső AI Worker V1 task.", code: "AI_WORKER_TASK_TYPE_INVALID" };
  }

  const readiness = await getExternalAiRunReadiness(taskId, "MFORGE");
  if (!readiness.ok) return readiness;
  const plan = getExternalAiRunLaunchPlan(taskId);

  if (!readiness.ready) {
    const coordinator = await recordBlockedRunRequest(db, {
      taskId,
      projectId: taskResult.data.project_id || null,
      metadata,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
      code: "AI_WORKER_RUN_READINESS_BLOCKED",
    });
    return {
      ok: false as const,
      state: "BLOCKED" as const,
      code: "AI_WORKER_RUN_READINESS_BLOCKED",
      error: "M.Forge nem indítható: a futási readiness kapu blokkol.",
      readiness,
      coordinator,
      plan,
    };
  }

  const coordinatorBlocker = "A provider-run executor JIT workspace handoffja még nincs aktiválva; biztonsági okból a coordinator nem nyit sessiont vagy worktree-t.";
  const coordinator = await recordBlockedRunRequest(db, {
    taskId,
    projectId: taskResult.data.project_id || null,
    metadata,
    blockers: [coordinatorBlocker],
    warnings: readiness.warnings,
    code: "AI_WORKER_RUN_COORDINATOR_EXECUTOR_NOT_BOUND",
  });
  return {
    ok: false as const,
    state: "BLOCKED" as const,
    code: "AI_WORKER_RUN_COORDINATOR_EXECUTOR_NOT_BOUND",
    error: coordinatorBlocker,
    readiness,
    coordinator,
    plan,
  };
}
