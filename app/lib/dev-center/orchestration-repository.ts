import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DevEngineScope } from "./engine-types";
import {
  assertRepositoryIsolation,
  assertScopeIsolation,
  assertWorkerProjectIsolation,
  OUTMINAI_WORKER_ID,
  PartnerIsolationPolicyError,
} from "./partner-isolation";

export const DEV_ENGINE_DEFAULT_LEASE_SECONDS = 900;
export const DEV_ENGINE_MIN_LEASE_SECONDS = 60;
export const DEV_ENGINE_MAX_LEASE_SECONDS = 3600;

type JsonRecord = Record<string, unknown>;
type RpcError = { code?: string; message?: string; details?: string; hint?: string } | null;

export class DevCenterOrchestrationError extends Error {
  constructor(message: string, public code: string, public status = 500, public details?: unknown) {
    super(message);
  }
}

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey || serviceKey.includes("<") || serviceKey.includes(">")) {
    throw new DevCenterOrchestrationError("A BENJADMIN PostgreSQL kapcsolat nincs beállítva.", "DEV_CENTER_DATABASE_NOT_CONFIGURED", 503);
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-benjadmin-orchestration/0.3.0" } },
  });
}

function leaseSeconds(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEV_ENGINE_DEFAULT_LEASE_SECONDS;
  return Math.max(DEV_ENGINE_MIN_LEASE_SECONDS, Math.min(DEV_ENGINE_MAX_LEASE_SECONDS, Math.round(n)));
}

function scopeList(value: unknown): DevEngineScope[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({ type: String(item.type || "path").trim() as DevEngineScope["type"], key: String(item.key || "").trim() }))
    .filter((item) => ["path", "module", "migration", "release", "environment"].includes(item.type) && item.key.length > 0);
}

function rpcCode(error: RpcError) {
  const message = error?.message || "";
  const known = [
    "DEV_CENTER_SESSION_NOT_FOUND",
    "DEV_CENTER_SESSION_CLOSED",
    "DEV_CENTER_HANDSHAKE_ORDER",
    "DEV_CENTER_SESSION_WORKER_MISMATCH",
    "DEV_CENTER_TASK_NOT_FOUND",
    "DEV_CENTER_TASK_ALREADY_CLAIMED",
    "DEV_CENTER_TASK_WORKER_MISMATCH",
    "DEV_CENTER_TASK_DEPENDENCY_BLOCKED",
    "DEV_CENTER_BRANCH_CONFLICT",
    "DEV_CENTER_WORKTREE_CONFLICT",
    "DEV_CENTER_SCOPE_CONFLICT",
    "DEV_CENTER_INVALID_SCOPE",
    "DEV_CENTER_SCOPE_REQUIRED",
    "DEV_CENTER_SESSION_NOT_READY",
  ];
  return known.find((code) => message.includes(code)) || error?.code || "DEV_CENTER_ORCHESTRATION_ERROR";
}


function throwPolicy(error: unknown): never {
  if (error instanceof PartnerIsolationPolicyError) {
    throw new DevCenterOrchestrationError(error.message, error.code, error.status, error.details);
  }
  throw error;
}

function statusFor(code: string) {
  if (code === "DEV_CENTER_SESSION_NOT_FOUND" || code === "DEV_CENTER_TASK_NOT_FOUND") return 404;
  if (code.includes("CONFLICT") || code.includes("ALREADY") || code.includes("BLOCKED") || code.includes("MISMATCH") || code === "DEV_CENTER_HANDSHAKE_ORDER") return 409;
  if (code === "DEV_CENTER_SESSION_NOT_READY") return 403;
  return 500;
}

async function recordConflict(db: SupabaseClient, input: {
  conflictType: "scope" | "branch" | "worktree" | "task" | "worker" | "dependency" | "lease";
  requesterSessionId?: string | null;
  holderSessionId?: string | null;
  taskId?: string | null;
  repositoryId?: string | null;
  scopeType?: string | null;
  scopeKey?: string | null;
  summary: string;
  details?: JsonRecord;
}) {
  const { error } = await db.from("dev_center_conflicts").insert({
    id: `dev-conflict-${randomUUID().slice(0, 12)}`,
    conflict_type: input.conflictType,
    repository_id: input.repositoryId || null,
    requester_session_id: input.requesterSessionId || null,
    holder_session_id: input.holderSessionId || null,
    task_id: input.taskId || null,
    scope_type: input.scopeType || null,
    scope_key: input.scopeKey || null,
    status: "open",
    summary: input.summary,
    details: input.details || {},
  });
  if (error) console.error("BENJADMIN conflict log failed", error.code, error.message);
}

async function throwRpc(db: SupabaseClient, error: RpcError, context: JsonRecord = {}): Promise<never> {
  const code = rpcCode(error);
  const message = error?.message || "A BENJADMIN orchestration művelet sikertelen.";
  const sessionId = typeof context.sessionId === "string" ? context.sessionId : null;
  if (code.includes("BRANCH_CONFLICT")) await recordConflict(db, { conflictType: "branch", requesterSessionId: sessionId, summary: "Branch ütközés blokkolva.", details: { code, message, ...context } });
  else if (code.includes("WORKTREE_CONFLICT")) await recordConflict(db, { conflictType: "worktree", requesterSessionId: sessionId, summary: "Worktree ütközés blokkolva.", details: { code, message, ...context } });
  else if (code.includes("SCOPE_CONFLICT")) await recordConflict(db, { conflictType: "scope", requesterSessionId: sessionId, summary: "Scope ütközés blokkolva.", details: { code, message, ...context } });
  else if (code.includes("TASK_DEPENDENCY")) await recordConflict(db, { conflictType: "dependency", requesterSessionId: sessionId, summary: "Task dependency blokkolta a claimet.", details: { code, message, ...context } });
  else if (code.includes("TASK_ALREADY") || code.includes("TASK_WORKER")) await recordConflict(db, { conflictType: "task", requesterSessionId: sessionId, summary: "Task claim ütközés blokkolva.", details: { code, message, ...context } });
  throw new DevCenterOrchestrationError(message, code, statusFor(code), { ...context, database: error });
}

export async function claimTaskAtomic(input: { sessionId: string; workerId: string; taskId?: string | null; leaseSeconds?: number }) {
  const db = client();
  const seconds = leaseSeconds(input.leaseSeconds);
  const workerPolicy = await db.from("dev_center_workers").select("id,code,metadata").eq("id", input.workerId).maybeSingle();
  if (workerPolicy.error) throw new DevCenterOrchestrationError(workerPolicy.error.message, workerPolicy.error.code || "DEV_CENTER_WORKER_POLICY_READ_ERROR", 500);
  if (workerPolicy.data?.code === "VGUARD") {
    throw new DevCenterOrchestrationError("V.Guard review-only worker nem claimelhet normál fejlesztési taskot.", "EXTERNAL_AI_VGUARD_DIRECT_CLAIM_DENIED", 403, { workerId: input.workerId, taskId: input.taskId || null });
  }
  if (!input.taskId && input.workerId === OUTMINAI_WORKER_ID) {
    throw new DevCenterOrchestrationError(
      "OutminAI csak explicit kiosztott taskot claimelhet; automatikus next-task claim tiltott.",
      "PARTNER_OUTMIN_EXPLICIT_TASK_REQUIRED",
      403,
    );
  }
  if (input.taskId) {
    const { data: task, error: taskError } = await db.from("dev_center_tasks").select("id,project_id,repository_id").eq("id", input.taskId).maybeSingle();
    if (taskError) throw new DevCenterOrchestrationError(taskError.message, taskError.code || "DEV_CENTER_TASK_POLICY_READ_ERROR", 500);
    if (!task) throw new DevCenterOrchestrationError("A task nem található.", "DEV_CENTER_TASK_NOT_FOUND", 404);
    try {
      const isolation = await assertWorkerProjectIsolation(db, { workerId: input.workerId, projectId: String(task.project_id || "") });
      if (isolation.worker.code === "VGUARD") {
        throw new DevCenterOrchestrationError("V.Guard review-only worker nem használhat normál task claimet; review binding szükséges.", "EXTERNAL_AI_VGUARD_DIRECT_CLAIM_DENIED", 403, { taskId: input.taskId, workerId: input.workerId });
      }
      if (isolation.plane === "PARTNER" && !task.repository_id) {
        throw new PartnerIsolationPolicyError("Partner task repository nélkül nem claimelhető fejlesztésre.", "PARTNER_REPOSITORY_REQUIRED", 403, { taskId: input.taskId });
      }
      if (task.repository_id) await assertRepositoryIsolation(db, { workerId: input.workerId, projectId: String(task.project_id || ""), repositoryId: String(task.repository_id), required: "WRITE" });
    } catch (error) {
      throwPolicy(error);
    }
  }
  const rpc = input.taskId ? "dev_center_claim_task_atomic" : "dev_center_claim_next_task_atomic";
  const params = input.taskId
    ? { p_session_id: input.sessionId, p_worker_id: input.workerId, p_task_id: input.taskId, p_lease_seconds: seconds }
    : { p_session_id: input.sessionId, p_worker_id: input.workerId, p_lease_seconds: seconds };
  const { data, error } = await db.rpc(rpc, params);
  if (error) return throwRpc(db, error, { sessionId: input.sessionId, workerId: input.workerId, taskId: input.taskId || null });
  return { task: data as JsonRecord | null, leaseSeconds: seconds };
}

export async function acquireScopeBundleAtomic(input: { sessionId: string; scope: unknown; leaseSeconds?: number }) {
  const db = client();
  const scopes = scopeList(input.scope);
  if (!scopes.length) throw new DevCenterOrchestrationError("Legalább egy érvényes scope kötelező.", "DEV_CENTER_SCOPE_REQUIRED", 400);
  const { data: session, error: sessionError } = await db
    .from("dev_center_worker_sessions")
    .select("id,worker_id,project_id,repository_id")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (sessionError) throw new DevCenterOrchestrationError(sessionError.message, sessionError.code || "DEV_CENTER_SESSION_POLICY_READ_ERROR", 500);
  if (!session) throw new DevCenterOrchestrationError("A worker session nem található.", "DEV_CENTER_SESSION_NOT_FOUND", 404);
  if (!session.worker_id || !session.project_id || !session.repository_id) {
    throw new DevCenterOrchestrationError("Scope claim előtt worker/project/repository policy context szükséges.", "DEV_CENTER_SESSION_POLICY_CONTEXT_MISSING", 403);
  }
  try {
    const isolation = await assertWorkerProjectIsolation(db, { workerId: String(session.worker_id), projectId: String(session.project_id) });
    if (isolation.worker.code === "VGUARD") {
      throw new DevCenterOrchestrationError("V.Guard review-only worker nem szerezhet scope lockot.", "EXTERNAL_AI_VGUARD_SCOPE_DENIED", 403, { sessionId: input.sessionId });
    }
    await assertRepositoryIsolation(db, { workerId: String(session.worker_id), projectId: String(session.project_id), repositoryId: String(session.repository_id), required: "WRITE" });
    await assertScopeIsolation(db, { workerId: String(session.worker_id), projectId: String(session.project_id), scopes });
  } catch (error) {
    throwPolicy(error);
  }
  const seconds = leaseSeconds(input.leaseSeconds);
  const { data, error } = await db.rpc("dev_center_acquire_scope_bundle_atomic", {
    p_session_id: input.sessionId,
    p_scopes: scopes,
    p_lease_seconds: seconds,
  });
  if (error) return throwRpc(db, error, { sessionId: input.sessionId, scope: scopes });
  return { result: data as JsonRecord, scope: scopes, leaseSeconds: seconds };
}

export async function heartbeatSessionAtomic(sessionId: string, requestedLeaseSeconds?: number) {
  const db = client();
  const seconds = leaseSeconds(requestedLeaseSeconds);
  const { data, error } = await db.rpc("dev_center_heartbeat_session_atomic", { p_session_id: sessionId, p_lease_seconds: seconds });
  if (error) return throwRpc(db, error, { sessionId });
  return { session: data as JsonRecord, leaseSeconds: seconds };
}

export async function releaseSessionAtomic(sessionId: string, reason: string, requeueTask = true) {
  const db = client();
  const { data, error } = await db.rpc("dev_center_release_session_atomic", {
    p_session_id: sessionId,
    p_reason: reason || "Session lezárva.",
    p_requeue_task: requeueTask,
  });
  if (error) return throwRpc(db, error, { sessionId, requeueTask });
  return data as JsonRecord;
}

export async function completeTaskAtomic(sessionId: string, summary = "") {
  const db = client();
  const { data, error } = await db.rpc("dev_center_complete_task_atomic", { p_session_id: sessionId, p_summary: summary });
  if (error) return throwRpc(db, error, { sessionId });
  return data as JsonRecord;
}

export async function recoverStaleSessionsAtomic(limit = 20) {
  const db = client();
  const safeLimit = Math.max(1, Math.min(100, Math.round(Number(limit) || 20)));
  const { data, error } = await db.rpc("dev_center_recover_stale_sessions_atomic", { p_limit: safeLimit });
  if (error) return throwRpc(db, error, { limit: safeLimit });
  return data as JsonRecord;
}

export async function getOrchestrationSnapshot() {
  const db = client();
  const now = new Date().toISOString();
  const [leases, conflicts, staleSessions] = await Promise.all([
    db.from("dev_center_worktree_leases").select("*").eq("status", "active").order("acquired_at", { ascending: false }),
    db.from("dev_center_conflicts").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(100),
    db.from("dev_center_worker_sessions").select("id,worker_id,task_id,handshake_stage,lease_expires_at,last_heartbeat_at").neq("status", "closed").not("lease_expires_at", "is", null).lte("lease_expires_at", now),
  ]);
  for (const result of [leases, conflicts, staleSessions]) {
    if (result.error) throw new DevCenterOrchestrationError(result.error.message, result.error.code || "DEV_CENTER_ORCHESTRATION_READ_ERROR", 500);
  }
  return { activeWorktreeLeases: leases.data || [], openConflicts: conflicts.data || [], staleSessions: staleSessions.data || [], checkedAt: now };
}
