import { randomUUID } from "node:crypto";
import { DevWorktreeValidationError, validateGitWorktreeForPlane } from "./worktree-validation";
import { assertManualBridgeTransition, buildManualBridgeHandoff, buildManualBridgeResult, normalizeManualBridgeState, type ManualBridgeState } from "./manual-bridge";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEV_CENTER_ENGINE_BOOTSTRAP_ID, DEV_CENTER_ENGINE_REQUIRED_WORKERS, DEV_CENTER_ENGINE_SCHEMA_VERSION, DEV_CENTER_ENGINE_TABLES } from "./engine-schema";
import type { DevEngineGateStatus, DevEngineHandshakeStage, DevEngineOperation, DevEngineScope, DevEngineTask, DevEngineTaskStatus, DevEngineWorker, DevEngineWorkerSession } from "./engine-types";
import {
  assertPartnerEngineOperationIsolation,
  assertRepositoryIsolation,
  assertScopeIsolation,
  assertWorkerProjectIsolation,
  PartnerIsolationPolicyError,
  resolveDevelopmentPlane,
} from "./partner-isolation";

type DbError = { code?: string; message?: string; details?: string; hint?: string } | null;
type JsonRecord = Record<string, unknown>;

export class DevCenterEngineError extends Error {
  constructor(message: string, public code: string, public status = 500, public details?: unknown) { super(message); }
}

function getDatabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey || serviceKey.includes("<") || serviceKey.includes(">")) {
    throw new DevCenterEngineError("A BENJADMIN PostgreSQL-kapcsolata nincs beállítva.", "DEV_CENTER_DATABASE_NOT_CONFIGURED", 503);
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-benjadmin-dev-center/0.3.0" } },
  });
}

function databaseError(message: string, error: DbError, status = 500): never {
  const missing = error?.code === "PGRST205" || error?.code === "42P01";
  throw new DevCenterEngineError(
    missing ? "A BENJADMIN M3 PostgreSQL-sémája még nincs alkalmazva." : message,
    missing ? "DEV_CENTER_SCHEMA_NOT_READY" : error?.code || "DEV_CENTER_DATABASE_ERROR",
    missing ? 503 : status,
    error ? { message: error.message, details: error.details, hint: error.hint } : undefined,
  );
}

function text(value: unknown, fallback = "") { return typeof value === "string" ? value.trim() : fallback; }
function nowIso() { return new Date().toISOString(); }
function leaseIso(seconds = 900) { return new Date(Date.now() + Math.max(60, Math.min(3600, seconds)) * 1000).toISOString(); }
function jsonRecord(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []; }
function normalizeScope(value: unknown): DevEngineScope[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => jsonRecord(item)).map((item) => ({ type: text(item.type, "path") as DevEngineScope["type"], key: text(item.key) }))
    .filter((item) => ["path", "module", "migration", "release", "environment"].includes(item.type) && item.key.length > 0);
}
function clampPriority(value: unknown) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50; }

function mapWorker(row: JsonRecord): DevEngineWorker {
  return { id: text(row.id), code: text(row.code), name: text(row.name), role: text(row.role), status: text(row.status) as DevEngineWorker["status"], capabilities: stringArray(row.capabilities), metadata: jsonRecord(row.metadata), createdAt: text(row.created_at), updatedAt: text(row.updated_at) };
}
function mapTask(row: JsonRecord): DevEngineTask {
  return { id: text(row.id), projectId: text(row.project_id), versionId: text(row.version_id) || null, repositoryId: text(row.repository_id) || null,
    title: text(row.title), description: text(row.description), status: text(row.status) as DevEngineTaskStatus, priority: Number(row.priority || 0),
    requestedWorkerId: text(row.requested_worker_id) || null, assignedWorkerId: text(row.assigned_worker_id) || null, claimedBySessionId: text(row.claimed_by_session_id) || null,
    branchName: text(row.branch_name) || null, worktreePath: text(row.worktree_path) || null, scope: normalizeScope(row.scope), acceptance: stringArray(row.acceptance),
    blockedReason: text(row.blocked_reason) || null, claimExpiresAt: text(row.claim_expires_at) || null, lastClaimedAt: text(row.last_claimed_at) || null, attemptCount: Number(row.attempt_count || 0), createdBy: text(row.created_by), createdAt: text(row.created_at), updatedAt: text(row.updated_at),
    startedAt: text(row.started_at) || null, completedAt: text(row.completed_at) || null, metadata: jsonRecord(row.metadata) };
}
function mapSession(row: JsonRecord): DevEngineWorkerSession {
  return { id: text(row.id), coordinator: text(row.coordinator), openedBy: text(row.opened_by), workerId: text(row.worker_id) || null,
    taskId: text(row.task_id) || null, projectId: text(row.project_id) || null, versionId: text(row.version_id) || null,
    repositoryId: text(row.repository_id) || null, environmentId: text(row.environment_id) || null,
    status: text(row.status) as DevEngineWorkerSession["status"], handshakeStage: text(row.handshake_stage) as DevEngineHandshakeStage,
    branchName: text(row.branch_name) || null, worktreePath: text(row.worktree_path) || null, scope: normalizeScope(row.scope), note: text(row.note) || null,
    openedAt: text(row.opened_at), lastHeartbeatAt: text(row.last_heartbeat_at), leaseExpiresAt: text(row.lease_expires_at) || null, recoveryCount: Number(row.recovery_count || 0), lastRecoveredAt: text(row.last_recovered_at) || null, closedAt: text(row.closed_at) || null, closeReason: text(row.close_reason) || null,
    metadata: jsonRecord(row.metadata), updatedAt: text(row.updated_at) };
}

export async function getDevCenterEngineHealth() {
  try {
    const client = getDatabaseClient();
    const checks = await Promise.all(DEV_CENTER_ENGINE_TABLES.map(async (table) => {
      const { error } = await client.from(table).select("*").limit(0);
      return { table, ready: !error, errorCode: error?.code || null, errorMessage: error?.message || null };
    }));
    const { data: marker, error: markerError } = await client.from("dev_center_schema_meta").select("schema_version,migration_count,bootstrap_id").eq("component", "dev-center-engine").maybeSingle();
    const markerReady = !markerError && marker?.schema_version === DEV_CENTER_ENGINE_SCHEMA_VERSION && marker?.bootstrap_id === DEV_CENTER_ENGINE_BOOTSTRAP_ID;
    return { configured: true, ready: checks.every((item) => item.ready) && markerReady, provider: "supabase" as const,
      expectedSchemaVersion: DEV_CENTER_ENGINE_SCHEMA_VERSION, actualSchemaVersion: marker?.schema_version || null,
      bootstrapId: marker?.bootstrap_id || null, migrationCount: marker?.migration_count == null ? null : Number(marker.migration_count), checks,
      errorCode: checks.find((item) => !item.ready)?.errorCode || markerError?.code || (markerReady ? null : "DEV_CENTER_SCHEMA_VERSION_MISMATCH") };
  } catch (error) {
    return { configured: !(error instanceof DevCenterEngineError && error.code === "DEV_CENTER_DATABASE_NOT_CONFIGURED"), ready: false, provider: "supabase" as const,
      expectedSchemaVersion: DEV_CENTER_ENGINE_SCHEMA_VERSION, actualSchemaVersion: null, bootstrapId: null, migrationCount: null,
      checks: DEV_CENTER_ENGINE_TABLES.map((table) => ({ table, ready: false, errorCode: error instanceof DevCenterEngineError ? error.code : "DEV_CENTER_DATABASE_ERROR", errorMessage: null })),
      errorCode: error instanceof DevCenterEngineError ? error.code : "DEV_CENTER_DATABASE_ERROR" };
  }
}

async function requireClient() {
  const health = await getDevCenterEngineHealth();
  if (!health.ready) throw new DevCenterEngineError("A BENJADMIN M3 PostgreSQL engine nem áll készen.", health.errorCode || "DEV_CENTER_SCHEMA_NOT_READY", 503, health);
  return getDatabaseClient();
}

async function addAudit(client: SupabaseClient, input: { action: string; entityType: string; entityId?: string | null; sessionId?: string | null; taskId?: string | null; projectId?: string | null; summary?: string; metadata?: JsonRecord }) {
  const { error } = await client.from("dev_center_audit_events").insert({
    id: `dev-audit-${randomUUID().slice(0, 12)}`, actor_type: "system", actor_id: "BenAI", action: input.action,
    entity_type: input.entityType, entity_id: input.entityId || null, session_id: input.sessionId || null,
    task_id: input.taskId || null, project_id: input.projectId || null, summary: input.summary || "", metadata: input.metadata || {},
  });
  if (error) databaseError("A BENJADMIN audit esemény rögzítése sikertelen.", error);
}

async function addSessionEvent(client: SupabaseClient, sessionId: string, stage: DevEngineHandshakeStage, eventType: string, summary: string, metadata: JsonRecord = {}) {
  const { error } = await client.from("dev_center_session_events").insert({
    id: `dev-session-event-${randomUUID().slice(0, 12)}`, session_id: sessionId, stage, event_type: eventType,
    actor: "BenAI", summary, metadata,
  });
  if (error) databaseError("A session esemény rögzítése sikertelen.", error);
}

export async function getDevCenterEngineState() {
  const client = await requireClient();
  const [workers, tasks, dependencies, sessions, locks, worktreeLeases, conflicts, environments, repositories, builds, releases, backups] = await Promise.all([
    client.from("dev_center_workers").select("*").order("code"),
    client.from("dev_center_tasks").select("*").order("priority", { ascending: false }).order("created_at"),
    client.from("dev_center_task_dependencies").select("*"),
    client.from("dev_center_worker_sessions").select("*").order("opened_at", { ascending: false }),
    client.from("dev_center_scope_locks").select("*").eq("status", "active").order("acquired_at", { ascending: false }),
    client.from("dev_center_worktree_leases").select("*").eq("status", "active").order("acquired_at", { ascending: false }),
    client.from("dev_center_conflicts").select("*").order("created_at", { ascending: false }).limit(100),
    client.from("dev_center_environments").select("*").order("code"),
    client.from("dev_center_repositories").select("*").order("name"),
    client.from("dev_center_build_runs").select("*").order("created_at", { ascending: false }).limit(100),
    client.from("dev_center_releases").select("*").order("created_at", { ascending: false }).limit(100),
    client.from("dev_center_backup_runs").select("*").order("started_at", { ascending: false }).limit(100),
  ]);
  for (const result of [workers, tasks, dependencies, sessions, locks, worktreeLeases, conflicts, environments, repositories, builds, releases, backups]) {
    if (result.error) databaseError("A BENJADMIN engine állapot betöltése sikertelen.", result.error);
  }
  return {
    workers: (workers.data || []).map((row) => mapWorker(row as JsonRecord)),
    tasks: (tasks.data || []).map((row) => mapTask(row as JsonRecord)),
    dependencies: dependencies.data || [], sessions: (sessions.data || []).map((row) => mapSession(row as JsonRecord)),
    locks: locks.data || [], worktreeLeases: worktreeLeases.data || [], conflicts: conflicts.data || [], environments: environments.data || [], repositories: repositories.data || [],
    builds: builds.data || [], releases: releases.data || [], backups: backups.data || [], updatedAt: nowIso(),
  };
}

export async function createDevEngineTask(input: Record<string, unknown>) {
  const client = await requireClient();
  const projectId = text(input.projectId);
  const title = text(input.title);
  if (!projectId || !title) return { ok: false as const, error: "A projectId és a feladat címe kötelező." };
  const id = text(input.id) || `dev-task-${randomUUID().slice(0, 12)}`;
  const scope = normalizeScope(input.scope);
  const requestedWorkerId = text(input.requestedWorkerId) || null;
  const repositoryId = text(input.repositoryId) || null;
  const planeInfo = await resolveDevelopmentPlane(client, projectId);
  if (planeInfo.plane === "PARTNER" && !requestedWorkerId) {
    throw new DevCenterEngineError("Partner task kizárólag explicit OutminAI workerrel hozható létre.", "PARTNER_TASK_WORKER_REQUIRED", 403, { projectId });
  }
  if (requestedWorkerId) {
    try {
      await assertWorkerProjectIsolation(client, { workerId: requestedWorkerId, projectId });
      if (repositoryId) await assertRepositoryIsolation(client, { workerId: requestedWorkerId, projectId, repositoryId, required: "WRITE" });
    } catch (error) {
      if (error instanceof PartnerIsolationPolicyError) throw new DevCenterEngineError(error.message, error.code, error.status, error.details);
      throw error;
    }
  }
  const taskRow = {
    id, project_id: projectId, version_id: text(input.versionId) || null, repository_id: repositoryId,
    title, description: text(input.description), status: "queued", priority: clampPriority(input.priority),
    requested_worker_id: requestedWorkerId, assigned_worker_id: null, branch_name: null, worktree_path: null,
    scope, acceptance: stringArray(input.acceptance), created_by: text(input.createdBy, "BenAI"), metadata: jsonRecord(input.metadata),
  };
  const { data, error } = await client.from("dev_center_tasks").insert(taskRow).select("*").single();
  if (error) databaseError("A fejlesztési feladat létrehozása sikertelen.", error, 400);
  const dependencies = stringArray(input.dependsOnTaskIds).filter((dependencyId) => dependencyId !== id);
  if (dependencies.length) {
    const { error: dependencyError } = await client.from("dev_center_task_dependencies").insert(dependencies.map((dependencyId) => ({ task_id: id, depends_on_task_id: dependencyId, dependency_type: "blocks" })));
    if (dependencyError) databaseError("A feladatfüggőségek rögzítése sikertelen.", dependencyError, 400);
  }
  await addAudit(client, { action: "TASK_CREATED", entityType: "task", entityId: id, taskId: id, projectId, summary: title, metadata: { dependencies, scope } });
  return { ok: true as const, task: mapTask(data as JsonRecord), dependencies };
}

export async function openDevEngineSession(input: Record<string, unknown>) {
  const client = await requireClient();
  const id = text(input.id) || `dev-session-${randomUUID().slice(0, 12)}`;
  const now = nowIso();
  const row = { id, coordinator: "BenAI", opened_by: text(input.openedBy, "BenjAdmin"), environment_id: text(input.environmentId, "env_dev"),
    status: "open", handshake_stage: "SESSION_OPEN", note: text(input.note) || null, metadata: jsonRecord(input.metadata), last_heartbeat_at: now, lease_expires_at: leaseIso(), updated_at: now };
  const { data, error } = await client.from("dev_center_worker_sessions").insert(row).select("*").single();
  if (error) databaseError("A BENJADMIN worker session megnyitása sikertelen.", error, 400);
  await addSessionEvent(client, id, "SESSION_OPEN", "SESSION_OPENED", "Session megnyitva; fejlesztési művelet még nem engedélyezett.");
  await addAudit(client, { action: "SESSION_OPENED", entityType: "worker_session", entityId: id, sessionId: id, summary: "BENJADMIN worker session megnyitva." });
  return { ok: true as const, session: mapSession(data as JsonRecord) };
}

async function getSessionRow(client: SupabaseClient, sessionId: string) {
  const { data, error } = await client.from("dev_center_worker_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (error) databaseError("A worker session betöltése sikertelen.", error);
  if (!data) throw new DevCenterEngineError("A worker session nem található.", "DEV_CENTER_SESSION_NOT_FOUND", 404);
  return data as JsonRecord;
}

async function updateSessionStage(client: SupabaseClient, sessionId: string, expected: DevEngineHandshakeStage, next: DevEngineHandshakeStage, patch: JsonRecord, eventType: string, summary: string) {
  const current = mapSession(await getSessionRow(client, sessionId));
  if (current.status === "closed") throw new DevCenterEngineError("A lezárt session nem módosítható.", "DEV_CENTER_SESSION_CLOSED", 409);
  if (current.handshakeStage !== expected) throw new DevCenterEngineError(`Érvénytelen handshake sorrend: ${current.handshakeStage} → ${next}.`, "DEV_CENTER_HANDSHAKE_ORDER", 409);
  const now = nowIso();
  const { data, error } = await client.from("dev_center_worker_sessions").update({ ...patch, handshake_stage: next, updated_at: now, last_heartbeat_at: now, lease_expires_at: leaseIso() }).eq("id", sessionId).select("*").single();
  if (error) databaseError("A worker session handshake frissítése sikertelen.", error, 409);
  await addSessionEvent(client, sessionId, next, eventType, summary, patch);
  return mapSession(data as JsonRecord);
}

async function ensureTaskDependenciesComplete(client: SupabaseClient, taskId: string) {
  const { data: dependencies, error } = await client.from("dev_center_task_dependencies").select("depends_on_task_id,dependency_type").eq("task_id", taskId);
  if (error) databaseError("A feladatfüggőségek ellenőrzése sikertelen.", error);
  const blocking = (dependencies || []).filter((item) => item.dependency_type === "blocks" || item.dependency_type === "requires").map((item) => item.depends_on_task_id as string);
  if (!blocking.length) return;
  const { data: tasks, error: taskError } = await client.from("dev_center_tasks").select("id,status").in("id", blocking);
  if (taskError) databaseError("A függő feladatok állapotának ellenőrzése sikertelen.", taskError);
  const incomplete = (tasks || []).filter((item) => item.status !== "completed").map((item) => item.id as string);
  if (incomplete.length || (tasks || []).length !== blocking.length) {
    throw new DevCenterEngineError("A feladat még blokkoló függőségekre vár.", "DEV_CENTER_TASK_DEPENDENCY_BLOCKED", 409, { blocking, incomplete });
  }
}

export async function bindDevEngineReviewTaskSession(sessionId: string, taskId: string, workerId = "worker_vguard") {
  const client = await requireClient();
  const current = mapSession(await getSessionRow(client, sessionId));
  if (current.status === "closed" || current.handshakeStage !== "WORKER_BOUND" || current.workerId !== workerId) {
    throw new DevCenterEngineError("Review task bindinghez WORKER_BOUND V.Guard session szükséges.", "DEV_CENTER_REVIEW_SESSION_NOT_READY", 409, { sessionId, workerId, stage: current.handshakeStage });
  }
  const [{ data: worker, error: workerError }, { data: taskRow, error: taskError }] = await Promise.all([
    client.from("dev_center_workers").select("id,code,status,metadata").eq("id", workerId).maybeSingle(),
    client.from("dev_center_tasks").select("*").eq("id", taskId).maybeSingle(),
  ]);
  if (workerError) databaseError("A review worker policy nem olvasható.", workerError);
  if (taskError) databaseError("A review task nem olvasható.", taskError);
  if (!worker || worker.code !== "VGUARD" || worker.status !== "ready") {
    throw new DevCenterEngineError("Csak READY V.Guard worker kaphat review sessiont.", "DEV_CENTER_REVIEW_WORKER_NOT_READY", 403);
  }
  const workerMeta = jsonRecord(worker.metadata);
  const allowedOperations = stringArray(workerMeta.allowedOperations);
  if (workerMeta.reviewOnly !== true || workerMeta.productionAccess !== "DENY" || allowedOperations.includes("write")) {
    throw new DevCenterEngineError("A V.Guard review-only / PROD-DENY / no-write policy hiányos; fail-closed.", "DEV_CENTER_REVIEW_WORKER_POLICY_DENIED", 403);
  }
  if (!taskRow) throw new DevCenterEngineError("A review task nem található.", "DEV_CENTER_TASK_NOT_FOUND", 404);
  const task = mapTask(taskRow as JsonRecord);
  const taskMeta = task.metadata;
  if (taskMeta.workflowTarget !== "EXTERNAL_AI_WORKER_V1" || taskMeta.recordType !== "WORKER_TASK" || taskMeta.workflowState !== "WORKER_DONE") {
    throw new DevCenterEngineError("V.Guard csak WORKER_DONE Külső AI Worker taskot review-zhat.", "DEV_CENTER_REVIEW_TASK_STATE_DENIED", 409);
  }
  if (task.status !== "ready" || task.requestedWorkerId !== workerId || task.claimedBySessionId || task.assignedWorkerId) {
    throw new DevCenterEngineError("A review task már foglalt vagy nincs V.Guard részére előirányozva.", "DEV_CENTER_REVIEW_TASK_CLAIM_DENIED", 409);
  }
  if (!task.repositoryId) throw new DevCenterEngineError("A review task repository bindingje hiányzik.", "DEV_CENTER_REVIEW_REPOSITORY_REQUIRED", 403);
  try {
    await assertWorkerProjectIsolation(client, { workerId, projectId: task.projectId });
    await assertRepositoryIsolation(client, { workerId, projectId: task.projectId, repositoryId: task.repositoryId, required: "READ" });
  } catch (error) {
    if (error instanceof PartnerIsolationPolicyError) throw new DevCenterEngineError(error.message, error.code, error.status, error.details);
    throw error;
  }
  const session = await updateSessionStage(client, sessionId, "WORKER_BOUND", "TASK_BOUND", {
    task_id: taskId,
    project_id: task.projectId,
    version_id: task.versionId,
    repository_id: task.repositoryId,
    status: "active",
    metadata: { ...current.metadata, reviewOnly: true, productionAccess: "DENY", writeAccess: "DENY", taskId },
  }, "REVIEW_TASK_BOUND", `V.Guard review task hozzárendelve: ${task.title}`);
  const now = nowIso();
  const claim = await client.from("dev_center_tasks").update({
    status: "in_progress",
    assigned_worker_id: workerId,
    claimed_by_session_id: sessionId,
    claim_expires_at: leaseIso(900),
    last_claimed_at: now,
    updated_at: now,
  }).eq("id", taskId).eq("status", "ready").eq("requested_worker_id", workerId).is("assigned_worker_id", null).is("claimed_by_session_id", null).select("id").maybeSingle();
  if (claim.error) databaseError("A V.Guard review task foglalása sikertelen.", claim.error, 409);
  if (!claim.data) {
    await advanceDevEngineSession(sessionId, "close", { reason: "V.Guard review task claim race; session lezárva." });
    throw new DevCenterEngineError("A V.Guard review taskot időközben más session foglalta.", "DEV_CENTER_REVIEW_TASK_CLAIM_CONFLICT", 409);
  }
  const workerUpdate = await client.from("dev_center_workers").update({ status: "busy", updated_at: now }).eq("id", workerId);
  if (workerUpdate.error) databaseError("A V.Guard worker foglalása sikertelen.", workerUpdate.error);
  await addAudit(client, { action: "REVIEW_SESSION_TASK_BOUND", entityType: "worker_session", entityId: sessionId, sessionId, taskId, projectId: task.projectId, summary: "V.Guard review-only session taskhoz kötve worktree/scope/write jog nélkül.", metadata: { workerId, repositoryId: task.repositoryId, reviewOnly: true, writeAccess: "DENY", productionAccess: "DENY" } });
  return { ok: true as const, session, task };
}

export async function advanceDevEngineSession(sessionId: string, action: string, input: Record<string, unknown>) {
  const client = await requireClient();
  if (action === "assign_benai") {
    const session = await updateSessionStage(client, sessionId, "SESSION_OPEN", "BENAI_ASSIGNED", { coordinator: "BenAI" }, "BENAI_ASSIGNED", "BenAI koordinátor hozzárendelve.");
    return { ok: true as const, session };
  }
  if (action === "bind_review_task") {
    const taskId = text(input.taskId);
    const workerId = text(input.workerId, "worker_vguard");
    if (!taskId) return { ok: false as const, error: "A taskId kötelező." };
    return bindDevEngineReviewTaskSession(sessionId, taskId, workerId);
  }
  if (action === "bind_worker") {
    const workerId = text(input.workerId);
    if (!workerId) return { ok: false as const, error: "A workerId kötelező." };
    const { data: worker, error } = await client.from("dev_center_workers").select("*").eq("id", workerId).maybeSingle();
    if (error) databaseError("A worker ellenőrzése sikertelen.", error);
    if (!worker) return { ok: false as const, error: "A worker nem található." };
    if (worker.status === "offline" || worker.status === "paused") return { ok: false as const, error: "A worker jelenleg nem fogadhat munkát." };
    const { data: active } = await client.from("dev_center_worker_sessions").select("id").eq("worker_id", workerId).neq("status", "closed").limit(1);
    if ((active || []).length) throw new DevCenterEngineError("Ehhez a workerhez már tartozik aktív session.", "DEV_CENTER_WORKER_BUSY", 409);
    const session = await updateSessionStage(client, sessionId, "BENAI_ASSIGNED", "WORKER_BOUND", { worker_id: workerId }, "WORKER_BOUND", `${worker.name} worker hozzárendelve.`);
    return { ok: true as const, session, worker: mapWorker(worker as JsonRecord) };
  }
  if (action === "bind_task") {
    const taskId = text(input.taskId);
    if (!taskId) return { ok: false as const, error: "A taskId kötelező." };
    const current = mapSession(await getSessionRow(client, sessionId));
    if (current.handshakeStage !== "WORKER_BOUND" || !current.workerId) throw new DevCenterEngineError("Előbb workert kell rendelni a sessionhöz.", "DEV_CENTER_HANDSHAKE_ORDER", 409);
    const { data: boundWorker, error: boundWorkerError } = await client.from("dev_center_workers").select("code,metadata").eq("id", current.workerId).maybeSingle();
    if (boundWorkerError) databaseError("A session worker policy nem olvasható.", boundWorkerError);
    if (boundWorker?.code === "VGUARD" || jsonRecord(boundWorker?.metadata).reviewOnly === true) {
      throw new DevCenterEngineError("V.Guard review-only workerhez kizárólag bind_review_task használható; normál fejlesztési task binding tiltott.", "DEV_CENTER_REVIEW_BINDING_REQUIRED", 403);
    }
    const { data: taskRow, error } = await client.from("dev_center_tasks").select("*").eq("id", taskId).maybeSingle();
    if (error) databaseError("A feladat ellenőrzése sikertelen.", error);
    if (!taskRow) return { ok: false as const, error: "A feladat nem található." };
    const task = mapTask(taskRow as JsonRecord);
    if (["completed", "cancelled"].includes(task.status)) return { ok: false as const, error: "Lezárt feladat nem rendelhető sessionhöz." };
    if (task.requestedWorkerId && task.requestedWorkerId !== current.workerId) throw new DevCenterEngineError("A feladat másik workerhez van előirányozva.", "DEV_CENTER_TASK_WORKER_MISMATCH", 409);
    await ensureTaskDependenciesComplete(client, taskId);
    try {
      const isolation = await assertWorkerProjectIsolation(client, { workerId: current.workerId, projectId: task.projectId });
      if (isolation.plane === "PARTNER" && !task.repositoryId) {
        throw new PartnerIsolationPolicyError("Partner task repository nélkül nem léphet tovább a handshake-ben.", "PARTNER_REPOSITORY_REQUIRED", 403, { taskId, projectId: task.projectId });
      }
      if (task.repositoryId) await assertRepositoryIsolation(client, { workerId: current.workerId, projectId: task.projectId, repositoryId: task.repositoryId, required: "WRITE" });
    } catch (error) {
      if (error instanceof PartnerIsolationPolicyError) throw new DevCenterEngineError(error.message, error.code, error.status, error.details);
      throw error;
    }
    const session = await updateSessionStage(client, sessionId, "WORKER_BOUND", "TASK_BOUND", {
      task_id: taskId, project_id: task.projectId, version_id: task.versionId, repository_id: task.repositoryId,
    }, "TASK_BOUND", `Feladat hozzárendelve: ${task.title}`);
    const { error: taskUpdateError } = await client.from("dev_center_tasks").update({ status: "claimed", assigned_worker_id: current.workerId, updated_at: nowIso() }).eq("id", taskId);
    if (taskUpdateError) databaseError("A feladat foglalása sikertelen.", taskUpdateError);
    return { ok: true as const, session, task };
  }
  if (action === "bind_branch") {
    const reviewCheck = mapSession(await getSessionRow(client, sessionId));
    if (reviewCheck.metadata.reviewOnly === true) throw new DevCenterEngineError("Review-only session nem kaphat branchet.", "DEV_CENTER_REVIEW_WORKTREE_DENIED", 403);
    const branchName = text(input.branchName);
    if (!branchName) return { ok: false as const, error: "A branchName kötelező." };
    const session = await updateSessionStage(client, sessionId, "TASK_BOUND", "BRANCH_BOUND", { branch_name: branchName }, "BRANCH_BOUND", `Branch hozzárendelve: ${branchName}`);
    return { ok: true as const, session };
  }
  if (action === "bind_worktree") {
    const reviewCheck = mapSession(await getSessionRow(client, sessionId));
    if (reviewCheck.metadata.reviewOnly === true) throw new DevCenterEngineError("Review-only session nem kaphat worktree-t.", "DEV_CENTER_REVIEW_WORKTREE_DENIED", 403);
    const worktreePath = text(input.worktreePath);
    if (!worktreePath) return { ok: false as const, error: "Érvényes worktreePath kötelező." };
    const current = mapSession(await getSessionRow(client, sessionId));
    if (current.handshakeStage !== "BRANCH_BOUND" || !current.branchName) throw new DevCenterEngineError("A worktree előtt érvényes branch binding szükséges.", "DEV_CENTER_HANDSHAKE_ORDER", 409);
    if (!current.projectId || !current.workerId || !current.repositoryId) throw new DevCenterEngineError("A worktree plane-policy előtt worker, project és repository binding szükséges.", "DEV_CENTER_HANDSHAKE_ORDER", 409);
    let verifiedWorktree;
    try {
      const isolation = await assertRepositoryIsolation(client, { workerId: current.workerId, projectId: current.projectId, repositoryId: current.repositoryId, required: "WRITE" });
      verifiedWorktree = await validateGitWorktreeForPlane(worktreePath, current.branchName, isolation.plane);
    } catch (error) {
      if (error instanceof DevWorktreeValidationError || error instanceof PartnerIsolationPolicyError) throw new DevCenterEngineError(error.message, error.code, error.status, error.details);
      throw error;
    }
    const session = await updateSessionStage(client, sessionId, "BRANCH_BOUND", "WORKTREE_BOUND", { worktree_path: verifiedWorktree.worktreePath }, "WORKTREE_BOUND", "Worktree hozzárendelve: " + verifiedWorktree.worktreePath);
    return { ok: true as const, session, verifiedWorktree };
  }
  if (action === "lock_scope") {
    const current = mapSession(await getSessionRow(client, sessionId));
    if (current.metadata.reviewOnly === true) throw new DevCenterEngineError("Review-only session nem kaphat scope lockot.", "DEV_CENTER_REVIEW_SCOPE_DENIED", 403);
    if (current.handshakeStage !== "WORKTREE_BOUND" || !current.repositoryId || !current.taskId || !current.workerId) {
      throw new DevCenterEngineError("A scope lock előtt repository, task, worker, branch és worktree szükséges.", "DEV_CENTER_HANDSHAKE_ORDER", 409);
    }
    const scopes = normalizeScope(input.scope);
    if (!scopes.length) return { ok: false as const, error: "Legalább egy scope kötelező." };
    try {
      await assertRepositoryIsolation(client, { workerId: current.workerId, projectId: current.projectId || "", repositoryId: current.repositoryId, required: "WRITE" });
      await assertScopeIsolation(client, { workerId: current.workerId, projectId: current.projectId || "", scopes });
    } catch (error) {
      if (error instanceof PartnerIsolationPolicyError) throw new DevCenterEngineError(error.message, error.code, error.status, error.details);
      throw error;
    }
    const lockRows = scopes.map((scope) => ({
      id: `dev-lock-${randomUUID().slice(0, 12)}`, repository_id: current.repositoryId, session_id: sessionId,
      task_id: current.taskId, scope_type: scope.type, scope_key: scope.key, mode: "exclusive", status: "active",
      metadata: { workerId: current.workerId, branchName: current.branchName, worktreePath: current.worktreePath },
    }));
    const { error: lockError } = await client.from("dev_center_scope_locks").insert(lockRows);
    if (lockError) {
      const conflict = lockError.code === "23505";
      throw new DevCenterEngineError(conflict ? "A kért fejlesztési scope-ot már másik session zárolja." : "A scope lock rögzítése sikertelen.", conflict ? "DEV_CENTER_SCOPE_CONFLICT" : lockError.code || "DEV_CENTER_SCOPE_LOCK_ERROR", conflict ? 409 : 500, lockError);
    }
    const now = nowIso();
    const { data, error } = await client.from("dev_center_worker_sessions").update({ handshake_stage: "READY", status: "active", scope: scopes, updated_at: now, last_heartbeat_at: now }).eq("id", sessionId).select("*").single();
    if (error) databaseError("A session READY állapotba állítása sikertelen.", error);
    const { error: taskError } = await client.from("dev_center_tasks").update({ status: "in_progress", assigned_worker_id: current.workerId, branch_name: current.branchName, worktree_path: current.worktreePath, scope: scopes, started_at: now, updated_at: now }).eq("id", current.taskId);
    if (taskError) databaseError("A feladat indítása sikertelen.", taskError);
    const { error: workerError } = await client.from("dev_center_workers").update({ status: "busy", updated_at: now }).eq("id", current.workerId);
    if (workerError) databaseError("A worker állapotfrissítése sikertelen.", workerError);
    await addSessionEvent(client, sessionId, "READY", "SCOPE_LOCKED", "Scope zárolva; session fejlesztési műveletre kész.", { scopes });
    await addAudit(client, { action: "SESSION_READY", entityType: "worker_session", entityId: sessionId, sessionId, taskId: current.taskId, projectId: current.projectId, summary: "A teljes BENJADMIN handshake sikeresen lezárult.", metadata: { scopes } });
    return { ok: true as const, session: mapSession(data as JsonRecord), locks: lockRows };
  }
  if (action === "heartbeat") {
    const now = nowIso();
    const { data, error } = await client.from("dev_center_worker_sessions").update({ last_heartbeat_at: now, updated_at: now }).eq("id", sessionId).neq("status", "closed").select("*").maybeSingle();
    if (error) databaseError("A session heartbeat sikertelen.", error);
    if (!data) return { ok: false as const, error: "Aktív session nem található." };
    return { ok: true as const, session: mapSession(data as JsonRecord) };
  }
  if (action === "close") {
    const current = mapSession(await getSessionRow(client, sessionId));
    if (current.status === "closed") return { ok: true as const, session: current, alreadyClosed: true };
    const now = nowIso();
    const { error: lockError } = await client.from("dev_center_scope_locks").update({ status: "released", released_at: now }).eq("session_id", sessionId).eq("status", "active");
    if (lockError) databaseError("A scope lock feloldása sikertelen.", lockError);
    if (current.workerId) {
      const { error: workerError } = await client.from("dev_center_workers").update({ status: "ready", updated_at: now }).eq("id", current.workerId);
      if (workerError) databaseError("A worker felszabadítása sikertelen.", workerError);
    }
    const { data, error } = await client.from("dev_center_worker_sessions").update({ status: "closed", closed_at: now, close_reason: text(input.reason, "Session lezárva."), updated_at: now, last_heartbeat_at: now }).eq("id", sessionId).select("*").single();
    if (error) databaseError("A session lezárása sikertelen.", error);
    await addSessionEvent(client, sessionId, current.handshakeStage, "SESSION_CLOSED", text(input.reason, "Session lezárva."));
    await addAudit(client, { action: "SESSION_CLOSED", entityType: "worker_session", entityId: sessionId, sessionId, taskId: current.taskId, projectId: current.projectId, summary: text(input.reason, "Session lezárva.") });
    return { ok: true as const, session: mapSession(data as JsonRecord) };
  }
  return { ok: false as const, error: "Ismeretlen session művelet." };
}

export async function assertDevEngineWorkerSession(sessionId: string, workerId: string) {
  const client = await requireClient();
  const session = mapSession(await getSessionRow(client, sessionId));
  if (!session.workerId || session.workerId !== workerId) {
    throw new DevCenterEngineError("A worker token nem ehhez a sessionhöz tartozik.", "DEV_CENTER_WORKER_SESSION_MISMATCH", 403, { sessionId, workerId });
  }
  if (!session.projectId) throw new DevCenterEngineError("A session project bindingje hiányzik.", "DEV_CENTER_SESSION_POLICY_CONTEXT_MISSING", 403);
  try {
    await assertWorkerProjectIsolation(client, { workerId, projectId: session.projectId });
  } catch (error) {
    if (error instanceof PartnerIsolationPolicyError) throw new DevCenterEngineError(error.message, error.code, error.status, error.details);
    throw error;
  }
  return { ok: true as const, session };
}

export async function assertDevEngineOperation(sessionId: string, operation: DevEngineOperation) {
  const client = await requireClient();
  const session = mapSession(await getSessionRow(client, sessionId));
  if (session.status !== "active" || session.handshakeStage !== "READY") throw new DevCenterEngineError("A művelethez READY worker session szükséges.", "DEV_CENTER_SESSION_NOT_READY", 403);
  if (session.leaseExpiresAt && Date.parse(session.leaseExpiresAt) <= Date.now()) throw new DevCenterEngineError("A worker session lease lejárt; heartbeat vagy recovery szükséges.", "DEV_CENTER_SESSION_LEASE_EXPIRED", 403, { leaseExpiresAt: session.leaseExpiresAt });
  if (!session.environmentId) throw new DevCenterEngineError("A sessionhöz nincs környezet rendelve.", "DEV_CENTER_ENVIRONMENT_MISSING", 403);
  const { data: environment, error } = await client.from("dev_center_environments").select("id,code,kind,status,read_only").eq("id", session.environmentId).maybeSingle();
  if (error) databaseError("A környezet ellenőrzése sikertelen.", error);
  if (!environment || environment.status !== "online") throw new DevCenterEngineError("A célkörnyezet nem online.", "DEV_CENTER_ENVIRONMENT_OFFLINE", 403);
  if (environment.read_only && ["write", "migration", "restart", "deploy"].includes(operation)) throw new DevCenterEngineError("A célkörnyezet read-only; a művelet tiltott.", "DEV_CENTER_ENVIRONMENT_READ_ONLY", 403, { environment: environment.code, operation });
  if (!session.workerId || !session.projectId) throw new DevCenterEngineError("A session worker/project bindingje hiányzik.", "DEV_CENTER_SESSION_POLICY_CONTEXT_MISSING", 403);
  try {
    await assertPartnerEngineOperationIsolation(client, { workerId: session.workerId, projectId: session.projectId, environmentId: session.environmentId, operation });
  } catch (error) {
    if (error instanceof PartnerIsolationPolicyError) throw new DevCenterEngineError(error.message, error.code, error.status, error.details);
    throw error;
  }
  const [locksResult, worktreeResult] = await Promise.all([
    client.from("dev_center_scope_locks").select("id,expires_at").eq("session_id", sessionId).eq("status", "active"),
    client.from("dev_center_worktree_leases").select("id,lease_expires_at").eq("session_id", sessionId).eq("status", "active"),
  ]);
  if (locksResult.error) databaseError("A session lockjainak ellenőrzése sikertelen.", locksResult.error);
  if (worktreeResult.error) databaseError("A worktree lease ellenőrzése sikertelen.", worktreeResult.error);
  const now = Date.now();
  const locks = (locksResult.data || []).filter((item) => !item.expires_at || Date.parse(item.expires_at) > now);
  const worktreeLeases = (worktreeResult.data || []).filter((item) => item.lease_expires_at && Date.parse(item.lease_expires_at) > now);
  if (!locks.length) throw new DevCenterEngineError("A sessionhöz nincs érvényes scope lock.", "DEV_CENTER_SCOPE_LOCK_REQUIRED", 403);
  if (!worktreeLeases.length) throw new DevCenterEngineError("A sessionhöz nincs érvényes worktree lease.", "DEV_CENTER_WORKTREE_LEASE_REQUIRED", 403);
  return { ok: true as const, session, environment, operation, activeLockCount: locks.length, activeWorktreeLeaseCount: worktreeLeases.length };
}

export async function getDevCenterEngineGate(): Promise<DevEngineGateStatus> {
  const health = await getDevCenterEngineHealth();
  if (!health.ready) return { ready: false, schemaReady: false, workers: { total: 0, required: 3, readyCodes: [] }, sessions: { ready: 0, required: 3, readyWorkerCodes: [] }, queue: { total: 0, actionable: 0, required: 1 }, locks: { active: 0 }, blockers: [health.errorCode || "DEV_CENTER_SCHEMA_NOT_READY"] };
  const state = await getDevCenterEngineState();
  const workerById = new Map(state.workers.map((worker) => [worker.id, worker]));
  const requiredWorkers = state.workers.filter((worker) => (DEV_CENTER_ENGINE_REQUIRED_WORKERS as readonly string[]).includes(worker.code));
  const readySessions = state.sessions.filter((session) => session.status === "active" && session.handshakeStage === "READY" && session.workerId);
  const readyWorkerCodes = Array.from(new Set(readySessions.map((session) => workerById.get(session.workerId || "")?.code).filter((code): code is string => Boolean(code))));
  const actionable = state.tasks.filter((task) => ["queued", "ready", "claimed", "in_progress", "testing"].includes(task.status)).length;
  const blockers: string[] = [];
  if (requiredWorkers.length < 3) blockers.push("A három kötelező worker nincs regisztrálva.");
  if (readyWorkerCodes.filter((code) => (DEV_CENTER_ENGINE_REQUIRED_WORKERS as readonly string[]).includes(code)).length < 3) blockers.push("Nincs három READY worker session.");
  if (actionable < 1) blockers.push("A task queue üres.");
  const now = Date.now();
  const openConflicts = state.conflicts.filter((item) => item.status === "open").length;
  const activeWorktreeLeases = state.worktreeLeases.filter((item) => item.status === "active" && Date.parse(String(item.lease_expires_at || "")) > now).length;
  const expiringSessions = state.sessions.filter((session) => session.status !== "closed" && session.leaseExpiresAt && Date.parse(session.leaseExpiresAt) <= now + 120000).length;
  return { ready: blockers.length === 0, schemaReady: true, workers: { total: requiredWorkers.length, required: 3, readyCodes: requiredWorkers.map((worker) => worker.code) }, sessions: { ready: readySessions.length, required: 3, readyWorkerCodes }, queue: { total: state.tasks.length, actionable, required: 1 }, locks: { active: state.locks.length }, orchestration: { activeWorktreeLeases, openConflicts, expiringSessions }, blockers };
}


const CONSOLE_ROUTABLE_WORKERS: Record<string, string> = {
  ARMINAI: "worker_arminai",
  JAZMINAI: "worker_jazminai",
  OUTMINAI: "worker_outminai",
};

function clampEstimateMinutes(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(15, Math.min(24 * 60, Math.round(n / 5) * 5));
}

async function getTaskForConsoleControl(client: SupabaseClient, taskId: string) {
  const { data, error } = await client.from("dev_center_tasks").select("*").eq("id", taskId).maybeSingle();
  if (error) databaseError("A fejlesztési task nem olvasható.", error);
  if (!data) throw new DevCenterEngineError("A fejlesztési task nem található.", "DEV_CENTER_TASK_NOT_FOUND", 404);
  return mapTask(data as JsonRecord);
}

export async function routeDevEngineTask(input: { taskId: string; workerCode: string; estimateMinutes?: number | null; note?: string | null }) {
  const client = await requireClient();
  const task = await getTaskForConsoleControl(client, input.taskId);
  if (["claimed", "in_progress", "testing", "completed", "cancelled"].includes(task.status) || task.assignedWorkerId || task.claimedBySessionId) {
    throw new DevCenterEngineError("Aktív vagy lezárt task felelőse nem cserélhető közvetlenül.", "DEV_CENTER_TASK_ROUTE_STATE_DENIED", 409, { taskId: task.id, status: task.status });
  }
  const workerCode = text(input.workerCode).toUpperCase();
  const workerId = CONSOLE_ROUTABLE_WORKERS[workerCode];
  if (!workerId) throw new DevCenterEngineError("Ismeretlen vagy nem routolható worker.", "DEV_CENTER_TASK_WORKER_INVALID", 400, { workerCode });
  const { data: worker, error: workerError } = await client.from("dev_center_workers").select("id,code,name,status").eq("id", workerId).maybeSingle();
  if (workerError) databaseError("A worker nem olvasható.", workerError);
  if (!worker || worker.status === "offline" || worker.status === "paused") {
    throw new DevCenterEngineError("A kiválasztott worker jelenleg nem fogadhat feladatot.", "DEV_CENTER_WORKER_NOT_AVAILABLE", 409, { workerId, workerCode });
  }
  try {
    await assertWorkerProjectIsolation(client, { workerId, projectId: task.projectId });
    if (task.repositoryId) await assertRepositoryIsolation(client, { workerId, projectId: task.projectId, repositoryId: task.repositoryId, required: "WRITE" });
  } catch (error) {
    if (error instanceof PartnerIsolationPolicyError) throw new DevCenterEngineError(error.message, error.code, error.status, error.details);
    throw error;
  }
  const now = nowIso();
  const estimateMinutes = clampEstimateMinutes(input.estimateMinutes) ?? clampEstimateMinutes(jsonRecord(task.metadata).estimateMinutes);
  const handoff = buildManualBridgeHandoff({ taskId: task.id, projectId: task.projectId, workerName: text(worker.name) || workerCode, instruction: task.description || task.title });
  const nextMetadata = {
    ...task.metadata,
    ownerCode: workerCode,
    routedAt: now,
    routedBy: "BenjAdmin",
    routingNote: text(input.note).slice(0, 500) || null,
    ...(estimateMinutes ? { estimateMinutes } : {}),
    workflowState: "ROUTED",
    bridgeMode: "MANUAL_CHATGPT_BRIDGE",
    bridgeState: "WAITING_HANDOFF",
    bridgeUpdatedAt: now,
    handoffPrompt: handoff.prompt,
    handoffPromptSha256: handoff.sha256,
    handoffPromptGeneratedAt: now,
    handoffSanitized: handoff.sanitized,
    handoffSensitiveFindings: handoff.sensitiveFindings,
  };
  const { data, error } = await client.from("dev_center_tasks").update({
    requested_worker_id: workerId,
    status: "ready",
    blocked_reason: null,
    metadata: nextMetadata,
    updated_at: now,
  }).eq("id", task.id).select("*").single();
  if (error) databaseError("A task routing sikertelen.", error, 409);
  await addAudit(client, {
    action: "TASK_ROUTED",
    entityType: "task",
    entityId: task.id,
    taskId: task.id,
    projectId: task.projectId,
    summary: `${task.title} -> ${worker.name}`,
    metadata: { workerId, workerCode, estimateMinutes, routingNote: text(input.note).slice(0, 500) || null },
  });
  return { ok: true as const, task: mapTask(data as JsonRecord), worker: mapWorker(worker as JsonRecord) };
}

export async function autoRouteDevEngineTaskByAvailability(input: { taskId: string; estimateMinutes?: number | null; note?: string | null; preferredWorkerCode?: string | null }) {
  const client = await requireClient();
  const task = await getTaskForConsoleControl(client, input.taskId);
  if (!["queued", "ready"].includes(task.status) || task.assignedWorkerId || task.claimedBySessionId) {
    throw new DevCenterEngineError("Ben-AI automatikus routing csak várakozó taskon futtatható.", "DEV_CENTER_AUTO_ROUTE_STATE_DENIED", 409, { taskId: task.id, status: task.status });
  }
  const preferredWorkerCode = text(input.preferredWorkerCode).toUpperCase();
  if (preferredWorkerCode && !Object.prototype.hasOwnProperty.call(CONSOLE_ROUTABLE_WORKERS, preferredWorkerCode)) {
    throw new DevCenterEngineError("A kézi worker preferencia ismeretlen.", "DEV_CENTER_TASK_WORKER_INVALID", 400, { preferredWorkerCode });
  }
  const workerResult = await client.from("dev_center_workers").select("id,code,name,status,updated_at").in("code", ["ARMINAI", "JAZMINAI", "OUTMINAI"]);
  if (workerResult.error) databaseError("A Ben-AI worker pool nem olvasható.", workerResult.error);
  const sessionResult = await client.from("dev_center_worker_sessions").select("worker_id,task_id,status").neq("status", "closed");
  if (sessionResult.error) databaseError("A worker session terhelés nem olvasható.", sessionResult.error);
  const taskResult = await client.from("dev_center_tasks").select("id,status,requested_worker_id,assigned_worker_id").in("status", ["queued", "ready", "claimed", "in_progress", "testing"]);
  if (taskResult.error) databaseError("A worker task terhelés nem olvasható.", taskResult.error);

  const activeSessionCount = new Map<string, number>();
  for (const row of sessionResult.data || []) {
    const workerId = text(row.worker_id);
    if (workerId) activeSessionCount.set(workerId, (activeSessionCount.get(workerId) || 0) + 1);
  }
  const activeSessionTaskIds = new Set((sessionResult.data || []).map((row) => text(row.task_id)).filter(Boolean));
  const activeTaskCount = new Map<string, number>();
  const queueCount = new Map<string, number>();
  for (const row of taskResult.data || []) {
    if (text(row.id) === task.id) continue;
    const workerId = text(row.assigned_worker_id) || text(row.requested_worker_id);
    if (!workerId) continue;
    const status = text(row.status);
    if (["claimed", "in_progress", "testing"].includes(status) && activeSessionTaskIds.has(text(row.id))) activeTaskCount.set(workerId, (activeTaskCount.get(workerId) || 0) + 1);
    if (["queued", "ready"].includes(status)) queueCount.set(workerId, (queueCount.get(workerId) || 0) + 1);
  }

  const candidates = (workerResult.data || [])
    .map((row) => ({
      id: text(row.id), code: text(row.code).toUpperCase(), name: text(row.name), status: text(row.status).toLowerCase(),
      activeSessions: activeSessionCount.get(text(row.id)) || 0,
      activeTasks: activeTaskCount.get(text(row.id)) || 0,
      queuedTasks: queueCount.get(text(row.id)) || 0,
      updatedAt: text(row.updated_at),
    }))
    .filter((worker) => worker.id && worker.code && !["offline", "paused"].includes(worker.status))
    .sort((a, b) => a.activeSessions - b.activeSessions || a.activeTasks - b.activeTasks || a.queuedTasks - b.queuedTasks || a.code.localeCompare(b.code));

  const rejected: Array<{ workerCode: string; reason: string; code: string | null }> = [];
  const eligibleFree: typeof candidates = [];
  for (const worker of candidates.filter((candidate) => candidate.activeSessions === 0 && candidate.activeTasks === 0)) {
    try {
      await assertWorkerProjectIsolation(client, { workerId: worker.id, projectId: task.projectId });
      if (task.repositoryId) await assertRepositoryIsolation(client, { workerId: worker.id, projectId: task.projectId, repositoryId: task.repositoryId, required: "WRITE" });
      eligibleFree.push(worker);
    } catch (error) {
      if (error instanceof PartnerIsolationPolicyError) {
        rejected.push({ workerCode: worker.code, reason: error.message, code: error.code });
        continue;
      }
      throw error;
    }
  }

  const preferredWorker = preferredWorkerCode ? candidates.find((worker) => worker.code === preferredWorkerCode) || null : null;
  const preferredRejected = preferredWorkerCode ? rejected.find((item) => item.workerCode === preferredWorkerCode) || null : null;
  const preferredBusy = Boolean(preferredWorker && (preferredWorker.activeSessions > 0 || preferredWorker.activeTasks > 0));
  const preferredUnavailable = Boolean(preferredWorkerCode && (!preferredWorker || preferredBusy || preferredRejected));
  const suggestedWorker = eligibleFree.find((worker) => worker.code !== preferredWorkerCode) || null;

  if (preferredUnavailable) {
    const now = nowIso();
    const metadata = {
      ...task.metadata,
      coordinator: "BENAI",
      coordinatorAutoRouted: false,
      coordinatorManualPreference: preferredWorkerCode,
      coordinatorPreferenceState: preferredRejected ? "PREFERRED_NOT_AUTHORIZED" : preferredBusy ? "PREFERRED_BUSY" : "PREFERRED_UNAVAILABLE",
      coordinatorCheckedAt: now,
      coordinatorSuggestedWorker: suggestedWorker ? { workerId: suggestedWorker.id, workerCode: suggestedWorker.code, workerName: suggestedWorker.name } : null,
      coordinatorCandidates: candidates.map((worker) => ({ workerCode: worker.code, activeSessions: worker.activeSessions, activeTasks: worker.activeTasks, queuedTasks: worker.queuedTasks })),
      coordinatorRejected: rejected,
    };
    const waiting = await client.from("dev_center_tasks").update({ metadata, updated_at: now }).eq("id", task.id).select("*").single();
    if (waiting.error) databaseError("A Ben-AI preferencia-visszajelzés nem menthető.", waiting.error, 409);
    await addAudit(client, {
      action: "TASK_BENAI_PREFERRED_WORKER_UNAVAILABLE",
      entityType: "task", entityId: task.id, taskId: task.id, projectId: task.projectId,
      summary: `${task.title} · ${preferredWorkerCode} jelenleg nem választható; ${suggestedWorker?.name || "nincs szabad alternatíva"}.`,
      metadata: { preferredWorkerCode, preferredBusy, preferredRejected, suggestedWorkerCode: suggestedWorker?.code || null, productionAccess: "DENY" },
    });
    return { ok: true as const, routed: false as const, reason: "PREFERRED_UNAVAILABLE" as const, task: mapTask(waiting.data as JsonRecord), worker: null, preferredWorker, suggestedWorker, candidates, rejected };
  }

  const chosen = preferredWorkerCode ? eligibleFree.find((worker) => worker.code === preferredWorkerCode) || null : eligibleFree[0] || null;
  if (chosen) {
    const routed = await routeDevEngineTask({
      taskId: task.id,
      workerCode: chosen.code,
      estimateMinutes: input.estimateMinutes,
      note: text(input.note).slice(0, 500) || (preferredWorkerCode ? "Ben-AI által ellenőrzött kézi worker preferencia" : "Ben-AI automatikus kapacitásalapú kiosztás"),
    });
    const now = nowIso();
    const currentMetadata = jsonRecord(routed.task.metadata);
    const metadata = {
      ...currentMetadata,
      coordinator: "BENAI",
      coordinatorAutoRouted: !preferredWorkerCode,
      coordinatorManualPreference: preferredWorkerCode || null,
      coordinatorPreferenceState: preferredWorkerCode ? "PREFERRED_ACCEPTED" : null,
      coordinatorQueueState: null,
      coordinatorSuggestedWorker: null,
      coordinatorRejected: [],
      coordinatorRoutedAt: now,
      coordinatorSelection: { workerCode: chosen.code, activeSessions: chosen.activeSessions, activeTasks: chosen.activeTasks, queuedTasks: chosen.queuedTasks },
    };
    const updated = await client.from("dev_center_tasks").update({ metadata, updated_at: now }).eq("id", task.id).select("*").single();
    if (updated.error) databaseError("A Ben-AI routing metadata nem menthető.", updated.error, 409);
    await addAudit(client, {
      action: preferredWorkerCode ? "TASK_BENAI_PREFERRED_WORKER_ROUTED" : "TASK_BENAI_AUTO_ROUTED",
      entityType: "task", entityId: task.id, taskId: task.id, projectId: task.projectId,
      summary: `${task.title} → ${routed.worker.name} · ${preferredWorkerCode ? "kézi preferencia Ben-AI ellenőrzéssel" : "Ben-AI automatikus kiosztás"}.`,
      metadata: { workerId: routed.worker.id, workerCode: routed.worker.code, preferredWorkerCode: preferredWorkerCode || null, productionAccess: "DENY", selection: metadata.coordinatorSelection },
    });
    return { ok: true as const, routed: true as const, reason: preferredWorkerCode ? "PREFERRED_ACCEPTED" as const : "AUTO_ROUTED" as const, task: mapTask(updated.data as JsonRecord), worker: routed.worker, preferredWorker, suggestedWorker: null, candidates, rejected };
  }

  const now = nowIso();
  const metadata = {
    ...task.metadata,
    coordinator: "BENAI",
    coordinatorAutoRouted: false,
    coordinatorQueueState: "WAITING_FOR_FREE_WORKER",
    coordinatorCheckedAt: now,
    coordinatorCandidates: candidates.map((worker) => ({ workerCode: worker.code, activeSessions: worker.activeSessions, activeTasks: worker.activeTasks, queuedTasks: worker.queuedTasks })),
    coordinatorRejected: rejected,
  };
  const waiting = await client.from("dev_center_tasks").update({ metadata, updated_at: now }).eq("id", task.id).select("*").single();
  if (waiting.error) databaseError("A Ben-AI várakozási állapot nem menthető.", waiting.error, 409);
  await addAudit(client, { action: "TASK_BENAI_WAITING_FOR_WORKER", entityType: "task", entityId: task.id, taskId: task.id, projectId: task.projectId, summary: `${task.title} · nincs szabad, jogosult worker; Ben-AI várólistán.`, metadata: { productionAccess: "DENY", rejected } });
  return { ok: true as const, routed: false as const, reason: "NO_FREE_WORKER" as const, task: mapTask(waiting.data as JsonRecord), worker: null, preferredWorker, suggestedWorker: null, candidates, rejected };
}

export async function rebalanceBenAiWaitingTasks(limit = 12, context?: { trigger?: "TASK_FINALIZED" | "PLUS_PULL"; sourceTaskId?: string | null; sourceOutcome?: "completed" | "failed" | null }) {
  const client = await requireClient();
  const result = await client.from("dev_center_tasks")
    .select("id,status,assigned_worker_id,claimed_by_session_id,metadata,priority,updated_at")
    .in("status", ["queued", "ready"])
    .is("assigned_worker_id", null)
    .is("claimed_by_session_id", null)
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(40, Math.floor(limit))));
  if (result.error) databaseError("A Ben-AI várólista nem olvasható.", result.error);
  const outcomes: Array<{ taskId: string; routed: boolean; workerCode: string | null; reason: string; chainPrepared: boolean; chainPreparedAt: string | null }> = [];
  for (const row of result.data || []) {
    const metadata = jsonRecord(row.metadata);
    const queueState = text(metadata.coordinatorQueueState);
    const preferenceState = text(metadata.coordinatorPreferenceState);
    if (queueState !== "WAITING_FOR_FREE_WORKER" && !["PREFERRED_BUSY", "PREFERRED_NOT_AUTHORIZED", "PREFERRED_UNAVAILABLE"].includes(preferenceState)) continue;
    try {
      const routed = await autoRouteDevEngineTaskByAvailability({
        taskId: text(row.id),
        estimateMinutes: clampEstimateMinutes(metadata.estimateMinutes),
        preferredWorkerCode: text(metadata.coordinatorManualPreference) || null,
        note: "Ben-AI várólista automatikus újraértékelés",
      });
      let chainPrepared = false;
      let chainPreparedAt: string | null = null;
      if (routed.routed && context?.trigger === "TASK_FINALIZED") {
        chainPreparedAt = nowIso();
        const routedMeta = jsonRecord(routed.task.metadata);
        const chainMetadata: JsonRecord = {
          ...routedMeta,
          coordinatorChainState: "READY_FOR_PLUS_PULL",
          coordinatorChainPreparedAt: chainPreparedAt,
          coordinatorChainFromTaskId: text(context.sourceTaskId) || null,
          coordinatorChainSourceOutcome: context.sourceOutcome || null,
          coordinatorChainWorkerCode: routed.worker?.code || null,
          coordinatorChainWorkerName: routed.worker?.name || null,
        };
        const chainUpdate = await client.from("dev_center_tasks").update({ metadata: chainMetadata, updated_at: chainPreparedAt }).eq("id", routed.task.id).select("id").single();
        if (chainUpdate.error) databaseError("A Ben-AI következő-task láncállapota nem menthető.", chainUpdate.error, 409);
        await addAudit(client, {
          action: "TASK_BENAI_CHAIN_PREPARED",
          entityType: "task",
          entityId: routed.task.id,
          taskId: routed.task.id,
          projectId: routed.task.projectId,
          summary: `${routed.task.title} · Ben-AI következő Plus taskként előkészítette ${routed.worker?.name || routed.worker?.code || "worker"} részére.`,
          metadata: { sourceTaskId: text(context.sourceTaskId) || null, sourceOutcome: context.sourceOutcome || null, workerCode: routed.worker?.code || null, productionAccess: "DENY", preparedAt: chainPreparedAt },
        });
        chainPrepared = true;
      }
      outcomes.push({ taskId: text(row.id), routed: routed.routed, workerCode: routed.worker?.code || null, reason: routed.reason, chainPrepared, chainPreparedAt });
    } catch (error) {
      outcomes.push({ taskId: text(row.id), routed: false, workerCode: null, reason: error instanceof DevCenterEngineError ? error.code : "REBALANCE_ERROR", chainPrepared: false, chainPreparedAt: null });
    }
  }
  return { ok: true as const, outcomes, routedCount: outcomes.filter((item) => item.routed).length };
}

export async function acceptBenAiSuggestedWorker(taskId: string) {
  const client = await requireClient();
  const task = await getTaskForConsoleControl(client, taskId);
  const metadata = jsonRecord(task.metadata);
  const suggested = jsonRecord(metadata.coordinatorSuggestedWorker);
  const workerCode = text(suggested.workerCode).toUpperCase();
  if (!workerCode) throw new DevCenterEngineError("Ehhez a taskhoz nincs aktív Ben-AI worker javaslat.", "DEV_CENTER_BENAI_SUGGESTION_MISSING", 409, { taskId });
  const routed = await autoRouteDevEngineTaskByAvailability({
    taskId,
    estimateMinutes: clampEstimateMinutes(metadata.estimateMinutes),
    preferredWorkerCode: workerCode,
    note: "BENJADMIN elfogadta Ben-AI alternatív worker javaslatát",
  });
  if (!routed.routed) {
    throw new DevCenterEngineError("A korábban javasolt worker időközben már nem szabad. Ben-AI friss javaslatot készített.", "DEV_CENTER_BENAI_SUGGESTION_STALE", 409, { taskId, workerCode, suggestedWorker: routed.suggestedWorker || null });
  }
  return routed;
}

export async function pullDevEngineTaskForPlusWorker(workerCodeValue: string) {
  await rebalanceBenAiWaitingTasks(12, { trigger: "PLUS_PULL" });
  const client = await requireClient();
  const workerCode = text(workerCodeValue).toUpperCase();
  const workerId = CONSOLE_ROUTABLE_WORKERS[workerCode];
  if (!workerId) throw new DevCenterEngineError("Ismeretlen Plus worker identitás.", "DEV_CENTER_PLUS_WORKER_INVALID", 400, { workerCode });
  const workers = await client.from("dev_center_workers").select("id,code,name,status").eq("id", workerId).maybeSingle();
  if (workers.error) databaseError("A Plus worker nem olvasható.", workers.error);
  if (!workers.data || ["offline", "paused"].includes(text(workers.data.status).toLowerCase())) {
    throw new DevCenterEngineError("A Plus worker jelenleg nem fogadhat feladatot.", "DEV_CENTER_PLUS_WORKER_NOT_AVAILABLE", 409, { workerCode });
  }
  const tasksResult = await client.from("dev_center_tasks")
    .select("*")
    .or(`requested_worker_id.eq.${workerId},assigned_worker_id.eq.${workerId}`)
    .in("status", ["queued", "ready", "claimed", "in_progress", "testing"])
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(30);
  if (tasksResult.error) databaseError("A Plus worker inbox nem olvasható.", tasksResult.error);
  const rows = (tasksResult.data || []).map((row) => mapTask(row as JsonRecord));
  const active = rows.find((task) => ["claimed", "in_progress"].includes(task.status) && ["WAITING_HANDOFF", "HANDED_OFF", "RUNNING"].includes(normalizeManualBridgeState(jsonRecord(task.metadata).bridgeState) || ""));
  const queued = rows.find((task) => ["queued", "ready"].includes(task.status));
  let task = active || queued || null;
  if (!task) return { ok: true as const, found: false as const, worker: mapWorker(workers.data as JsonRecord), task: null, session: null, handoff: null };

  let session: DevEngineWorkerSession | null = null;
  if (["queued", "ready"].includes(task.status)) {
    const started = await startDevEngineTaskManualBridge(task.id);
    task = started.task;
    session = started.session;
  } else {
    const sessionId = text(jsonRecord(task.metadata).activeSessionId);
    if (sessionId) {
      const sessionRow = await client.from("dev_center_worker_sessions").select("*").eq("id", sessionId).maybeSingle();
      if (sessionRow.error) databaseError("A Plus worker session nem olvasható.", sessionRow.error);
      if (sessionRow.data) session = mapSession(sessionRow.data as JsonRecord);
    }
  }

  let bridgeState = normalizeManualBridgeState(jsonRecord(task.metadata).bridgeState) || "WAITING_HANDOFF";
  if (bridgeState === "WAITING_HANDOFF") {
    const handed = await advanceDevEngineTaskManualBridge({ taskId: task.id, target: "HANDED_OFF" });
    task = handed.task;
    bridgeState = "HANDED_OFF";
  }
  if (bridgeState === "HANDED_OFF") {
    const running = await advanceDevEngineTaskManualBridge({ taskId: task.id, target: "RUNNING" });
    task = running.task;
    bridgeState = "RUNNING";
  }
  const metadata = jsonRecord(task.metadata);
  const now = nowIso();
  const previousPullCount = Number(metadata.plusBridgePullCount);
  const pullCount = (Number.isFinite(previousPullCount) && previousPullCount > 0 ? Math.floor(previousPullCount) : 0) + 1;
  const pullMetadata: JsonRecord = {
    ...metadata,
    plusBridgeFirstPulledAt: text(metadata.plusBridgeFirstPulledAt) || now,
    plusBridgePulledAt: now,
    plusBridgeWorkerCode: workerCode,
    plusBridgeWorkerName: text(workers.data.name) || workerCode,
    plusBridgeSessionId: text(metadata.activeSessionId) || session?.id || null,
    plusBridgePullCount: pullCount,
    plusBridgePullState: bridgeState,
    ...(text(metadata.coordinatorChainState) ? { coordinatorChainState: "PULLED", coordinatorChainPulledAt: now } : {}),
  };
  const pullUpdate = await client.from("dev_center_tasks").update({ metadata: pullMetadata, updated_at: now }).eq("id", task.id).select("*").single();
  if (pullUpdate.error) databaseError("A Plus bridge task-felvétel állapota nem menthető.", pullUpdate.error, 409);
  task = mapTask(pullUpdate.data as JsonRecord);
  await addAudit(client, {
    action: "TASK_PLUS_BRIDGE_PULLED",
    entityType: "task", entityId: task.id, sessionId: text(pullMetadata.plusBridgeSessionId) || null, taskId: task.id, projectId: task.projectId,
    summary: `${task.title} · ${text(workers.data.name) || workerCode} Plus bridge felvette.`,
    metadata: { workerCode, bridgeState, handoffPromptSha256: text(pullMetadata.handoffPromptSha256) || null, productionAccess: "DENY", pulledAt: now, pullCount },
  });
  return {
    ok: true as const,
    found: true as const,
    worker: mapWorker(workers.data as JsonRecord),
    task,
    session,
    handoff: {
      prompt: text(pullMetadata.handoffPrompt),
      sha256: text(pullMetadata.handoffPromptSha256) || null,
      sanitized: pullMetadata.handoffSanitized === true,
      sensitiveFindings: Array.isArray(pullMetadata.handoffSensitiveFindings) ? pullMetadata.handoffSensitiveFindings : [],
      bridgeState,
      expectedFinishAt: text(pullMetadata.expectedFinishAt) || null,
      estimateMinutes: clampEstimateMinutes(pullMetadata.estimateMinutes),
    },
  };
}

export async function updateDevEngineTaskEstimate(input: { taskId: string; estimateMinutes: number; note?: string | null }) {
  const client = await requireClient();
  const task = await getTaskForConsoleControl(client, input.taskId);
  if (["completed", "cancelled"].includes(task.status)) throw new DevCenterEngineError("Lezárt task becslése nem módosítható.", "DEV_CENTER_TASK_ESTIMATE_STATE_DENIED", 409);
  const estimateMinutes = clampEstimateMinutes(input.estimateMinutes);
  if (!estimateMinutes) throw new DevCenterEngineError("A becsült fejlesztési idő 15 és 1440 perc között adható meg.", "DEV_CENTER_TASK_ESTIMATE_INVALID", 400);
  const now = nowIso();
  const metadata = {
    ...task.metadata,
    estimateMinutes,
    estimateUpdatedAt: now,
    estimateUpdatedBy: "BenjAdmin",
    estimateNote: text(input.note).slice(0, 500) || null,
  };
  const { data, error } = await client.from("dev_center_tasks").update({ metadata, updated_at: now }).eq("id", task.id).select("*").single();
  if (error) databaseError("A fejlesztési időbecslés mentése sikertelen.", error, 400);
  await addAudit(client, { action: "TASK_ESTIMATE_UPDATED", entityType: "task", entityId: task.id, taskId: task.id, projectId: task.projectId, summary: `Becsült fejlesztési idő: ${estimateMinutes} perc.`, metadata: { estimateMinutes } });
  return { ok: true as const, task: mapTask(data as JsonRecord), estimateMinutes };
}

export async function startDevEngineTaskManualBridge(taskId: string) {
  const client = await requireClient();
  const task = await getTaskForConsoleControl(client, taskId);
  if (!["queued", "ready"].includes(task.status)) {
    throw new DevCenterEngineError("Csak várakozó vagy READY task indítható új munkamenetben.", "DEV_CENTER_TASK_START_STATE_DENIED", 409, { taskId, status: task.status });
  }
  if (!task.requestedWorkerId) throw new DevCenterEngineError("A task indítása előtt felelős workert kell kijelölni.", "DEV_CENTER_TASK_OWNER_REQUIRED", 409, { taskId });
  const workerResult = await client.from("dev_center_workers").select("id,code,name,status").eq("id", task.requestedWorkerId).maybeSingle();
  if (workerResult.error) databaseError("A task worker nem olvasható.", workerResult.error);
  if (!workerResult.data) throw new DevCenterEngineError("A taskhoz rendelt worker nem található.", "DEV_CENTER_WORKER_NOT_FOUND", 404);
  let sessionId = "";
  try {
    const opened = await openDevEngineSession({ openedBy: "BenjAdmin", environmentId: "env_dev", note: `AI Fejlesztői Tér indítás: ${task.title}`, metadata: { origin: "BENJADMIN_AI_DEVELOPER_SPACE", bridgeMode: "MANUAL_CHATGPT_BRIDGE" } });
    sessionId = opened.session.id;
    await advanceDevEngineSession(sessionId, "assign_benai", {});
    await advanceDevEngineSession(sessionId, "bind_worker", { workerId: task.requestedWorkerId });
    const bound = await advanceDevEngineSession(sessionId, "bind_task", { taskId });
    if (!bound.ok || !bound.session) throw new DevCenterEngineError("A task session binding nem zárult le.", "DEV_CENTER_TASK_BIND_FAILED", 409, { taskId, sessionId });
    const now = nowIso();
    const estimateMinutes = clampEstimateMinutes(jsonRecord(task.metadata).estimateMinutes);
    const expectedFinishAt = estimateMinutes ? new Date(Date.now() + estimateMinutes * 60_000).toISOString() : null;
    const existingMeta = jsonRecord(task.metadata);
    const existingPrompt = text(existingMeta.handoffPrompt);
    const fallbackHandoff = existingPrompt ? null : buildManualBridgeHandoff({ taskId: task.id, projectId: task.projectId, workerName: text(workerResult.data.name) || text(workerResult.data.code), instruction: task.description || task.title });
    const nextMetadata = {
      ...task.metadata,
      workflowState: "STARTED_MANUAL_BRIDGE",
      operatorStartedAt: now,
      expectedFinishAt,
      activeSessionId: sessionId,
      bridgeMode: "MANUAL_CHATGPT_BRIDGE",
      bridgeState: normalizeManualBridgeState(existingMeta.bridgeState) || "WAITING_HANDOFF",
      bridgeUpdatedAt: now,
      executionGate: "TASK_BOUND",
      ...(fallbackHandoff ? {
        handoffPrompt: fallbackHandoff.prompt,
        handoffPromptSha256: fallbackHandoff.sha256,
        handoffPromptGeneratedAt: now,
        handoffSanitized: fallbackHandoff.sanitized,
        handoffSensitiveFindings: fallbackHandoff.sensitiveFindings,
      } : {}),
    };
    const updated = await client.from("dev_center_tasks").update({ metadata: nextMetadata, updated_at: now }).eq("id", taskId).select("*").single();
    if (updated.error) databaseError("A task indítási metaadata nem menthető.", updated.error);
    await addAudit(client, { action: "TASK_MANUAL_BRIDGE_STARTED", entityType: "task", entityId: taskId, sessionId, taskId, projectId: task.projectId, summary: `${task.title} munkamenet elindítva ${workerResult.data.name} részére.`, metadata: { workerId: task.requestedWorkerId, workerCode: workerResult.data.code, expectedFinishAt, executionGate: "TASK_BOUND", productionAccess: "DENY" } });
    return { ok: true as const, task: mapTask(updated.data as JsonRecord), session: bound.session, worker: mapWorker(workerResult.data as JsonRecord), expectedFinishAt };
  } catch (error) {
    if (sessionId) {
      try { await advanceDevEngineSession(sessionId, "close", { reason: "AI Fejlesztői Tér indítási rollback." }); } catch {}
    }
    throw error;
  }
}

export async function advanceDevEngineTaskManualBridge(input: { taskId: string; target: Exclude<ManualBridgeState, "WAITING_HANDOFF"> }) {
  const client = await requireClient();
  const task = await getTaskForConsoleControl(client, input.taskId);
  if (!["claimed", "in_progress", "testing"].includes(task.status)) {
    throw new DevCenterEngineError("A ChatGPT bridge állapota csak elindított tasknál módosítható.", "DEV_CENTER_BRIDGE_TASK_NOT_STARTED", 409, { taskId: task.id, status: task.status });
  }
  const metadata = jsonRecord(task.metadata);
  const sessionId = text(metadata.activeSessionId);
  if (!sessionId) throw new DevCenterEngineError("A ChatGPT bridge állapotváltásához aktív session szükséges.", "DEV_CENTER_BRIDGE_SESSION_REQUIRED", 409, { taskId: task.id });
  const session = await client.from("dev_center_worker_sessions").select("id,status,task_id,worker_id").eq("id", sessionId).maybeSingle();
  if (session.error) databaseError("A ChatGPT bridge session nem olvasható.", session.error);
  if (!session.data || session.data.status === "closed" || session.data.task_id !== task.id) {
    throw new DevCenterEngineError("A ChatGPT bridge session nem aktív vagy más taskhoz tartozik.", "DEV_CENTER_BRIDGE_SESSION_INVALID", 409, { taskId: task.id, sessionId });
  }
  const transition = assertManualBridgeTransition(metadata.bridgeState, input.target);
  if (!transition.allowed) {
    throw new DevCenterEngineError(`Érvénytelen ChatGPT bridge állapotváltás: ${transition.current} → ${input.target}.`, "DEV_CENTER_BRIDGE_TRANSITION_DENIED", 409, { taskId: task.id, current: transition.current, target: input.target, expected: transition.expected });
  }
  const now = nowIso();
  const timestampKey = input.target === "HANDED_OFF" ? "handoffAt" : input.target === "RUNNING" ? "bridgeRunningAt" : "resultPendingAt";
  const workflowState = input.target === "HANDED_OFF" ? "MANUAL_BRIDGE_HANDED_OFF" : input.target === "RUNNING" ? "MANUAL_BRIDGE_RUNNING" : "RESULT_PENDING";
  const nextMetadata = { ...metadata, bridgeState: input.target, bridgeUpdatedAt: now, workflowState, [timestampKey]: now };
  const { data, error } = await client.from("dev_center_tasks").update({ metadata: nextMetadata, updated_at: now }).eq("id", task.id).select("*").single();
  if (error) databaseError("A ChatGPT bridge állapot mentése sikertelen.", error, 409);
  const labels: Record<typeof input.target, string> = { HANDED_OFF: "ChatGPT átadás rögzítve", RUNNING: "ChatGPT munkamenet fut", RESULT_PENDING: "ChatGPT eredmény visszaérkezett" };
  await addAudit(client, {
    action: `TASK_BRIDGE_${input.target}`,
    entityType: "task",
    entityId: task.id,
    sessionId,
    taskId: task.id,
    projectId: task.projectId,
    summary: `${task.title} · ${labels[input.target]}.`,
    metadata: { bridgeMode: "MANUAL_CHATGPT_BRIDGE", bridgeState: input.target, previousBridgeState: transition.current, productionAccess: "DENY", handoffPromptSha256: text(metadata.handoffPromptSha256) || null },
  });
  return { ok: true as const, task: mapTask(data as JsonRecord), bridgeState: input.target, handoffPrompt: text(nextMetadata.handoffPrompt), handoffPromptSha256: text(nextMetadata.handoffPromptSha256) || null };
}

export async function recordDevEngineTaskManualBridgeResult(input: {
  taskId: string;
  summary: string;
  commit?: string | null;
  buildId?: string | null;
  tests?: string | null;
  docs?: string | null;
  nextStep?: string | null;
}) {
  const client = await requireClient();
  const task = await getTaskForConsoleControl(client, input.taskId);
  if (!["claimed", "in_progress", "testing"].includes(task.status)) {
    throw new DevCenterEngineError("Strukturált ChatGPT eredmény csak elindított taskhoz rögzíthető.", "DEV_CENTER_BRIDGE_RESULT_TASK_NOT_STARTED", 409, { taskId: task.id, status: task.status });
  }
  const metadata = jsonRecord(task.metadata);
  const currentBridgeState = normalizeManualBridgeState(metadata.bridgeState);
  if (!currentBridgeState || !["RUNNING", "RESULT_PENDING"].includes(currentBridgeState)) {
    throw new DevCenterEngineError("Eredmény csak RUNNING vagy RESULT_PENDING bridge állapotban rögzíthető.", "DEV_CENTER_BRIDGE_RESULT_STATE_DENIED", 409, { taskId: task.id, bridgeState: currentBridgeState || "WAITING_HANDOFF" });
  }
  const sessionId = text(metadata.activeSessionId);
  if (!sessionId) throw new DevCenterEngineError("Az eredmény rögzítéséhez aktív session szükséges.", "DEV_CENTER_BRIDGE_SESSION_REQUIRED", 409, { taskId: task.id });
  const session = await client.from("dev_center_worker_sessions").select("id,status,task_id,worker_id").eq("id", sessionId).maybeSingle();
  if (session.error) databaseError("A ChatGPT bridge session nem olvasható.", session.error);
  if (!session.data || session.data.status === "closed" || session.data.task_id !== task.id) {
    throw new DevCenterEngineError("Az eredményhez tartozó ChatGPT bridge session nem aktív.", "DEV_CENTER_BRIDGE_SESSION_INVALID", 409, { taskId: task.id, sessionId });
  }
  const summary = text(input.summary);
  if (!summary) throw new DevCenterEngineError("Az eredmény rövid összefoglalója kötelező.", "DEV_CENTER_BRIDGE_RESULT_SUMMARY_REQUIRED", 400);
  const commit = text(input.commit);
  const buildId = text(input.buildId);
  if (commit && !/^[0-9a-f]{7,64}$/i.test(commit)) throw new DevCenterEngineError("A commit azonosító csak 7–64 hexadecimális karakter lehet.", "DEV_CENTER_BRIDGE_RESULT_COMMIT_INVALID", 400);
  if (buildId && !/^[A-Za-z0-9._-]{4,160}$/.test(buildId)) throw new DevCenterEngineError("A build ID formátuma nem engedélyezett.", "DEV_CENTER_BRIDGE_RESULT_BUILD_INVALID", 400);
  const safe = buildManualBridgeResult({ summary, commit: commit || null, buildId: buildId || null, tests: input.tests, docs: input.docs, nextStep: input.nextStep });
  const now = nowIso();
  const previousHistory = Array.isArray(metadata.bridgeResultHistory) ? metadata.bridgeResultHistory.filter((item) => item && typeof item === "object" && !Array.isArray(item)).slice(-19) : [];
  const version = previousHistory.length + 1;
  const result = {
    version,
    recordedAt: now,
    source: "MANUAL_CHATGPT_BRIDGE",
    summary: safe.summary,
    commit: safe.commit,
    buildId: safe.buildId,
    tests: safe.tests,
    docs: safe.docs,
    nextStep: safe.nextStep,
    sha256: safe.sha256,
    sanitized: safe.sanitized,
    sensitiveFindings: safe.sensitiveFindings,
  };
  const nextMetadata = {
    ...metadata,
    bridgeState: "RESULT_PENDING",
    bridgeUpdatedAt: now,
    resultPendingAt: currentBridgeState === "RUNNING" ? now : text(metadata.resultPendingAt) || now,
    workflowState: task.status === "testing" ? "TESTING" : "RESULT_PENDING",
    bridgeResult: result,
    bridgeResultHistory: [...previousHistory, result],
    bridgeResultRecordedAt: now,
    bridgeResultSha256: safe.sha256,
    bridgeResultSanitized: safe.sanitized,
    bridgeResultSensitiveFindings: safe.sensitiveFindings,
    testingSuggested: task.status !== "testing",
    testingSuggestedAt: task.status !== "testing" ? now : text(metadata.testingSuggestedAt) || null,
  };
  const { data, error } = await client.from("dev_center_tasks").update({ metadata: nextMetadata, updated_at: now }).eq("id", task.id).select("*").single();
  if (error) databaseError("A strukturált ChatGPT eredmény mentése sikertelen.", error, 409);
  await addAudit(client, {
    action: "TASK_BRIDGE_RESULT_RECORDED",
    entityType: "task",
    entityId: task.id,
    sessionId,
    taskId: task.id,
    projectId: task.projectId,
    summary: `${task.title} · strukturált ChatGPT eredmény rögzítve.`,
    metadata: { version, commit: safe.commit, buildId: safe.buildId, resultSha256: safe.sha256, sanitized: safe.sanitized, productionAccess: "DENY" },
  });
  return { ok: true as const, task: mapTask(data as JsonRecord), result, bridgeState: "RESULT_PENDING" as const, testingSuggested: task.status !== "testing" };
}

export async function setDevEngineTaskTesting(taskId: string) {
  const client = await requireClient();
  const task = await getTaskForConsoleControl(client, taskId);
  if (!["claimed", "in_progress", "testing"].includes(task.status)) throw new DevCenterEngineError("Tesztelési állapot csak elindított tasknál állítható.", "DEV_CENTER_TASK_TESTING_STATE_DENIED", 409, { taskId, status: task.status });
  const now = nowIso();
  const currentMeta = jsonRecord(task.metadata);
  const currentBridgeState = normalizeManualBridgeState(currentMeta.bridgeState);
  const metadata = {
    ...task.metadata,
    workflowState: "TESTING",
    testingStartedAt: now,
    ...(currentBridgeState && currentBridgeState !== "RESULT_PENDING" ? { bridgeState: "RESULT_PENDING", bridgeUpdatedAt: now, resultPendingAt: now, bridgeAutoAdvancedByTesting: true } : {}),
  };
  const { data, error } = await client.from("dev_center_tasks").update({ status: "testing", metadata, updated_at: now }).eq("id", taskId).select("*").single();
  if (error) databaseError("A tesztelési állapot mentése sikertelen.", error, 409);
  await addAudit(client, { action: "TASK_TESTING", entityType: "task", entityId: taskId, taskId, projectId: task.projectId, summary: `${task.title} tesztelési fázisba lépett.` });
  return { ok: true as const, task: mapTask(data as JsonRecord) };
}

export async function finalizeDevEngineTask(input: { taskId: string; outcome: "completed" | "failed"; note?: string | null }) {
  const client = await requireClient();
  const task = await getTaskForConsoleControl(client, input.taskId);
  if (task.status === "cancelled") throw new DevCenterEngineError("Törölt task nem zárható le eredménnyel.", "DEV_CENTER_TASK_FINALIZE_STATE_DENIED", 409);
  if (task.status === "completed" && input.outcome === "completed") return { ok: true as const, task, alreadyFinalized: true };
  const now = nowIso();
  const note = text(input.note).slice(0, 1000);
  const sessions = await client.from("dev_center_worker_sessions").select("id").eq("task_id", task.id).neq("status", "closed");
  if (sessions.error) databaseError("Az aktív task sessionök nem olvashatók.", sessions.error);
  for (const session of sessions.data || []) {
    await advanceDevEngineSession(String(session.id), "close", { reason: input.outcome === "completed" ? "Task befejezve az AI Fejlesztői Térben." : `Task hibával lezárva: ${note || "nincs részletezés"}` });
  }
  const metadata = {
    ...task.metadata,
    workflowState: input.outcome === "completed" ? "COMPLETED" : "FAILED",
    finishedAt: now,
    bridgeFinishedAt: now,
    outcomeNote: note || null,
  };
  const patch = input.outcome === "completed"
    ? { status: "completed", completed_at: now, blocked_reason: null, metadata, updated_at: now }
    : { status: "blocked", completed_at: null, blocked_reason: note || "A fejlesztési task hibával vagy blokkoló okkal állt le.", assigned_worker_id: null, claimed_by_session_id: null, claim_expires_at: null, metadata, updated_at: now };
  const { data, error } = await client.from("dev_center_tasks").update(patch).eq("id", task.id).select("*").single();
  if (error) databaseError("A task lezárása sikertelen.", error, 409);
  await addAudit(client, {
    action: input.outcome === "completed" ? "TASK_COMPLETED" : "TASK_FAILED",
    entityType: "task",
    entityId: task.id,
    taskId: task.id,
    projectId: task.projectId,
    summary: input.outcome === "completed" ? `${task.title} elkészült.` : `${task.title} hibával / blokkolással leállt.`,
    metadata: { note: note || null, notificationRequested: true },
  });
  let rebalance: Awaited<ReturnType<typeof rebalanceBenAiWaitingTasks>> | null = null;
  try {
    rebalance = await rebalanceBenAiWaitingTasks(12, { trigger: "TASK_FINALIZED", sourceTaskId: task.id, sourceOutcome: input.outcome });
  } catch { /* a task lezárását a koordinátori újraosztás hibája nem törheti meg */ }
  return { ok: true as const, task: mapTask(data as JsonRecord), alreadyFinalized: false, rebalance };
}
