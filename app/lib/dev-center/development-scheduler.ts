import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { autoRouteDevEngineTaskByAvailability } from "./engine-repository";
import { recoverStaleSessionsAtomic } from "./orchestration-repository";
import { assertWorkerProjectIsolation, PartnerIsolationPolicyError } from "./partner-isolation";

type JsonRecord = Record<string, unknown>;
export type DevelopmentScheduleStatus = "active" | "paused" | "completed" | "cancelled";
export type SchedulerRunStatus = "running" | "ready_for_pull" | "worker_active" | "no_task" | "completed" | "skipped" | "failed";
export type SchedulerTriggerSource = "monitor" | "manual" | "chatgpt" | "recovery";

const SCHEDULE_CATEGORY = "development_scheduler";
const RUN_CATEGORY = "development_scheduler_run";
export const DEVELOPMENT_SCHEDULER_STORAGE_MODE = "CONTROL_PLANE_DECISION_MEMORY_V1";

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

type Schedule = ReturnType<typeof mapSchedule>;
type Run = ReturnType<typeof mapRun>;
type SchedulePatch = Partial<Omit<Schedule, "metadata">> & { metadata?: JsonRecord };

function mapSchedule(row: JsonRecord) {
  const meta = record(row.metadata);
  return {
    id: text(row.id),
    decisionKey: text(row.decision_key),
    projectId: text(meta.projectId),
    title: text(meta.title) || text(row.decision),
    status: (text(meta.scheduleStatus) || "active") as DevelopmentScheduleStatus,
    timezone: text(meta.timezone) || "Europe/Budapest",
    cadenceMinutes: numberValue(meta.cadenceMinutes, 60),
    startAt: text(meta.startAt),
    endAt: text(meta.endAt) || null,
    nextRunAt: text(meta.nextRunAt),
    lastRunAt: text(meta.lastRunAt) || null,
    lastSuccessAt: text(meta.lastSuccessAt) || null,
    runCount: numberValue(meta.runCount),
    missedRunCount: numberValue(meta.missedRunCount),
    maxRuns: meta.maxRuns == null ? null : numberValue(meta.maxRuns),
    preferredWorkerCode: text(meta.preferredWorkerCode) || null,
    missedRunPolicy: text(meta.missedRunPolicy) || "catch_up_once",
    retryPolicy: record(meta.retryPolicy),
    metadata: record(meta.scheduleMetadata),
    createdBy: text(meta.createdBy) || text(row.decided_by) || "BenjAdmin",
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapRun(row: JsonRecord) {
  const meta = record(row.metadata);
  return {
    id: text(row.id),
    decisionKey: text(row.decision_key),
    scheduleId: text(meta.scheduleId),
    slotAt: text(meta.slotAt),
    status: (text(meta.runStatus) || "running") as SchedulerRunStatus,
    triggerSource: (text(meta.triggerSource) || "monitor") as SchedulerTriggerSource,
    taskId: text(meta.taskId) || null,
    workerCode: text(meta.workerCode) || null,
    attemptCount: numberValue(meta.attemptCount, 1),
    summary: text(meta.summary) || text(row.decision),
    metadata: record(meta.runMetadata),
    startedAt: text(meta.startedAt) || text(row.created_at),
    finishedAt: text(meta.finishedAt) || null,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function scheduleMetadata(schedule: Schedule): JsonRecord {
  return {
    kind: "DEVELOPMENT_SCHEDULE_V1",
    storageMode: DEVELOPMENT_SCHEDULER_STORAGE_MODE,
    productionAccess: "DENY",
    projectId: schedule.projectId,
    title: schedule.title,
    scheduleStatus: schedule.status,
    timezone: schedule.timezone,
    cadenceMinutes: schedule.cadenceMinutes,
    startAt: schedule.startAt,
    endAt: schedule.endAt,
    nextRunAt: schedule.nextRunAt,
    lastRunAt: schedule.lastRunAt,
    lastSuccessAt: schedule.lastSuccessAt,
    runCount: schedule.runCount,
    missedRunCount: schedule.missedRunCount,
    maxRuns: schedule.maxRuns,
    preferredWorkerCode: schedule.preferredWorkerCode,
    missedRunPolicy: schedule.missedRunPolicy,
    retryPolicy: schedule.retryPolicy,
    scheduleMetadata: schedule.metadata,
    createdBy: schedule.createdBy,
    externalWakeMode: "CHATGPT_SCHEDULED_TASK",
  };
}

function runMetadata(run: Run): JsonRecord {
  return {
    kind: "DEVELOPMENT_SCHEDULER_RUN_V1",
    storageMode: DEVELOPMENT_SCHEDULER_STORAGE_MODE,
    productionAccess: "DENY",
    scheduleId: run.scheduleId,
    slotAt: run.slotAt,
    runStatus: run.status,
    triggerSource: run.triggerSource,
    taskId: run.taskId,
    workerCode: run.workerCode,
    attemptCount: run.attemptCount,
    summary: run.summary,
    runMetadata: run.metadata,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

async function audit(db: SupabaseClient, input: { action: string; scheduleId: string; projectId?: string | null; taskId?: string | null; summary: string; metadata?: JsonRecord; level?: "info" | "success" | "warning" | "error" }) {
  const metadata = { productionAccess: "DENY", storageMode: DEVELOPMENT_SCHEDULER_STORAGE_MODE, scheduleId: input.scheduleId, ...(input.metadata || {}) };
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

async function decisionMemoryReady(db: SupabaseClient) {
  const probe = await db.from("dev_center_decision_memory").select("id,decision_key").limit(1);
  return { ready: !probe.error, error: probe.error };
}

async function listScheduleRows(db: SupabaseClient, limit = 100) {
  const result = await db.from("dev_center_decision_memory")
    .select("*")
    .eq("category", SCHEDULE_CATEGORY)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (result.error) throw new DevelopmentSchedulerError(result.error.message, "SCHEDULER_SCHEDULE_READ_FAILED", 500);
  return (result.data || []) as JsonRecord[];
}

async function listSchedules(db: SupabaseClient, projectId?: string | null) {
  const rows = await listScheduleRows(db, 100);
  const schedules = rows.map(mapSchedule).filter((item) => item.id && item.projectId);
  return projectId ? schedules.filter((item) => item.projectId === projectId) : schedules;
}

async function listRunRows(db: SupabaseClient, limit = 300) {
  const result = await db.from("dev_center_decision_memory")
    .select("*")
    .eq("category", RUN_CATEGORY)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (result.error) throw new DevelopmentSchedulerError(result.error.message, "SCHEDULER_RUN_READ_FAILED", 500);
  return (result.data || []) as JsonRecord[];
}

async function listRuns(db: SupabaseClient, scheduleIds?: Set<string>) {
  const rows = await listRunRows(db, 300);
  const runs = rows.map(mapRun).filter((item) => item.id && item.scheduleId && item.slotAt);
  return scheduleIds?.size ? runs.filter((item) => scheduleIds.has(item.scheduleId)) : runs;
}

async function getSchedule(db: SupabaseClient, scheduleId: string) {
  const result = await db.from("dev_center_decision_memory").select("*").eq("id", scheduleId).eq("category", SCHEDULE_CATEGORY).maybeSingle();
  if (result.error) throw new DevelopmentSchedulerError(result.error.message, "SCHEDULER_READ_FAILED", 500);
  if (!result.data) throw new DevelopmentSchedulerError("Az ütemezés nem található.", "SCHEDULER_NOT_FOUND", 404);
  return mapSchedule(result.data as JsonRecord);
}

async function updateSchedule(db: SupabaseClient, schedule: Schedule, patch: SchedulePatch) {
  const merged: Schedule = {
    ...schedule,
    ...patch,
    metadata: { ...schedule.metadata, ...record(patch.metadata) },
    updatedAt: new Date().toISOString(),
  };
  const result = await db.from("dev_center_decision_memory").update({
    decision: `${merged.title} · ${merged.status}`,
    rationale: `BENJADMIN Development Scheduler V1 · következő futás: ${merged.nextRunAt || "—"}`,
    source_ref: merged.projectId,
    status: merged.status === "cancelled" ? "withdrawn" : "active",
    metadata: scheduleMetadata(merged),
    updated_at: merged.updatedAt,
  }).eq("id", schedule.id).eq("category", SCHEDULE_CATEGORY).select("*").single();
  if (result.error) throw new DevelopmentSchedulerError(result.error.message, "SCHEDULER_UPDATE_FAILED", 500);
  return mapSchedule(result.data as JsonRecord);
}

async function getRunByKey(db: SupabaseClient, decisionKey: string) {
  const result = await db.from("dev_center_decision_memory").select("*").eq("decision_key", decisionKey).eq("category", RUN_CATEGORY).maybeSingle();
  if (result.error) throw new DevelopmentSchedulerError(result.error.message, "SCHEDULER_RUN_READ_FAILED", 500);
  return result.data ? mapRun(result.data as JsonRecord) : null;
}

async function updateRun(db: SupabaseClient, run: Run, patch: Partial<Omit<Run, "metadata">> & { metadata?: JsonRecord }) {
  const merged: Run = {
    ...run,
    ...patch,
    metadata: { ...run.metadata, ...record(patch.metadata) },
    updatedAt: new Date().toISOString(),
  };
  const result = await db.from("dev_center_decision_memory").update({
    decision: merged.summary || `Scheduler run · ${merged.status}`,
    rationale: `BENJADMIN Development Scheduler V1 · ${merged.slotAt}`,
    source_ref: merged.taskId || merged.scheduleId,
    metadata: runMetadata(merged),
    updated_at: merged.updatedAt,
  }).eq("id", run.id).eq("category", RUN_CATEGORY).select("*").single();
  if (result.error) throw new DevelopmentSchedulerError(result.error.message, "SCHEDULER_RUN_UPDATE_FAILED", 500);
  return mapRun(result.data as JsonRecord);
}

export async function getDevelopmentSchedulerSnapshot(projectId?: string | null) {
  assertDevRuntime();
  const db = client();
  const probe = await decisionMemoryReady(db);
  if (!probe.ready) return {
    ready: false as const,
    errorCode: probe.error?.code || "SCHEDULER_CONTROL_PLANE_NOT_READY",
    storageMode: DEVELOPMENT_SCHEDULER_STORAGE_MODE,
    schedules: [], runs: [], generatedAt: new Date().toISOString(),
  };
  const schedules = await listSchedules(db, projectId);
  const ids = new Set(schedules.map((item) => item.id));
  const runs = await listRuns(db, ids);
  return {
    ready: true as const,
    storageMode: DEVELOPMENT_SCHEDULER_STORAGE_MODE,
    heartbeatMode: "MONITOR_60S",
    externalWakeMode: "CHATGPT_SCHEDULED_TASK",
    schedules,
    runs,
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
  const now = new Date().toISOString();
  const draft = {
    id: "",
    decisionKey: `benjadmin:scheduler:${randomUUID()}`,
    projectId,
    title: text(input.title) || `${project.data.name} · ütemezett fejlesztés`,
    status: "active" as DevelopmentScheduleStatus,
    timezone: text(input.timezone) || "Europe/Budapest",
    cadenceMinutes,
    startAt,
    endAt: endAt || null,
    nextRunAt: startAt,
    lastRunAt: null,
    lastSuccessAt: null,
    runCount: 0,
    missedRunCount: 0,
    maxRuns,
    preferredWorkerCode: preferredWorkerCode || null,
    missedRunPolicy: input.missedRunPolicy === "skip" ? "skip" : "catch_up_once",
    retryPolicy: { maxAttempts: 3, retryDelayMinutes: 5 },
    metadata: { externalWakeMissCount: 0, source: "BENJADMIN_CONSOLE", ...(input.metadata || {}) },
    createdBy: text(input.createdBy) || "BenjAdmin",
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.from("dev_center_decision_memory").insert({
    decision_key: draft.decisionKey,
    category: SCHEDULE_CATEGORY,
    scope: projectId,
    decision: draft.title,
    rationale: "BENJADMIN Development Scheduler V1",
    source_ref: projectId,
    status: "active",
    decided_by: draft.createdBy,
    decided_at: now,
    metadata: scheduleMetadata(draft),
    created_at: now,
    updated_at: now,
  }).select("*").single();
  if (result.error) throw new DevelopmentSchedulerError(result.error.message, "SCHEDULER_CREATE_FAILED", isUniqueViolation(result.error) ? 409 : 500);
  const schedule = mapSchedule(result.data as JsonRecord);
  await audit(db, { action: "DEVELOPMENT_SCHEDULE_CREATED", scheduleId: schedule.id, projectId, summary: `${schedule.title} · ütemezés létrehozva (${cadenceMinutes} perc).`, metadata: { startAt, endAt: endAt || null, cadenceMinutes, maxRuns } });
  return schedule;
}

export async function setDevelopmentScheduleStatus(scheduleIdValue: string, status: "active" | "paused" | "cancelled") {
  assertDevRuntime();
  const db = client();
  const scheduleId = text(scheduleIdValue);
  const schedule = await getSchedule(db, scheduleId);
  const updated = await updateSchedule(db, schedule, { status });
  await audit(db, { action: `DEVELOPMENT_SCHEDULE_${status.toUpperCase()}`, scheduleId, projectId: updated.projectId, summary: `${updated.title} · ${status === "active" ? "folytatva" : status === "paused" ? "szüneteltetve" : "megszakítva"}.` });
  return updated;
}

function nextSlot(slotAt: string, cadenceMinutes: number, nowMs: number) {
  const step = cadenceMinutes * 60_000;
  let nextMs = new Date(slotAt).getTime() + step;
  let missed = 0;
  while (nextMs <= nowMs && missed < 500) { nextMs += step; missed += 1; }
  return { nextRunAt: new Date(nextMs).toISOString(), missedIntermediateSlots: missed };
}

async function advanceSchedule(db: SupabaseClient, schedule: Schedule, slotAt: string, nowIso: string, outcome: SchedulerRunStatus, extraMissed = 0) {
  const nowMs = new Date(nowIso).getTime();
  const advance = nextSlot(slotAt, schedule.cadenceMinutes, nowMs);
  const runCount = schedule.runCount + 1;
  const missedRunCount = schedule.missedRunCount + extraMissed + advance.missedIntermediateSlots;
  const endReached = Boolean(schedule.endAt && new Date(advance.nextRunAt).getTime() >= new Date(schedule.endAt).getTime());
  const maxReached = Boolean(schedule.maxRuns && runCount >= schedule.maxRuns);
  const status: DevelopmentScheduleStatus = endReached || maxReached ? "completed" : schedule.status;
  return updateSchedule(db, schedule, {
    status,
    nextRunAt: advance.nextRunAt,
    lastRunAt: nowIso,
    lastSuccessAt: outcome === "failed" || outcome === "skipped" ? schedule.lastSuccessAt : nowIso,
    runCount,
    missedRunCount,
  });
}

async function finishRun(db: SupabaseClient, run: Run, patch: { status: SchedulerRunStatus; taskId?: string | null; workerCode?: string | null; summary: string; metadata?: JsonRecord }, nowIso: string) {
  return updateRun(db, run, {
    status: patch.status,
    taskId: patch.taskId || null,
    workerCode: patch.workerCode || null,
    summary: patch.summary,
    metadata: patch.metadata,
    finishedAt: nowIso,
  });
}

async function prepareAlreadyRoutedTask(db: SupabaseClient, task: JsonRecord, scheduleId: string, nowIso: string) {
  const workerId = text(task.assigned_worker_id) || text(task.requested_worker_id);
  if (!workerId) return null;
  const worker = await db.from("dev_center_workers").select("id,code,name,status").eq("id", workerId).maybeSingle();
  if (worker.error || !worker.data || ["offline", "paused"].includes(text(worker.data.status).toLowerCase())) return null;
  const sessions = await db.from("dev_center_worker_sessions").select("id,task_id,status").eq("worker_id", workerId).neq("status", "closed").limit(1);
  if (sessions.error) throw new DevelopmentSchedulerError(sessions.error.message, "SCHEDULER_WORKER_SESSION_READ_FAILED", 500);
  if ((sessions.data || []).length > 0) return null;
  try {
    await assertWorkerProjectIsolation(db, { workerId, projectId: text(task.project_id) });
  } catch (error) {
    if (error instanceof PartnerIsolationPolicyError && error.status < 500) return null;
    throw error;
  }
  const metadata = record(task.metadata);
  const nextMetadata = {
    ...metadata,
    coordinatorChainState: "READY_FOR_PLUS_PULL",
    coordinatorChainPreparedAt: nowIso,
    coordinatorChainSource: "BENJADMIN_SCHEDULER",
    coordinatorChainFromTaskId: null,
    coordinatorChainSourceOutcome: null,
    coordinatorChainWorkerCode: worker.data.code,
    coordinatorChainWorkerName: worker.data.name,
    schedulerPreparedBy: scheduleId,
  };
  const update = await db.from("dev_center_tasks").update({ metadata: nextMetadata, updated_at: nowIso }).eq("id", text(task.id)).select("*").single();
  if (update.error) throw new DevelopmentSchedulerError(update.error.message, "SCHEDULER_TASK_PREPARE_FAILED", 409);
  await audit(db, { action: "TASK_BENAI_CHAIN_PREPARED", scheduleId, projectId: text(task.project_id), taskId: text(task.id), summary: `${text(task.title)} · scheduler ChatGPT pullra előkészítette ${worker.data.name} részére.`, metadata: { workerCode: worker.data.code, chainSource: "BENJADMIN_SCHEDULER", preparedAt: nowIso } });
  return { task: update.data as JsonRecord, workerCode: text(worker.data.code), workerName: text(worker.data.name) };
}

async function claimRun(db: SupabaseClient, schedule: Schedule, slotAt: string, source: SchedulerTriggerSource, nowIso: string) {
  const decisionKey = `benjadmin:scheduler-run:${schedule.id}:${slotAt}`;
  const draft: Run = {
    id: "",
    decisionKey,
    scheduleId: schedule.id,
    slotAt,
    status: "running",
    triggerSource: source,
    taskId: null,
    workerCode: null,
    attemptCount: 1,
    summary: "Scheduler slot feldolgozás alatt.",
    metadata: {},
    startedAt: nowIso,
    finishedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const insert = await db.from("dev_center_decision_memory").insert({
    decision_key: decisionKey,
    category: RUN_CATEGORY,
    scope: schedule.projectId,
    decision: draft.summary,
    rationale: `BENJADMIN Development Scheduler V1 · ${slotAt}`,
    source_ref: schedule.id,
    status: "active",
    decided_by: "BenAI",
    decided_at: nowIso,
    metadata: runMetadata(draft),
    created_at: nowIso,
    updated_at: nowIso,
  }).select("*").single();

  if (!insert.error) return { run: mapRun(insert.data as JsonRecord), retry: false, duplicate: false, exhausted: false };
  if (!isUniqueViolation(insert.error)) throw new DevelopmentSchedulerError(insert.error.message, "SCHEDULER_RUN_CLAIM_FAILED", 500);

  const existing = await getRunByKey(db, decisionKey);
  if (!existing) throw new DevelopmentSchedulerError("A scheduler run nem olvasható.", "SCHEDULER_RUN_READ_FAILED", 500);
  if (!["running", "failed"].includes(existing.status)) return { run: existing, retry: false, duplicate: true, exhausted: false };

  const maxAttempts = clampMaxAttempts(schedule.retryPolicy.maxAttempts);
  const retryDelayMinutes = clampRetryDelay(schedule.retryPolicy.retryDelayMinutes);
  const retryAfter = text(existing.metadata.retryAfterAt);
  const staleRunning = existing.status === "running" && new Date(nowIso).getTime() - new Date(existing.startedAt).getTime() >= 10 * 60_000;
  const retryDue = existing.status === "failed" && (!retryAfter || new Date(retryAfter).getTime() <= new Date(nowIso).getTime());
  if (!staleRunning && !retryDue) return { run: existing, retry: false, duplicate: true, exhausted: false };
  if (existing.attemptCount >= maxAttempts) return { run: existing, retry: false, duplicate: true, exhausted: true };

  const recovered = await updateRun(db, existing, {
    status: "running",
    triggerSource: "recovery",
    attemptCount: existing.attemptCount + 1,
    startedAt: nowIso,
    finishedAt: null,
    summary: "Scheduler slot újrapróbálása.",
    metadata: { recoveredAt: nowIso, retryDelayMinutes },
  });
  return { run: recovered, retry: true, duplicate: false, exhausted: false };
}

async function processSchedule(db: SupabaseClient, schedule: Schedule, source: SchedulerTriggerSource, nowIso: string) {
  const slotAt = schedule.nextRunAt;
  const nowMs = new Date(nowIso).getTime();
  const latenessMs = nowMs - new Date(slotAt).getTime();
  const claim = await claimRun(db, schedule, slotAt, source, nowIso);

  if (claim.duplicate && !claim.exhausted) {
    if (["running", "failed"].includes(claim.run.status)) return { scheduleId: schedule.id, slotAt, outcome: "duplicate_wait" as const, run: claim.run };
    const updatedSchedule = await advanceSchedule(db, schedule, slotAt, nowIso, claim.run.status);
    await audit(db, { action: "DEVELOPMENT_SCHEDULER_SLOT_RECOVERED", scheduleId: schedule.id, projectId: schedule.projectId, taskId: claim.run.taskId, summary: `${schedule.title} · korábban lezárt slot schedule-léptetése helyreállítva.`, level: "warning", metadata: { slotAt, runStatus: claim.run.status, nextRunAt: updatedSchedule.nextRunAt } });
    return { scheduleId: schedule.id, slotAt, outcome: "duplicate_recovered" as const, run: claim.run, schedule: updatedSchedule };
  }
  if (claim.exhausted) {
    const skipped = await finishRun(db, claim.run, { status: "skipped", summary: "Scheduler slot kihagyva: a retry limit elfogyott.", metadata: { retryExhaustedAt: nowIso } }, nowIso);
    const updatedSchedule = await advanceSchedule(db, schedule, slotAt, nowIso, "skipped", 1);
    await audit(db, { action: "DEVELOPMENT_SCHEDULER_RETRY_EXHAUSTED", scheduleId: schedule.id, projectId: schedule.projectId, summary: `${schedule.title} · retry limit elfogyott, a slot kihagyva.`, level: "error", metadata: { slotAt, attemptCount: claim.run.attemptCount } });
    return { scheduleId: schedule.id, slotAt, outcome: "skipped" as const, run: skipped, schedule: updatedSchedule };
  }

  if (schedule.missedRunPolicy === "skip" && latenessMs >= schedule.cadenceMinutes * 60_000) {
    const skipped = await finishRun(db, claim.run, { status: "skipped", summary: "Későn észlelt slot a skip szabály miatt kihagyva.", metadata: { latenessMinutes: Math.round(latenessMs / 60000) } }, nowIso);
    const updatedSchedule = await advanceSchedule(db, schedule, slotAt, nowIso, "skipped", 1);
    await audit(db, { action: "DEVELOPMENT_SCHEDULER_SLOT_SKIPPED", scheduleId: schedule.id, projectId: schedule.projectId, summary: `${schedule.title} · későn észlelt órás slot kihagyva.`, level: "warning", metadata: { slotAt } });
    return { scheduleId: schedule.id, slotAt, outcome: "skipped" as const, run: skipped, schedule: updatedSchedule };
  }

  try {
    const taskResult = await db.from("dev_center_tasks")
      .select("id,project_id,title,status,priority,requested_worker_id,assigned_worker_id,claimed_by_session_id,metadata,updated_at")
      .eq("project_id", schedule.projectId)
      .in("status", ["queued", "ready", "claimed", "in_progress", "testing"])
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: true })
      .limit(40);
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
      outcome = "ready_for_pull";
      taskId = text(ready.id);
      workerCode = text(meta.coordinatorChainWorkerCode) || null;
      summary = `${text(ready.title)} · ChatGPT pullra kész.`;
      metadata = { externalWakeRequired: true, preparedAt: text(meta.coordinatorChainPreparedAt) || nowIso, wakeDeadlineAt: new Date(nowMs + 15 * 60_000).toISOString() };
    } else if (active) {
      const meta = record(active.metadata);
      outcome = "worker_active";
      taskId = text(active.id);
      workerCode = text(meta.plusBridgeWorkerCode) || text(meta.coordinatorChainWorkerCode) || null;
      summary = `${text(active.title)} · worker/session már aktív; új task nem indult.`;
      metadata = { externalWakeRequired: false, taskStatus: text(active.status), bridgeState: text(meta.bridgeState) || null };
    } else {
      const candidate = tasks.find((task) => ["queued", "ready"].includes(text(task.status)));
      if (candidate) {
        const routedWorkerId = text(candidate.assigned_worker_id) || text(candidate.requested_worker_id);
        if (routedWorkerId) {
          const prepared = await prepareAlreadyRoutedTask(db, candidate, schedule.id, nowIso);
          if (prepared) {
            outcome = "ready_for_pull";
            taskId = text(candidate.id);
            workerCode = prepared.workerCode;
            summary = `${text(candidate.title)} · scheduler pullra előkészítette.`;
            metadata = { externalWakeRequired: true, wakeDeadlineAt: new Date(nowMs + 15 * 60_000).toISOString(), chainSource: "BENJADMIN_SCHEDULER" };
          }
        } else {
          const routed = await autoRouteDevEngineTaskByAvailability({
            taskId: text(candidate.id),
            preferredWorkerCode: schedule.preferredWorkerCode,
            prepareForPlusPull: true,
            chainSource: "BENJADMIN_SCHEDULER",
            note: "BENJADMIN Development Scheduler órás slot",
          });
          if (routed.routed) {
            outcome = "ready_for_pull";
            taskId = routed.task.id;
            workerCode = routed.worker?.code || null;
            summary = `${routed.task.title} · Ben-AI scheduler ${routed.worker?.name || workerCode || "worker"} részére pullra előkészítette.`;
            metadata = { externalWakeRequired: true, wakeDeadlineAt: new Date(nowMs + 15 * 60_000).toISOString(), chainSource: "BENJADMIN_SCHEDULER" };
          } else {
            outcome = "no_task";
            taskId = routed.task.id;
            summary = `${routed.task.title} · nincs szabad worker; a task várólistán maradt.`;
            metadata = { externalWakeRequired: false, routingReason: routed.reason };
          }
        }
      }
    }

    const run = await finishRun(db, claim.run, { status: outcome, taskId, workerCode, summary, metadata }, nowIso);
    const updatedSchedule = await advanceSchedule(db, schedule, slotAt, nowIso, outcome);
    await audit(db, {
      action: outcome === "ready_for_pull" ? "DEVELOPMENT_SCHEDULER_READY_FOR_PULL" : outcome === "worker_active" ? "DEVELOPMENT_SCHEDULER_WORKER_ACTIVE" : "DEVELOPMENT_SCHEDULER_NO_TASK",
      scheduleId: schedule.id,
      projectId: schedule.projectId,
      taskId,
      summary,
      level: outcome === "ready_for_pull" ? "success" : outcome === "no_task" ? "warning" : "info",
      metadata: { slotAt, outcome, workerCode, nextRunAt: updatedSchedule.nextRunAt, externalWakeRequired: outcome === "ready_for_pull" },
    });
    return { scheduleId: schedule.id, slotAt, outcome, run, schedule: updatedSchedule };
  } catch (error) {
    const currentRun = await getRunByKey(db, claim.run.decisionKey) || claim.run;
    const retryDelayMinutes = clampRetryDelay(schedule.retryPolicy.retryDelayMinutes);
    const retryAfterAt = new Date(new Date(nowIso).getTime() + retryDelayMinutes * 60_000).toISOString();
    const message = error instanceof Error ? error.message.slice(0, 500) : "Ismeretlen scheduler hiba.";
    const failed = await finishRun(db, currentRun, {
      status: "failed",
      summary: message,
      metadata: { retryAfterAt, errorCode: error instanceof DevelopmentSchedulerError ? error.code : "SCHEDULER_SLOT_FAILED" },
    }, nowIso);
    await audit(db, { action: "DEVELOPMENT_SCHEDULER_SLOT_FAILED", scheduleId: schedule.id, projectId: schedule.projectId, summary: `${schedule.title} · slot hiba; retry ${retryDelayMinutes} perc múlva.`, level: "error", metadata: { slotAt, retryAfterAt, attemptCount: failed.attemptCount, error: message } });
    return { scheduleId: schedule.id, slotAt, outcome: "failed" as const, run: failed, error: message };
  }
}

async function reconcileExternalWake(db: SupabaseClient, nowIso: string) {
  const cutoff = new Date(new Date(nowIso).getTime() - 24 * 60 * 60_000).getTime();
  const rows = (await listRuns(db)).filter((run) => run.status === "ready_for_pull" && new Date(run.slotAt).getTime() >= cutoff).sort((a, b) => a.slotAt.localeCompare(b.slotAt)).slice(0, 50);
  let observed = 0;
  let missed = 0;

  for (const run of rows) {
    if (!run.taskId) continue;
    const task = await db.from("dev_center_tasks").select("id,project_id,title,metadata").eq("id", run.taskId).maybeSingle();
    if (task.error || !task.data) continue;
    const meta = record(task.data.metadata);
    const pulledAt = text(meta.plusBridgePulledAt);

    if (pulledAt && new Date(pulledAt).getTime() >= new Date(run.slotAt).getTime()) {
      await updateRun(db, run, {
        status: "completed",
        summary: `${text(task.data.title)} · ChatGPT pull észlelve.`,
        metadata: { wakeObservedAt: pulledAt, externalWakeRequired: false },
        finishedAt: pulledAt,
      });
      observed += 1;
      continue;
    }

    const deadline = text(run.metadata.wakeDeadlineAt);
    if (deadline && new Date(deadline).getTime() <= new Date(nowIso).getTime() && !text(run.metadata.wakeMissAlertedAt)) {
      await updateRun(db, run, { metadata: { wakeMissAlertedAt: nowIso, externalWakeRequired: true } });
      const schedule = await getSchedule(db, run.scheduleId);
      const externalWakeMissCount = numberValue(schedule.metadata.externalWakeMissCount) + 1;
      await updateSchedule(db, schedule, { metadata: { externalWakeMissCount, lastExternalWakeMissAt: nowIso } });
      await audit(db, {
        action: "DEVELOPMENT_SCHEDULER_EXTERNAL_WAKE_MISSED",
        scheduleId: run.scheduleId,
        projectId: schedule.projectId,
        taskId: run.taskId,
        summary: `${schedule.title} · a ChatGPT külső ébresztés 15 percen belül nem vette fel a pullra kész taskot.`,
        level: "warning",
        metadata: { slotAt: run.slotAt, wakeDeadlineAt: deadline, externalWakeMissCount },
      });
      missed += 1;
    }
  }
  return { observed, missed, checked: rows.length };
}

export async function runDevelopmentSchedulerTick(input: { source?: SchedulerTriggerSource; now?: string; scheduleId?: string | null } = {}) {
  assertDevRuntime();
  const db = client();
  const nowIso = iso(input.now || new Date().toISOString()) || new Date().toISOString();
  const source = input.source || "monitor";
  const wake = await reconcileExternalWake(db, nowIso);
  let recovery: unknown = null;
  try { recovery = await recoverStaleSessionsAtomic(20); }
  catch (error) { recovery = { ok: false, error: error instanceof Error ? error.message : "STALE_RECOVERY_FAILED" }; }

  const allSchedules = await listSchedules(db);
  const due = allSchedules
    .filter((schedule) => schedule.status === "active")
    .filter((schedule) => !input.scheduleId || schedule.id === text(input.scheduleId))
    .filter((schedule) => schedule.nextRunAt && new Date(schedule.nextRunAt).getTime() <= new Date(nowIso).getTime())
    .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
    .slice(0, 12);

  const outcomes = [];
  for (const initial of due) {
    let schedule = initial;
    if (schedule.endAt && new Date(schedule.endAt).getTime() <= new Date(nowIso).getTime()) {
      schedule = await updateSchedule(db, schedule, { status: "completed" });
      outcomes.push({ scheduleId: schedule.id, outcome: "window_completed" as const });
      continue;
    }
    if (schedule.maxRuns && schedule.runCount >= schedule.maxRuns) {
      schedule = await updateSchedule(db, schedule, { status: "completed" });
      outcomes.push({ scheduleId: schedule.id, outcome: "max_runs_completed" as const });
      continue;
    }
    outcomes.push(await processSchedule(db, schedule, source, nowIso));
  }

  return {
    ok: true as const,
    now: nowIso,
    source,
    storageMode: DEVELOPMENT_SCHEDULER_STORAGE_MODE,
    dueCount: due.length,
    outcomes,
    externalWake: wake,
    staleRecovery: recovery,
    productionAccess: "DENY" as const,
  };
}
