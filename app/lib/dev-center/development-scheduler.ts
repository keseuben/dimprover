import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { autoRouteDevEngineTaskByAvailability } from "./engine-repository";
import { recoverStaleSessionsAtomic } from "./orchestration-repository";

type JsonRecord = Record<string, unknown>;
export type DevelopmentScheduleStatus = "active" | "paused" | "completed" | "cancelled";
export type SchedulerRunStatus = "running" | "ready_for_pull" | "worker_active" | "no_task" | "completed" | "skipped" | "failed";
export type SchedulerTriggerSource = "monitor" | "manual" | "chatgpt" | "recovery";

export class DevelopmentSchedulerError extends Error {
  constructor(message: string, public code: string, public status = 500, public details?: unknown) { super(message); }
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new DevelopmentSchedulerError("A BENJADMIN scheduler adatbázis-kapcsolata nincs beállítva.", "SCHEDULER_DB_NOT_CONFIGURED", 503);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { "x-client-info": "dimpro-benjadmin-development-scheduler/0.1.0" } } });
}

function assertDevRuntime() {
  const cwd = process.cwd();
  if (cwd.startsWith("/srv/dimpro-dev/") || process.env.BENJADMIN_SCHEDULER_ALLOW_LOCAL_DEV === "1") return;
  throw new DevelopmentSchedulerError("A BENJADMIN Development Scheduler csak DEV runtime-ban futhat.", "SCHEDULER_PRODUCTION_DENIED", 403, { productionAccess: "DENY" });
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function numberValue(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function iso(value: unknown) { const raw = text(value); const d = new Date(raw); return raw && Number.isFinite(d.getTime()) ? d.toISOString() : ""; }
function clampCadence(value: unknown) { return Math.max(60, Math.min(1440, Math.round(numberValue(value, 60)))); }
function clampMaxAttempts(value: unknown) { return Math.max(1, Math.min(8, Math.round(numberValue(value, 3)))); }
function clampRetryDelay(value: unknown) { return Math.max(1, Math.min(60, Math.round(numberValue(value, 5)))); }
function isUniqueViolation(error: { code?: string } | null) { return error?.code === "23505"; }

function mapSchedule(row: JsonRecord) {
  return {
    id: text(row.id), projectId: text(row.project_id), title: text(row.title), status: text(row.status) as DevelopmentScheduleStatus,
    timezone: text(row.timezone) || "Europe/Budapest", cadenceMinutes: numberValue(row.cadence_minutes, 60), startAt: text(row.start_at), endAt: text(row.end_at) || null,
    nextRunAt: text(row.next_run_at), lastRunAt: text(row.last_run_at) || null, lastSuccessAt: text(row.last_success_at) || null,
    runCount: numberValue(row.run_count), missedRunCount: numberValue(row.missed_run_count), maxRuns: row.max_runs == null ? null : numberValue(row.max_runs),
    preferredWorkerCode: text(row.preferred_worker_code) || null, missedRunPolicy: text(row.missed_run_policy) || "catch_up_once",
    retryPolicy: record(row.retry_policy), metadata: record(row.metadata), createdBy: text(row.created_by), createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  };
}
function mapRun(row: JsonRecord) {
  return {
    id: text(row.id), scheduleId: text(row.schedule_id), slotAt: text(row.slot_at), status: text(row.status) as SchedulerRunStatus,
    triggerSource: text(row.trigger_source) as SchedulerTriggerSource, taskId: text(row.task_id) || null, workerCode: text(row.worker_code) || null,
    attemptCount: numberValue(row.attempt_count, 1), summary: text(row.summary), metadata: record(row.metadata), startedAt: text(row.started_at), finishedAt: text(row.finished_at) || null,
    createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  };
}

async function audit(db: SupabaseClient, input: { action: string; scheduleId: string; projectId?: string | null; taskId?: string | null; summary: string; metadata?: JsonRecord; level?: "info" | "success" | "warning" | "error" }) {
  const metadata = { productionAccess: "DENY", scheduleId: input.scheduleId, ...(input.metadata || {}) };
  const [auditResult, worklogResult] = await Promise.all([
    db.from("dev_center_audit_events").insert({
      id: `dev-audit-${randomUUID().slice(0, 12)}`, actor_type: "system", actor_id: "BenAI", action: input.action,
      entity_type: "development_schedule", entity_id: input.scheduleId, task_id: input.taskId || null, project_id: input.projectId || null, summary: input.summary, metadata,
    }),
    db.from("dev_center_live_worklog").insert({
      worker_code: "BENAI", task_id: input.taskId || null, phase: "scheduler", level: input.level || "info", summary: input.summary, detail: "",
      progress_percent: null, source: "development-scheduler", metadata: { kind: input.level === "error" ? "ERROR" : input.level === "warning" ? "WARNING" : "TASK_UPDATE", ...metadata },
    }),
  ]);
  if (auditResult.error) throw new DevelopmentSchedulerError("A scheduler audit nem menthető.", "SCHEDULER_AUDIT_FAILED", 500, auditResult.error);
  if (worklogResult.error) throw new DevelopmentSchedulerError("A scheduler munkanapló nem menthető.", "SCHEDULER_WORKLOG_FAILED", 500, worklogResult.error);
}

export async function getDevelopmentSchedulerSnapshot(projectId?: string | null) {
  assertDevRuntime();
  const db = client();
  const probe = await db.from("dev_center_development_schedules").select("id").limit(0);
  if (probe.error) return { ready: false as const, errorCode: probe.error.code || "SCHEDULER_SCHEMA_NOT_READY", schedules: [], runs: [], generatedAt: new Date().toISOString() };
  let scheduleQuery = db.from("dev_center_development_schedules").select("*").order("created_at", { ascending: false }).limit(30);
  if (projectId) scheduleQuery = scheduleQuery.eq("project_id", projectId);
  const schedules = await scheduleQuery;
  if (schedules.error) throw new DevelopmentSchedulerError(schedules.error.message, "SCHEDULER_SCHEDULE_READ_FAILED", 500);
  const ids = (schedules.data || []).map((row) => String(row.id));
  let runs: JsonRecord[] = [];
  if (ids.length) {
    const result = await db.from("dev_center_scheduler_runs").select("*").in("schedule_id", ids).order("slot_at", { ascending: false }).limit(120);
    if (result.error) throw new DevelopmentSchedulerError(result.error.message, "SCHEDULER_RUN_READ_FAILED", 500);
    runs = (result.data || []) as JsonRecord[];
  }
  return {
    ready: true as const,
    heartbeatMode: "MONITOR_60S",
    externalWakeMode: "CHATGPT_SCHEDULED_TASK",
    schedules: (schedules.data || []).map((row) => mapSchedule(row as JsonRecord)),
    runs: runs.map(mapRun),
    generatedAt: new Date().toISOString(),
  };
}

export async function createDevelopmentSchedule(input: {
  projectId: string; title?: string | null; startAt: string; endAt?: string | null; cadenceMinutes?: number | null; timezone?: string | null;
  preferredWorkerCode?: string | null; maxRuns?: number | null; missedRunPolicy?: "catch_up_once" | "skip"; createdBy?: string | null; metadata?: JsonRecord;
}) {
  assertDevRuntime();
  const db = client();
  const projectId = text(input.projectId);
  const startAt = iso(input.startAt);
  const endAt = input.endAt ? iso(input.endAt) : "";
  if (!projectId) throw new DevelopmentSchedulerError("Projektazonosító szükséges.", "SCHEDULER_PROJECT_REQUIRED", 400);
  if (!startAt) throw new DevelopmentSchedulerError("Érvényes kezdési idő szükséges.", "SCHEDULER_START_INVALID", 400);
  if (input.endAt && !endAt) throw new DevelopmentSchedulerError("Érvénytelen befejezési idő.", "SCHEDULER_END_INVALID", 400);
  if (endAt && new Date(endAt).getTime() <= new Date(startAt).getTime()) throw new DevelopmentSchedulerError("A befejezésnek a kezdés után kell lennie.", "SCHEDULER_WINDOW_INVALID", 400);
  const project = await db.from("dev_center_projects").select("id,name,status").eq("id", projectId).maybeSingle();
  if (project.error) throw new DevelopmentSchedulerError(project.error.message, "SCHEDULER_PROJECT_READ_FAILED", 500);
  if (!project.data) throw new DevelopmentSchedulerError("A projekt nem található.", "SCHEDULER_PROJECT_NOT_FOUND", 404);
  const preferredWorkerCode = text(input.preferredWorkerCode).toUpperCase();
  if (preferredWorkerCode && !["ARMINAI", "JAZMINAI", "OUTMINAI"].includes(preferredWorkerCode)) throw new DevelopmentSchedulerError("Ismeretlen worker preferencia.", "SCHEDULER_WORKER_INVALID", 400);
  const cadenceMinutes = clampCadence(input.cadenceMinutes);
  const maxRuns = input.maxRuns == null ? null : Math.max(1, Math.min(168, Math.round(numberValue(input.maxRuns, 1))));
  const row = {
    project_id: projectId,
    title: text(input.title) || `${project.data.name} · ütemezett fejlesztés`,
    status: "active",
    timezone: text(input.timezone) || "Europe/Budapest",
    cadence_minutes: cadenceMinutes,
    start_at: startAt,
    end_at: endAt || null,
    next_run_at: startAt,
    max_runs: maxRuns,
    preferred_worker_code: preferredWorkerCode || null,
    missed_run_policy: input.missedRunPolicy === "skip" ? "skip" : "catch_up_once",
    retry_policy: { maxAttempts: 3, retryDelayMinutes: 5 },
    created_by: text(input.createdBy) || "BenjAdmin",
    metadata: { productionAccess: "DENY", externalWakeMode: "CHATGPT_SCHEDULED_TASK", ...(input.metadata || {}) },
  };
  const result = await db.from("dev_center_development_schedules").insert(row).select("*").single();
  if (result.error) throw new DevelopmentSchedulerError(result.error.message, "SCHEDULER_CREATE_FAILED", 409);
  const schedule = mapSchedule(result.data as JsonRecord);
  await audit(db, { action: "DEVELOPMENT_SCHEDULE_CREATED", scheduleId: schedule.id, projectId, summary: `${schedule.title} · ütemezés létrehozva (${cadenceMinutes} perc).`, metadata: { startAt, endAt: endAt || null, cadenceMinutes, maxRuns } });
  return schedule;
}

export async function setDevelopmentScheduleStatus(scheduleIdValue: string, status: "active" | "paused" | "cancelled") {
  assertDevRuntime();
  const db = client();
  const scheduleId = text(scheduleIdValue);
  const current = await db.from("dev_center_development_schedules").select("*").eq("id", scheduleId).maybeSingle();
  if (current.error) throw new DevelopmentSchedulerError(current.error.message, "SCHEDULER_READ_FAILED", 500);
  if (!current.data) throw new DevelopmentSchedulerError("Az ütemezés nem található.", "SCHEDULER_NOT_FOUND", 404);
  const now = new Date().toISOString();
  const result = await db.from("dev_center_development_schedules").update({ status, updated_at: now }).eq("id", scheduleId).select("*").single();
  if (result.error) throw new DevelopmentSchedulerError(result.error.message, "SCHEDULER_STATUS_UPDATE_FAILED", 409);
  const schedule = mapSchedule(result.data as JsonRecord);
  await audit(db, { action: `DEVELOPMENT_SCHEDULE_${status.toUpperCase()}`, scheduleId, projectId: schedule.projectId, summary: `${schedule.title} · ${status === "active" ? "folytatva" : status === "paused" ? "szüneteltetve" : "megszakítva"}.` });
  return schedule;
}

function nextSlot(slotAt: string, cadenceMinutes: number, nowMs: number) {
  const step = cadenceMinutes * 60_000;
  let nextMs = new Date(slotAt).getTime() + step;
  let missed = 0;
  while (nextMs <= nowMs && missed < 500) { nextMs += step; missed += 1; }
  return { nextRunAt: new Date(nextMs).toISOString(), missedIntermediateSlots: missed };
}

async function advanceSchedule(db: SupabaseClient, schedule: ReturnType<typeof mapSchedule>, slotAt: string, nowIso: string, outcome: SchedulerRunStatus, extraMissed = 0) {
  const nowMs = new Date(nowIso).getTime();
  const advance = nextSlot(slotAt, schedule.cadenceMinutes, nowMs);
  const runCount = schedule.runCount + 1;
  const missedRunCount = schedule.missedRunCount + extraMissed + advance.missedIntermediateSlots;
  const endReached = Boolean(schedule.endAt && new Date(advance.nextRunAt).getTime() >= new Date(schedule.endAt).getTime());
  const maxReached = Boolean(schedule.maxRuns && runCount >= schedule.maxRuns);
  const status: DevelopmentScheduleStatus = endReached || maxReached ? "completed" : schedule.status;
  const patch = {
    status, next_run_at: advance.nextRunAt, last_run_at: nowIso,
    last_success_at: outcome === "failed" || outcome === "skipped" ? schedule.lastSuccessAt : nowIso,
    run_count: runCount, missed_run_count: missedRunCount, updated_at: nowIso,
  };
  const result = await db.from("dev_center_development_schedules").update(patch).eq("id", schedule.id).select("*").single();
  if (result.error) throw new DevelopmentSchedulerError(result.error.message, "SCHEDULER_ADVANCE_FAILED", 500);
  return mapSchedule(result.data as JsonRecord);
}

async function finishRun(db: SupabaseClient, runId: string, patch: { status: SchedulerRunStatus; taskId?: string | null; workerCode?: string | null; summary: string; metadata?: JsonRecord }, nowIso: string) {
  const result = await db.from("dev_center_scheduler_runs").update({
    status: patch.status, task_id: patch.taskId || null, worker_code: patch.workerCode || null, summary: patch.summary,
    metadata: { productionAccess: "DENY", ...(patch.metadata || {}) }, finished_at: nowIso, updated_at: nowIso,
  }).eq("id", runId).select("*").single();
  if (result.error) throw new DevelopmentSchedulerError(result.error.message, "SCHEDULER_RUN_FINISH_FAILED", 500);
  return mapRun(result.data as JsonRecord);
}

async function prepareAlreadyRoutedTask(db: SupabaseClient, task: JsonRecord, scheduleId: string, nowIso: string) {
  const workerId = text(task.assigned_worker_id) || text(task.requested_worker_id);
  if (!workerId) return null;
  const worker = await db.from("dev_center_workers").select("id,code,name,status").eq("id", workerId).maybeSingle();
  if (worker.error || !worker.data) return null;
  const metadata = record(task.metadata);
  const nextMetadata = {
    ...metadata,
    coordinatorChainState: "READY_FOR_PLUS_PULL", coordinatorChainPreparedAt: nowIso, coordinatorChainSource: "BENJADMIN_SCHEDULER",
    coordinatorChainFromTaskId: null, coordinatorChainSourceOutcome: null, coordinatorChainWorkerCode: worker.data.code, coordinatorChainWorkerName: worker.data.name,
    schedulerPreparedBy: scheduleId,
  };
  const update = await db.from("dev_center_tasks").update({ metadata: nextMetadata, updated_at: nowIso }).eq("id", text(task.id)).select("*").single();
  if (update.error) throw new DevelopmentSchedulerError(update.error.message, "SCHEDULER_TASK_PREPARE_FAILED", 409);
  await audit(db, { action: "TASK_BENAI_CHAIN_PREPARED", scheduleId, projectId: text(task.project_id), taskId: text(task.id), summary: `${text(task.title)} · scheduler ChatGPT pullra előkészítette ${worker.data.name} részére.`, metadata: { workerCode: worker.data.code, chainSource: "BENJADMIN_SCHEDULER", preparedAt: nowIso } });
  return { task: update.data as JsonRecord, workerCode: text(worker.data.code), workerName: text(worker.data.name) };
}

async function claimRun(db: SupabaseClient, schedule: ReturnType<typeof mapSchedule>, slotAt: string, source: SchedulerTriggerSource, nowIso: string) {
  const insert = await db.from("dev_center_scheduler_runs").insert({
    schedule_id: schedule.id, slot_at: slotAt, status: "running", trigger_source: source, attempt_count: 1,
    summary: "Scheduler slot feldolgozás alatt.", metadata: { productionAccess: "DENY" }, started_at: nowIso, updated_at: nowIso,
  }).select("*").single();
  if (!insert.error) return { run: mapRun(insert.data as JsonRecord), retry: false, duplicate: false };
  if (!isUniqueViolation(insert.error)) throw new DevelopmentSchedulerError(insert.error.message, "SCHEDULER_RUN_CLAIM_FAILED", 500);
  const existing = await db.from("dev_center_scheduler_runs").select("*").eq("schedule_id", schedule.id).eq("slot_at", slotAt).maybeSingle();
  if (existing.error || !existing.data) throw new DevelopmentSchedulerError(existing.error?.message || "A scheduler run nem olvasható.", "SCHEDULER_RUN_READ_FAILED", 500);
  const run = mapRun(existing.data as JsonRecord);
  if (!["running", "failed"].includes(run.status)) return { run, retry: false, duplicate: true };
  const policy = schedule.retryPolicy;
  const maxAttempts = clampMaxAttempts(policy.maxAttempts);
  const retryDelayMinutes = clampRetryDelay(policy.retryDelayMinutes);
  const retryAfter = text(run.metadata.retryAfterAt);
  const staleRunning = run.status === "running" && new Date(nowIso).getTime() - new Date(run.startedAt).getTime() >= 10 * 60_000;
  const retryDue = run.status === "failed" && (!retryAfter || new Date(retryAfter).getTime() <= new Date(nowIso).getTime());
  if (!staleRunning && !retryDue) return { run, retry: false, duplicate: true };
  if (run.attemptCount >= maxAttempts) return { run, retry: false, duplicate: true, exhausted: true };
  const update = await db.from("dev_center_scheduler_runs").update({
    status: "running", attempt_count: run.attemptCount + 1, trigger_source: "recovery", started_at: nowIso, finished_at: null,
    summary: "Scheduler slot újrapróbálása.", metadata: { ...run.metadata, productionAccess: "DENY", recoveredAt: nowIso, retryDelayMinutes }, updated_at: nowIso,
  }).eq("id", run.id).select("*").single();
  if (update.error) throw new DevelopmentSchedulerError(update.error.message, "SCHEDULER_RUN_RETRY_FAILED", 500);
  return { run: mapRun(update.data as JsonRecord), retry: true, duplicate: false };
}

async function processSchedule(db: SupabaseClient, schedule: ReturnType<typeof mapSchedule>, source: SchedulerTriggerSource, nowIso: string) {
  const slotAt = schedule.nextRunAt;
  const nowMs = new Date(nowIso).getTime();
  const latenessMs = nowMs - new Date(slotAt).getTime();
  const claim = await claimRun(db, schedule, slotAt, source, nowIso);
  if (claim.duplicate && !claim.exhausted) return { scheduleId: schedule.id, slotAt, outcome: "duplicate" as const, run: claim.run };
  if (claim.exhausted) {
    const skipped = await finishRun(db, claim.run.id, { status: "skipped", summary: "Scheduler slot kihagyva: a retry limit elfogyott.", metadata: { ...claim.run.metadata, retryExhaustedAt: nowIso } }, nowIso);
    const updatedSchedule = await advanceSchedule(db, schedule, slotAt, nowIso, "skipped", 1);
    await audit(db, { action: "DEVELOPMENT_SCHEDULER_RETRY_EXHAUSTED", scheduleId: schedule.id, projectId: schedule.projectId, summary: `${schedule.title} · retry limit elfogyott, a slot kihagyva.`, level: "error", metadata: { slotAt, attemptCount: claim.run.attemptCount } });
    return { scheduleId: schedule.id, slotAt, outcome: "skipped" as const, run: skipped, schedule: updatedSchedule };
  }
  if (schedule.missedRunPolicy === "skip" && latenessMs >= schedule.cadenceMinutes * 60_000) {
    const skipped = await finishRun(db, claim.run.id, { status: "skipped", summary: "Későn észlelt slot a skip szabály miatt kihagyva.", metadata: { latenessMinutes: Math.round(latenessMs / 60000) } }, nowIso);
    const updatedSchedule = await advanceSchedule(db, schedule, slotAt, nowIso, "skipped", 1);
    await audit(db, { action: "DEVELOPMENT_SCHEDULER_SLOT_SKIPPED", scheduleId: schedule.id, projectId: schedule.projectId, summary: `${schedule.title} · későn észlelt órás slot kihagyva.`, level: "warning", metadata: { slotAt } });
    return { scheduleId: schedule.id, slotAt, outcome: "skipped" as const, run: skipped, schedule: updatedSchedule };
  }
  try {
    const taskResult = await db.from("dev_center_tasks")
      .select("id,project_id,title,status,priority,requested_worker_id,assigned_worker_id,claimed_by_session_id,metadata,updated_at")
      .eq("project_id", schedule.projectId)
      .in("status", ["queued", "ready", "claimed", "in_progress", "testing"])
      .order("priority", { ascending: false }).order("updated_at", { ascending: true }).limit(40);
    if (taskResult.error) throw new DevelopmentSchedulerError(taskResult.error.message, "SCHEDULER_TASK_READ_FAILED", 500);
    const tasks = (taskResult.data || []) as JsonRecord[];
    const ready = tasks.find((task) => {
      const meta = record(task.metadata);
      return ["queued", "ready"].includes(text(task.status)) && text(meta.coordinatorChainState) === "READY_FOR_PLUS_PULL" && !text(meta.plusBridgePulledAt);
    });
    const active = tasks.find((task) => {
      const meta = record(task.metadata);
      return ["claimed", "in_progress", "testing"].includes(text(task.status)) || text(meta.plusBridgePullState) === "RUNNING" || text(meta.coordinatorChainState) === "PULLED";
    });
    let outcome: SchedulerRunStatus = "no_task";
    let taskId: string | null = null;
    let workerCode: string | null = null;
    let summary = `${schedule.title} · nincs feldolgozható task.`;
    let metadata: JsonRecord = { externalWakeRequired: false };

    if (ready) {
      const meta = record(ready.metadata);
      outcome = "ready_for_pull"; taskId = text(ready.id); workerCode = text(meta.coordinatorChainWorkerCode) || null;
      summary = `${text(ready.title)} · ChatGPT pullra kész.`;
      metadata = { externalWakeRequired: true, preparedAt: text(meta.coordinatorChainPreparedAt) || nowIso, wakeDeadlineAt: new Date(nowMs + 15 * 60_000).toISOString() };
    } else if (active) {
      const meta = record(active.metadata);
      outcome = "worker_active"; taskId = text(active.id); workerCode = text(meta.plusBridgeWorkerCode) || text(meta.coordinatorChainWorkerCode) || null;
      summary = `${text(active.title)} · worker/session már aktív; új task nem indult.`;
      metadata = { externalWakeRequired: false, taskStatus: text(active.status), bridgeState: text(meta.bridgeState) || null };
    } else {
      const candidate = tasks.find((task) => ["queued", "ready"].includes(text(task.status)));
      if (candidate) {
        const routedWorkerId = text(candidate.assigned_worker_id) || text(candidate.requested_worker_id);
        if (routedWorkerId) {
          const prepared = await prepareAlreadyRoutedTask(db, candidate, schedule.id, nowIso);
          if (prepared) {
            outcome = "ready_for_pull"; taskId = text(candidate.id); workerCode = prepared.workerCode;
            summary = `${text(candidate.title)} · scheduler pullra előkészítette.`;
            metadata = { externalWakeRequired: true, wakeDeadlineAt: new Date(nowMs + 15 * 60_000).toISOString(), chainSource: "BENJADMIN_SCHEDULER" };
          }
        } else {
          const routed = await autoRouteDevEngineTaskByAvailability({
            taskId: text(candidate.id), preferredWorkerCode: schedule.preferredWorkerCode, prepareForPlusPull: true,
            chainSource: "BENJADMIN_SCHEDULER", note: "BENJADMIN Development Scheduler órás slot",
          });
          if (routed.routed) {
            outcome = "ready_for_pull"; taskId = routed.task.id; workerCode = routed.worker?.code || null;
            summary = `${routed.task.title} · Ben-AI scheduler ${routed.worker?.name || workerCode || "worker"} részére pullra előkészítette.`;
            metadata = { externalWakeRequired: true, wakeDeadlineAt: new Date(nowMs + 15 * 60_000).toISOString(), chainSource: "BENJADMIN_SCHEDULER" };
          } else {
            outcome = "no_task"; taskId = routed.task.id;
            summary = `${routed.task.title} · nincs szabad worker; a task várólistán maradt.`;
            metadata = { externalWakeRequired: false, routingReason: routed.reason };
          }
        }
      }
    }
    const run = await finishRun(db, claim.run.id, { status: outcome, taskId, workerCode, summary, metadata }, nowIso);
    const updatedSchedule = await advanceSchedule(db, schedule, slotAt, nowIso, outcome);
    await audit(db, {
      action: outcome === "ready_for_pull" ? "DEVELOPMENT_SCHEDULER_READY_FOR_PULL" : outcome === "worker_active" ? "DEVELOPMENT_SCHEDULER_WORKER_ACTIVE" : "DEVELOPMENT_SCHEDULER_NO_TASK",
      scheduleId: schedule.id, projectId: schedule.projectId, taskId, summary,
      level: outcome === "ready_for_pull" ? "success" : outcome === "no_task" ? "warning" : "info",
      metadata: { slotAt, outcome, workerCode, nextRunAt: updatedSchedule.nextRunAt, externalWakeRequired: outcome === "ready_for_pull" },
    });
    return { scheduleId: schedule.id, slotAt, outcome, run, schedule: updatedSchedule };
  } catch (error) {
    const current = await db.from("dev_center_scheduler_runs").select("*").eq("id", claim.run.id).single();
    const currentRun = current.data ? mapRun(current.data as JsonRecord) : claim.run;
    const retryDelayMinutes = clampRetryDelay(schedule.retryPolicy.retryDelayMinutes);
    const retryAfterAt = new Date(new Date(nowIso).getTime() + retryDelayMinutes * 60_000).toISOString();
    const message = error instanceof Error ? error.message.slice(0, 500) : "Ismeretlen scheduler hiba.";
    const failed = await finishRun(db, currentRun.id, { status: "failed", summary: message, metadata: { ...currentRun.metadata, retryAfterAt, errorCode: error instanceof DevelopmentSchedulerError ? error.code : "SCHEDULER_SLOT_FAILED" } }, nowIso);
    await audit(db, { action: "DEVELOPMENT_SCHEDULER_SLOT_FAILED", scheduleId: schedule.id, projectId: schedule.projectId, summary: `${schedule.title} · slot hiba; retry ${retryDelayMinutes} perc múlva.`, level: "error", metadata: { slotAt, retryAfterAt, attemptCount: failed.attemptCount, error: message } });
    return { scheduleId: schedule.id, slotAt, outcome: "failed" as const, run: failed, error: message };
  }
}

async function reconcileExternalWake(db: SupabaseClient, nowIso: string) {
  const cutoff = new Date(new Date(nowIso).getTime() - 24 * 60 * 60_000).toISOString();
  const rows = await db.from("dev_center_scheduler_runs").select("*").eq("status", "ready_for_pull").gte("slot_at", cutoff).order("slot_at", { ascending: true }).limit(50);
  if (rows.error) return { observed: 0, missed: 0, checked: 0 };
  let observed = 0; let missed = 0;
  for (const row of rows.data || []) {
    const run = mapRun(row as JsonRecord);
    if (!run.taskId) continue;
    const task = await db.from("dev_center_tasks").select("id,project_id,title,metadata").eq("id", run.taskId).maybeSingle();
    if (task.error || !task.data) continue;
    const meta = record(task.data.metadata);
    const pulledAt = text(meta.plusBridgePulledAt);
    if (pulledAt && new Date(pulledAt).getTime() >= new Date(run.slotAt).getTime()) {
      const updatedMeta = { ...run.metadata, wakeObservedAt: pulledAt, externalWakeRequired: false };
      await db.from("dev_center_scheduler_runs").update({ status: "completed", summary: `${text(task.data.title)} · ChatGPT pull észlelve.`, metadata: updatedMeta, updated_at: nowIso }).eq("id", run.id);
      observed += 1;
      continue;
    }
    const deadline = text(run.metadata.wakeDeadlineAt);
    if (deadline && new Date(deadline).getTime() <= new Date(nowIso).getTime() && !text(run.metadata.wakeMissAlertedAt)) {
      const updatedMeta = { ...run.metadata, wakeMissAlertedAt: nowIso, externalWakeRequired: true };
      await db.from("dev_center_scheduler_runs").update({ metadata: updatedMeta, updated_at: nowIso }).eq("id", run.id);
      const schedule = await db.from("dev_center_development_schedules").select("project_id,title,metadata").eq("id", run.scheduleId).maybeSingle();
      if (schedule.data) {
        const scheduleMeta = record(schedule.data.metadata);
        const externalWakeMissCount = numberValue(scheduleMeta.externalWakeMissCount) + 1;
        await db.from("dev_center_development_schedules").update({ metadata: { ...scheduleMeta, externalWakeMissCount, lastExternalWakeMissAt: nowIso }, updated_at: nowIso }).eq("id", run.scheduleId);
        await audit(db, { action: "DEVELOPMENT_SCHEDULER_EXTERNAL_WAKE_MISSED", scheduleId: run.scheduleId, projectId: text(schedule.data.project_id), taskId: run.taskId, summary: `${text(schedule.data.title)} · a ChatGPT külső ébresztés 15 percen belül nem vette fel a pullra kész taskot.`, level: "warning", metadata: { slotAt: run.slotAt, wakeDeadlineAt: deadline, externalWakeMissCount } });
      }
      missed += 1;
    }
  }
  return { observed, missed, checked: (rows.data || []).length };
}

export async function runDevelopmentSchedulerTick(input: { source?: SchedulerTriggerSource; now?: string; scheduleId?: string | null } = {}) {
  assertDevRuntime();
  const db = client();
  const nowIso = iso(input.now || new Date().toISOString()) || new Date().toISOString();
  const source = input.source || "monitor";
  const wake = await reconcileExternalWake(db, nowIso);
  let recovery: unknown = null;
  try { recovery = await recoverStaleSessionsAtomic(20); } catch (error) { recovery = { ok: false, error: error instanceof Error ? error.message : "STALE_RECOVERY_FAILED" }; }
  let query = db.from("dev_center_development_schedules").select("*").eq("status", "active").lte("next_run_at", nowIso).order("next_run_at", { ascending: true }).limit(12);
  if (input.scheduleId) query = query.eq("id", text(input.scheduleId));
  const due = await query;
  if (due.error) throw new DevelopmentSchedulerError(due.error.message, "SCHEDULER_DUE_READ_FAILED", 500);
  const outcomes = [];
  for (const row of due.data || []) {
    let schedule = mapSchedule(row as JsonRecord);
    if (schedule.endAt && new Date(schedule.endAt).getTime() <= new Date(nowIso).getTime()) {
      const ended = await db.from("dev_center_development_schedules").update({ status: "completed", updated_at: nowIso }).eq("id", schedule.id).select("*").single();
      if (!ended.error) schedule = mapSchedule(ended.data as JsonRecord);
      outcomes.push({ scheduleId: schedule.id, outcome: "window_completed" as const });
      continue;
    }
    if (schedule.maxRuns && schedule.runCount >= schedule.maxRuns) {
      await db.from("dev_center_development_schedules").update({ status: "completed", updated_at: nowIso }).eq("id", schedule.id);
      outcomes.push({ scheduleId: schedule.id, outcome: "max_runs_completed" as const });
      continue;
    }
    outcomes.push(await processSchedule(db, schedule, source, nowIso));
  }
  return { ok: true as const, now: nowIso, source, dueCount: (due.data || []).length, outcomes, externalWake: wake, staleRecovery: recovery, productionAccess: "DENY" as const };
}
