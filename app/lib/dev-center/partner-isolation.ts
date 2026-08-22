import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DevEngineOperation, DevEngineScope } from "./engine-types";
import { internalRepositoryProjectAllowed } from "./internal-repository-binding";
import { externalAiWorkerOperationAllowed, isExternalAiWorkerCode } from "./ai-worker/external-worker-policy";

export type DevelopmentPlane = "INTERNAL" | "PARTNER";
export type PartnerAccessLevel = "DENY" | "READ" | "WRITE" | "EXECUTE";
export type PartnerResourceType = "repository" | "path" | "secret" | "database" | "storage" | "engine" | "environment" | "deploy_target";

export const INTERNAL_WORKTREE_ROOT = "/srv/dimpro-dev/worktrees";
export const INTERNAL_REPOSITORY_ROOT = "/srv/dimpro-dev/repositories";
export const PARTNER_WORKTREE_ROOT = "/srv/partner-dev/worktrees";
export const PARTNER_REPOSITORY_ROOT = "/srv/partner-dev/repositories";
export const OUTMINAI_WORKER_ID = "worker_outminai";
export const OUTMINAI_WORKER_CODE = "OUTMINAI";

export class PartnerIsolationPolicyError extends Error {
  constructor(message: string, public code: string, public status = 403, public details?: unknown) {
    super(message);
  }
}

type JsonRecord = Record<string, unknown>;
type PartnerProjectRow = {
  project_id: string;
  default_worker_id: string;
  internal_engine_access: "NONE" | "ALLOWLIST";
  status: "draft" | "provisioning" | "ready" | "paused" | "closed";
};

type WorkerRow = { id: string; code: string; status?: string | null; metadata?: JsonRecord | null };

type RepositoryRow = { id: string; project_id: string; dev_path?: string | null; status?: string | null; metadata?: JsonRecord | null };

function dbFailure(message: string, error: { code?: string; message?: string; details?: string; hint?: string } | null): never {
  const schemaMissing = error?.code === "PGRST205" || error?.code === "42P01";
  throw new PartnerIsolationPolicyError(
    schemaMissing ? "A Partner Development Plane policy séma nem áll készen." : message,
    schemaMissing ? "PARTNER_POLICY_SCHEMA_NOT_READY" : error?.code || "PARTNER_POLICY_DATABASE_ERROR",
    schemaMissing ? 503 : 500,
    error ? { code: error.code, message: error.message, details: error.details, hint: error.hint } : undefined,
  );
}

function accessRank(level: PartnerAccessLevel) {
  return { DENY: 0, READ: 1, WRITE: 2, EXECUTE: 3 }[level];
}

export function worktreeRootForPlane(plane: DevelopmentPlane) {
  return plane === "PARTNER" ? PARTNER_WORKTREE_ROOT : INTERNAL_WORKTREE_ROOT;
}

export function scopeResource(scope: DevEngineScope): { resourceType: PartnerResourceType; resourceRef: string; required: PartnerAccessLevel } {
  if (scope.type === "migration") return { resourceType: "database", resourceRef: `migration:${scope.key}`, required: "EXECUTE" };
  if (scope.type === "release") return { resourceType: "deploy_target", resourceRef: `release:${scope.key}`, required: "EXECUTE" };
  if (scope.type === "environment") return { resourceType: "environment", resourceRef: scope.key, required: "WRITE" };
  if (scope.type === "module") return { resourceType: "path", resourceRef: `module:${scope.key}`, required: "WRITE" };
  return { resourceType: "path", resourceRef: scope.key, required: "WRITE" };
}

export async function resolveDevelopmentPlane(db: SupabaseClient, projectId: string) {
  if (!projectId) throw new PartnerIsolationPolicyError("A projectId kötelező a plane feloldásához.", "PARTNER_PROJECT_REQUIRED", 400);
  const { data, error } = await db
    .from("dev_center_partner_projects")
    .select("project_id,default_worker_id,internal_engine_access,status")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) dbFailure("A partnerprojekt policy rekord nem olvasható.", error);
  if (!data) return { plane: "INTERNAL" as const, partner: null };
  return { plane: "PARTNER" as const, partner: data as PartnerProjectRow };
}

async function workerRow(db: SupabaseClient, workerId: string) {
  if (!workerId) throw new PartnerIsolationPolicyError("A workerId kötelező.", "PARTNER_WORKER_REQUIRED", 400);
  const { data, error } = await db.from("dev_center_workers").select("id,code,status,metadata").eq("id", workerId).maybeSingle();
  if (error) dbFailure("A worker policy ellenőrzése sikertelen.", error);
  if (!data) throw new PartnerIsolationPolicyError("A worker nem található.", "PARTNER_WORKER_NOT_FOUND", 404);
  return data as WorkerRow;
}

export async function assertWorkerProjectIsolation(db: SupabaseClient, input: { workerId: string; projectId: string }) {
  const [worker, planeInfo] = await Promise.all([workerRow(db, input.workerId), resolveDevelopmentPlane(db, input.projectId)]);

  if (planeInfo.plane === "INTERNAL") {
    // OutminAI dual-role policy (2026-08-22): internal DEV explicit assignment is allowed.
    // Automatic next-task claim remains denied in orchestration; partner-plane isolation remains strict.
    // PROD access is not granted by this rule.
    if (isExternalAiWorkerCode(worker.code)) {
      const metadata = worker.metadata && typeof worker.metadata === "object" ? worker.metadata : {};
      if (metadata.layer !== "EXTERNAL_AI" || metadata.productionAccess !== "DENY") {
        throw new PartnerIsolationPolicyError("A külső AI worker policy metadata hiányos; fail-closed.", "EXTERNAL_AI_WORKER_POLICY_NOT_READY", 403, { workerId: worker.id, workerCode: worker.code });
      }
    }
    return { allowed: true as const, worker, plane: planeInfo.plane, partner: null };
  }

  const partner = planeInfo.partner;
  if (!partner || partner.default_worker_id !== worker.id || worker.code !== OUTMINAI_WORKER_CODE) {
    throw new PartnerIsolationPolicyError(
      "Partnerprojekt kizárólag a saját OutminAI workerével futtatható.",
      "PARTNER_WORKER_PROJECT_DENIED",
      403,
      { workerId: worker.id, projectId: input.projectId, requiredWorkerId: partner?.default_worker_id || OUTMINAI_WORKER_ID },
    );
  }
  if (["paused", "closed"].includes(partner.status)) {
    throw new PartnerIsolationPolicyError("A partnerprojekt jelenlegi állapotában nem futtatható.", "PARTNER_PROJECT_NOT_RUNNABLE", 403, { projectId: input.projectId, status: partner.status });
  }
  return { allowed: true as const, worker, plane: planeInfo.plane, partner };
}

async function repositoryRow(db: SupabaseClient, repositoryId: string) {
  if (!repositoryId) throw new PartnerIsolationPolicyError("Partner művelethez repository kötelező.", "PARTNER_REPOSITORY_REQUIRED", 403);
  const { data, error } = await db.from("dev_center_repositories").select("id,project_id,dev_path,status,metadata").eq("id", repositoryId).maybeSingle();
  if (error) dbFailure("A repository policy ellenőrzése sikertelen.", error);
  if (!data) throw new PartnerIsolationPolicyError("A repository nem található.", "PARTNER_REPOSITORY_NOT_FOUND", 404);
  return data as RepositoryRow;
}

export async function assertPartnerResourceAccess(db: SupabaseClient, input: {
  projectId: string;
  workerId: string;
  resourceType: PartnerResourceType;
  resourceRef: string;
  required: PartnerAccessLevel;
}) {
  const isolation = await assertWorkerProjectIsolation(db, { workerId: input.workerId, projectId: input.projectId });
  if (isolation.plane === "INTERNAL") return { ...isolation, access: "EXECUTE" as const };

  const { data, error } = await db
    .from("dev_center_partner_access_policies")
    .select("id,access_level,expires_at,resource_type,resource_ref")
    .eq("project_id", input.projectId)
    .eq("subject_worker_id", input.workerId)
    .eq("resource_type", input.resourceType)
    .eq("resource_ref", input.resourceRef)
    .order("updated_at", { ascending: false });
  if (error) dbFailure("A partner resource policy nem olvasható.", error);

  const policies = (data || []) as Array<{ id: string; access_level: PartnerAccessLevel; expires_at?: string | null; resource_type: PartnerResourceType; resource_ref: string }>;
  const live = policies.filter((policy) => !policy.expires_at || Date.parse(policy.expires_at) > Date.now());
  if (live.some((policy) => policy.access_level === "DENY")) {
    throw new PartnerIsolationPolicyError("A partner resource policy explicit DENY szabályt tartalmaz.", "PARTNER_RESOURCE_EXPLICIT_DENY", 403, {
      projectId: input.projectId,
      workerId: input.workerId,
      resourceType: input.resourceType,
      resourceRef: input.resourceRef,
    });
  }
  const strongest = live.reduce<PartnerAccessLevel>((best, policy) => accessRank(policy.access_level) > accessRank(best) ? policy.access_level : best, "DENY");
  if (accessRank(strongest) < accessRank(input.required)) {
    throw new PartnerIsolationPolicyError("A partner resource nincs allowlistelve a kért művelethez.", "PARTNER_RESOURCE_POLICY_DENIED", 403, {
      projectId: input.projectId,
      workerId: input.workerId,
      resourceType: input.resourceType,
      resourceRef: input.resourceRef,
      required: input.required,
      effective: strongest,
    });
  }
  return { ...isolation, access: strongest };
}

export async function resolveProjectRepositoryId(db: SupabaseClient, projectId: string) {
  const planeInfo = await resolveDevelopmentPlane(db, projectId);
  if (planeInfo.plane === "PARTNER") {
    const { data, error } = await db.from("dev_center_repositories").select("id,project_id,dev_path,status,metadata").eq("project_id", projectId).eq("status", "active").order("created_at", { ascending: true }).limit(2);
    if (error) dbFailure("A partner repository-kötés nem olvasható.", error);
    const rows = (data || []) as RepositoryRow[];
    if (!rows.length) return null;
    if (rows.length > 1) throw new PartnerIsolationPolicyError("A partnerprojekthez több aktív repository tartozik; explicit repository választás szükséges.", "PARTNER_REPOSITORY_AMBIGUOUS", 409, { projectId, repositoryIds: rows.map((row) => row.id) });
    return rows[0].id;
  }

  const { data, error } = await db.from("dev_center_repositories").select("id,project_id,dev_path,status,metadata").eq("status", "active");
  if (error) dbFailure("A belső repository-kötés nem olvasható.", error);
  const matches = ((data || []) as RepositoryRow[]).filter((repository) => internalRepositoryProjectAllowed(repository, projectId));
  if (!matches.length) return null;
  if (matches.length > 1) throw new PartnerIsolationPolicyError("A belső projekthez több aktív repository-kötés tartozik; a végrehajtás fail-closed.", "INTERNAL_REPOSITORY_AMBIGUOUS", 409, { projectId, repositoryIds: matches.map((row) => row.id) });
  return matches[0].id;
}

export async function assertRepositoryIsolation(db: SupabaseClient, input: { workerId: string; projectId: string; repositoryId: string; required?: PartnerAccessLevel }) {
  const repository = await repositoryRow(db, input.repositoryId);
  const isolation = await assertWorkerProjectIsolation(db, { workerId: input.workerId, projectId: input.projectId });

  if (isolation.plane === "INTERNAL") {
    if (!internalRepositoryProjectAllowed(repository, input.projectId)) {
      throw new PartnerIsolationPolicyError("A repository nincs az adott belső DIMPRO projekthez allowlistelve.", "INTERNAL_REPOSITORY_PROJECT_NOT_BOUND", 403, {
        projectId: input.projectId, repositoryId: input.repositoryId, repositoryProjectId: repository.project_id,
      });
    }
    const root = path.resolve(INTERNAL_REPOSITORY_ROOT);
    const devPath = repository.dev_path ? path.resolve(repository.dev_path) : "";
    if (!devPath || (devPath !== root && !devPath.startsWith(`${root}${path.sep}`))) {
      throw new PartnerIsolationPolicyError("A belső repository dev_path kívül esik a DIMPRO DEV repository gyökéren.", "INTERNAL_REPOSITORY_PATH_DENIED", 403, { repositoryId: input.repositoryId, devPath: repository.dev_path || null, root });
    }
    return { ...isolation, access: "EXECUTE" as const, repository };
  }

  if (repository.project_id !== input.projectId) {
    throw new PartnerIsolationPolicyError("A repository nem a session partnerprojektjéhez tartozik.", "PARTNER_REPOSITORY_PROJECT_MISMATCH", 403, {
      projectId: input.projectId,
      repositoryId: input.repositoryId,
      repositoryProjectId: repository.project_id,
    });
  }
  const access = await assertPartnerResourceAccess(db, {
    projectId: input.projectId,
    workerId: input.workerId,
    resourceType: "repository",
    resourceRef: input.repositoryId,
    required: input.required || "WRITE",
  });
  const root = path.resolve(PARTNER_REPOSITORY_ROOT);
  const devPath = repository.dev_path ? path.resolve(repository.dev_path) : "";
  if (!devPath || (devPath !== root && !devPath.startsWith(`${root}${path.sep}`))) {
    throw new PartnerIsolationPolicyError(
      "A partner repository dev_path kívül esik a Partner Development Plane repository gyökéren.",
      "PARTNER_REPOSITORY_PATH_DENIED",
      403,
      { repositoryId: input.repositoryId, devPath: repository.dev_path || null, root },
    );
  }
  return { ...access, repository };
}

export async function assertScopeIsolation(db: SupabaseClient, input: { workerId: string; projectId: string; scopes: DevEngineScope[] }) {
  const isolation = await assertWorkerProjectIsolation(db, { workerId: input.workerId, projectId: input.projectId });
  if (isolation.plane === "INTERNAL") return isolation;
  for (const scope of input.scopes) {
    const resource = scopeResource(scope);
    await assertPartnerResourceAccess(db, {
      projectId: input.projectId,
      workerId: input.workerId,
      resourceType: resource.resourceType,
      resourceRef: resource.resourceRef,
      required: resource.required,
    });
  }
  return isolation;
}

export async function assertPartnerEngineOperationIsolation(db: SupabaseClient, input: {
  workerId: string;
  projectId: string;
  environmentId: string;
  operation: DevEngineOperation;
}) {
  const isolation = await assertWorkerProjectIsolation(db, { workerId: input.workerId, projectId: input.projectId });
  if (isolation.plane === "INTERNAL") {
    if (isExternalAiWorkerCode(isolation.worker.code)) {
      const { data: environment, error: environmentError } = await db.from("dev_center_environments").select("id,code,kind,status,read_only").eq("id", input.environmentId).maybeSingle();
      if (environmentError) dbFailure("A külső AI worker DEV környezete nem olvasható.", environmentError);
      if (!environment || environment.kind !== "DEV" || environment.status !== "online") {
        throw new PartnerIsolationPolicyError("Külső AI worker kizárólag online DEV környezetben futtatható.", "EXTERNAL_AI_WORKER_DEV_ONLY", 403, { workerId: isolation.worker.id, environmentId: input.environmentId, environmentKind: environment?.kind || null });
      }
      if (environment.read_only && input.operation === "write") {
        throw new PartnerIsolationPolicyError("A DEV környezet read-only; külső AI worker írás tiltott.", "EXTERNAL_AI_WORKER_ENV_READ_ONLY", 403, { workerId: isolation.worker.id, environmentId: input.environmentId });
      }
      if (!externalAiWorkerOperationAllowed(isolation.worker.code, input.operation)) {
        throw new PartnerIsolationPolicyError("A külső AI worker számára a kért engine művelet technikailag tiltott.", "EXTERNAL_AI_WORKER_OPERATION_DENIED", 403, { workerId: isolation.worker.id, workerCode: isolation.worker.code, operation: input.operation });
      }
    }
    return isolation;
  }

  const { data: environmentBinding, error: environmentError } = await db
    .from("dev_center_partner_environments")
    .select("project_id,environment_id,environment_type,health_status")
    .eq("project_id", input.projectId)
    .eq("environment_id", input.environmentId)
    .maybeSingle();
  if (environmentError) dbFailure("A partner környezetkötés nem olvasható.", environmentError);
  if (!environmentBinding) {
    throw new PartnerIsolationPolicyError("A session környezete nincs a partnerprojekthez kötve.", "PARTNER_ENVIRONMENT_NOT_BOUND", 403, {
      projectId: input.projectId,
      environmentId: input.environmentId,
    });
  }
  if (["offline", "unknown"].includes(String(environmentBinding.health_status || "unknown"))) {
    throw new PartnerIsolationPolicyError("A partner környezet nem végrehajtható állapotú.", "PARTNER_ENVIRONMENT_NOT_READY", 403, {
      projectId: input.projectId,
      environmentId: input.environmentId,
      healthStatus: environmentBinding.health_status,
    });
  }

  const engineKey = `dev-center:${input.operation}`;
  const { data: entitlement, error } = await db
    .from("dev_center_partner_engine_entitlements")
    .select("id,engine_key,status,allowed_version_range,current_version")
    .eq("project_id", input.projectId)
    .eq("engine_key", engineKey)
    .eq("status", "allowed")
    .maybeSingle();
  if (error) dbFailure("A partner engine entitlement nem olvasható.", error);
  if (!entitlement) {
    throw new PartnerIsolationPolicyError("A partnerprojekt számára a kért shared engine művelet nincs engedélyezve.", "PARTNER_ENGINE_ENTITLEMENT_DENIED", 403, {
      projectId: input.projectId,
      workerId: input.workerId,
      engineKey,
    });
  }

  await assertPartnerResourceAccess(db, {
    projectId: input.projectId,
    workerId: input.workerId,
    resourceType: "environment",
    resourceRef: input.environmentId,
    required: ["deploy", "restart", "migration"].includes(input.operation) ? "EXECUTE" : "WRITE",
  });
  return { ...isolation, entitlement: entitlement as JsonRecord, engineKey };
}
