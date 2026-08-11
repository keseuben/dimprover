import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPartnerRuntimeIsolationStatus } from "./partner-runtime";

export const PARTNER_PLANE_SCHEMA_VERSION = "0.1.0";
export const PARTNER_PLANE_BOOTSTRAP_ID = "BENJADMIN-B3.2-P1-20260811";
export const PARTNER_PLANE_TABLES = [
  "dev_center_partner_projects",
  "dev_center_partner_environments",
  "dev_center_partner_access_policies",
  "dev_center_partner_engine_entitlements",
  "dev_center_partner_delivery_targets",
  "dev_center_partner_handoffs",
  "dev_center_secret_references",
] as const;

export type PartnerDeliveryModel = "DIMPRO_HOSTED" | "PARTNER_HOSTED" | "HANDOFF";
export type PartnerDataClassification = "NORMAL" | "CONFIDENTIAL" | "RESTRICTED";
export type PartnerProjectStatus = "draft" | "provisioning" | "ready" | "paused" | "closed";

type DbError = { code?: string; message?: string; details?: string; hint?: string } | null;
type JsonRecord = Record<string, unknown>;

export type PartnerPlaneHealth = {
  configured: boolean;
  ready: boolean;
  expectedSchemaVersion: string;
  actualSchemaVersion: string | null;
  bootstrapId: string | null;
  migrationCount: number | null;
  checks: Array<{ table: string; ready: boolean; errorCode: string | null; errorMessage: string | null }>;
  errorCode: string | null;
  checkedAt: string;
};

export type PartnerProjectSummary = {
  projectId: string;
  projectCode: string;
  name: string;
  slug: string;
  partnerOrgId: string | null;
  deliveryModel: PartnerDeliveryModel;
  dataClassification: PartnerDataClassification;
  status: PartnerProjectStatus;
  internalEngineAccess: "NONE" | "ALLOWLIST";
  defaultWorkerId: string;
  defaultWorkerCode: string;
  defaultWorkerName: string;
  repositoryCount: number;
  environments: {
    DEV: string;
    STAG: string;
    PROD: string;
  };
  deliveryTargetStatus: string;
  lastActivityAt: string;
  health: "DRAFT" | "READY" | "DEGRADED" | "PENDING" | "CLOSED";
  metadata: JsonRecord;
};

export class PartnerDevelopmentError extends Error {
  constructor(message: string, public code: string, public status = 500, public details?: unknown) {
    super(message);
  }
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function jsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function getDatabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey || serviceKey.includes("<") || serviceKey.includes(">")) {
    throw new PartnerDevelopmentError(
      "A BENJADMIN Partner Development Plane PostgreSQL-kapcsolata nincs beállítva.",
      "PARTNER_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-benjadmin-partner-plane/0.1.0" } },
  });
}

function databaseError(message: string, error: DbError, status = 500): never {
  const missing = error?.code === "PGRST205" || error?.code === "42P01" || error?.code === "PGRST202";
  throw new PartnerDevelopmentError(
    missing ? "A BENJADMIN B3.2 Partner Registry sémája még nincs alkalmazva." : message,
    missing ? "PARTNER_SCHEMA_NOT_READY" : error?.code || "PARTNER_DATABASE_ERROR",
    missing ? 503 : status,
    error ? { message: error.message, details: error.details, hint: error.hint } : undefined,
  );
}

function knownRpcCode(error: DbError) {
  const message = error?.message || "";
  return [
    "PARTNER_PROJECT_NAME_INVALID",
    "PARTNER_PROJECT_SLUG_INVALID",
    "PARTNER_PROJECT_CREATION_KEY_INVALID",
    "PARTNER_DELIVERY_MODEL_INVALID",
    "PARTNER_DATA_CLASSIFICATION_INVALID",
    "PARTNER_PROJECT_SLUG_CONFLICT",
    "PARTNER_DEFAULT_WORKER_INVALID",
  ].find((code) => message.includes(code)) || null;
}

function rpcStatus(code: string) {
  if (code === "PARTNER_PROJECT_SLUG_CONFLICT") return 409;
  if (code === "PARTNER_DEFAULT_WORKER_INVALID") return 503;
  return 400;
}

export async function getPartnerDevelopmentPlaneHealth(): Promise<PartnerPlaneHealth> {
  const checkedAt = new Date().toISOString();
  try {
    const db = getDatabaseClient();
    const checks = await Promise.all(PARTNER_PLANE_TABLES.map(async (table) => {
      const { error } = await db.from(table).select("*").limit(0);
      return {
        table,
        ready: !error,
        errorCode: error?.code || null,
        errorMessage: error?.message || null,
      };
    }));
    const { data: marker, error: markerError } = await db
      .from("dev_center_schema_meta")
      .select("schema_version,migration_count,bootstrap_id")
      .eq("component", "partner-development-plane")
      .maybeSingle();

    const markerReady = !markerError
      && marker?.schema_version === PARTNER_PLANE_SCHEMA_VERSION
      && marker?.bootstrap_id === PARTNER_PLANE_BOOTSTRAP_ID;

    return {
      configured: true,
      ready: checks.every((item) => item.ready) && markerReady,
      expectedSchemaVersion: PARTNER_PLANE_SCHEMA_VERSION,
      actualSchemaVersion: marker?.schema_version || null,
      bootstrapId: marker?.bootstrap_id || null,
      migrationCount: marker?.migration_count == null ? null : Number(marker.migration_count),
      checks,
      errorCode: checks.find((item) => !item.ready)?.errorCode
        || markerError?.code
        || (markerReady ? null : "PARTNER_SCHEMA_VERSION_MISMATCH"),
      checkedAt,
    };
  } catch (error) {
    return {
      configured: !(error instanceof PartnerDevelopmentError && error.code === "PARTNER_DATABASE_NOT_CONFIGURED"),
      ready: false,
      expectedSchemaVersion: PARTNER_PLANE_SCHEMA_VERSION,
      actualSchemaVersion: null,
      bootstrapId: null,
      migrationCount: null,
      checks: PARTNER_PLANE_TABLES.map((table) => ({
        table,
        ready: false,
        errorCode: error instanceof PartnerDevelopmentError ? error.code : "PARTNER_DATABASE_ERROR",
        errorMessage: error instanceof Error ? error.message : null,
      })),
      errorCode: error instanceof PartnerDevelopmentError ? error.code : "PARTNER_DATABASE_ERROR",
      checkedAt,
    };
  }
}

async function requireReadyClient() {
  const health = await getPartnerDevelopmentPlaneHealth();
  if (!health.ready) {
    throw new PartnerDevelopmentError(
      "A BENJADMIN B3.2 Partner Registry sémája még nincs alkalmazva.",
      "PARTNER_SCHEMA_NOT_READY",
      503,
      health,
    );
  }
  return { db: getDatabaseClient(), health };
}

function normalizeDelivery(value: unknown): PartnerDeliveryModel {
  const delivery = text(value, "HANDOFF").toUpperCase();
  if (!["DIMPRO_HOSTED", "PARTNER_HOSTED", "HANDOFF"].includes(delivery)) {
    throw new PartnerDevelopmentError("Érvénytelen partner delivery model.", "PARTNER_DELIVERY_MODEL_INVALID", 400);
  }
  return delivery as PartnerDeliveryModel;
}

function normalizeClassification(value: unknown): PartnerDataClassification {
  const classification = text(value, "NORMAL").toUpperCase();
  if (!["NORMAL", "CONFIDENTIAL", "RESTRICTED"].includes(classification)) {
    throw new PartnerDevelopmentError("Érvénytelen partner adatminősítés.", "PARTNER_DATA_CLASSIFICATION_INVALID", 400);
  }
  return classification as PartnerDataClassification;
}

function normalizeSlug(value: unknown) {
  const slug = text(value).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) {
    throw new PartnerDevelopmentError(
      "A partnerprojekt slug csak kisbetűt, számot és kötőjelet tartalmazhat.",
      "PARTNER_PROJECT_SLUG_INVALID",
      400,
    );
  }
  return slug;
}

function normalizeName(value: unknown) {
  const name = text(value);
  if (!name || name.length > 160) {
    throw new PartnerDevelopmentError("A partnerprojekt neve kötelező.", "PARTNER_PROJECT_NAME_INVALID", 400);
  }
  return name;
}

function projectHealth(status: PartnerProjectStatus, envs: PartnerProjectSummary["environments"]) {
  if (status === "closed") return "CLOSED" as const;
  if (status === "draft") return "DRAFT" as const;
  const values = Object.values(envs);
  if (values.some((value) => value === "degraded" || value === "offline")) return "DEGRADED" as const;
  if (values.some((value) => value === "online" || value === "ready")) return "READY" as const;
  return "PENDING" as const;
}

export async function listPartnerProjects() {
  const health = await getPartnerDevelopmentPlaneHealth();
  const runtimeIsolation = await getPartnerRuntimeIsolationStatus();
  if (!health.ready) {
    return { health, runtimeIsolation, projects: [] as PartnerProjectSummary[], checkedAt: health.checkedAt };
  }

  const db = getDatabaseClient();
  const partnerRows = await db
    .from("dev_center_partner_projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (partnerRows.error) databaseError("A partnerprojekt-registry betöltése sikertelen.", partnerRows.error);

  const rows = (partnerRows.data || []) as JsonRecord[];
  if (!rows.length) return { health, runtimeIsolation, projects: [] as PartnerProjectSummary[], checkedAt: new Date().toISOString() };

  const projectIds = rows.map((row) => text(row.project_id)).filter(Boolean);
  const workerIds = Array.from(new Set(rows.map((row) => text(row.default_worker_id)).filter(Boolean)));

  const [projectsResult, workersResult, repositoriesResult, environmentsResult, deliveryResult, auditResult] = await Promise.all([
    db.from("dev_center_projects").select("id,name,slug,metadata,updated_at").in("id", projectIds),
    db.from("dev_center_workers").select("id,code,name").in("id", workerIds),
    db.from("dev_center_repositories").select("id,project_id").in("project_id", projectIds),
    db.from("dev_center_partner_environments").select("project_id,environment_type,health_status,updated_at").in("project_id", projectIds),
    db.from("dev_center_partner_delivery_targets").select("project_id,target_type,status,updated_at").in("project_id", projectIds),
    db.from("dev_center_audit_events").select("project_id,created_at").in("project_id", projectIds).order("created_at", { ascending: false }).limit(500),
  ]);

  for (const result of [projectsResult, workersResult, repositoriesResult, environmentsResult, deliveryResult, auditResult]) {
    if (result.error) databaseError("A partnerprojekt összkép betöltése sikertelen.", result.error);
  }

  const projectById = new Map((projectsResult.data || []).map((row) => [String(row.id), row]));
  const workerById = new Map((workersResult.data || []).map((row) => [String(row.id), row]));
  const repoCount = new Map<string, number>();
  for (const row of repositoriesResult.data || []) {
    const projectId = String(row.project_id || "");
    repoCount.set(projectId, (repoCount.get(projectId) || 0) + 1);
  }

  const envByProject = new Map<string, PartnerProjectSummary["environments"]>();
  for (const projectId of projectIds) envByProject.set(projectId, { DEV: "NOT_BOUND", STAG: "NOT_BOUND", PROD: "NOT_BOUND" });
  for (const row of environmentsResult.data || []) {
    const projectId = String(row.project_id || "");
    const env = envByProject.get(projectId);
    if (!env) continue;
    const status = String(row.health_status || "unknown");
    if (row.environment_type === "PARTNER_DEV") env.DEV = status;
    if (row.environment_type === "PARTNER_STAG") env.STAG = status;
    if (row.environment_type === "PARTNER_PROD") env.PROD = status;
  }

  const deliveryByProject = new Map<string, string>();
  for (const row of deliveryResult.data || []) {
    const projectId = String(row.project_id || "");
    if (!deliveryByProject.has(projectId)) {
      deliveryByProject.set(projectId, `${String(row.target_type || "TARGET")}:${String(row.status || "draft")}`);
    }
  }

  const activityByProject = new Map<string, string>();
  for (const row of auditResult.data || []) {
    const projectId = String(row.project_id || "");
    if (projectId && !activityByProject.has(projectId)) activityByProject.set(projectId, String(row.created_at || ""));
  }

  const projects = rows.map((row): PartnerProjectSummary => {
    const projectId = text(row.project_id);
    const generic = projectById.get(projectId);
    const worker = workerById.get(text(row.default_worker_id));
    const environments = envByProject.get(projectId) || { DEV: "NOT_BOUND", STAG: "NOT_BOUND", PROD: "NOT_BOUND" };
    const status = text(row.status, "draft") as PartnerProjectStatus;
    return {
      projectId,
      projectCode: text(row.project_code),
      name: text(generic?.name),
      slug: text(generic?.slug),
      partnerOrgId: text(row.partner_org_id) || null,
      deliveryModel: text(row.delivery_model, "HANDOFF") as PartnerDeliveryModel,
      dataClassification: text(row.data_classification, "NORMAL") as PartnerDataClassification,
      status,
      internalEngineAccess: text(row.internal_engine_access, "NONE") as "NONE" | "ALLOWLIST",
      defaultWorkerId: text(row.default_worker_id),
      defaultWorkerCode: text(worker?.code, "OUTMINAI"),
      defaultWorkerName: text(worker?.name, "OutminAI"),
      repositoryCount: repoCount.get(projectId) || 0,
      environments,
      deliveryTargetStatus: deliveryByProject.get(projectId) || "NOT_CONFIGURED",
      lastActivityAt: activityByProject.get(projectId) || text(row.updated_at) || text(generic?.updated_at),
      health: projectHealth(status, environments),
      metadata: jsonRecord(row.metadata),
    };
  });

  return { health, runtimeIsolation, projects, checkedAt: new Date().toISOString() };
}

export async function getPartnerProjectById(projectId: string) {
  const normalized = text(projectId);
  if (!normalized) throw new PartnerDevelopmentError("A projectId kötelező.", "PARTNER_PROJECT_ID_REQUIRED", 400);
  const snapshot = await listPartnerProjects();
  if (!snapshot.health.ready) return { ...snapshot, project: null };
  return {
    health: snapshot.health,
    project: snapshot.projects.find((project) => project.projectId === normalized) || null,
    checkedAt: snapshot.checkedAt,
  };
}

export async function createPartnerProjectDraft(input: Record<string, unknown>) {
  const { db } = await requireReadyClient();
  const name = normalizeName(input.name);
  const slug = normalizeSlug(input.slug);
  const partnerOrgId = text(input.partnerOrgId) || null;
  const deliveryModel = normalizeDelivery(input.deliveryModel);
  const dataClassification = normalizeClassification(input.dataClassification);
  const creationKey = text(input.creationKey) || `${partnerOrgId || "partner"}:${slug}`;
  if (creationKey.length > 160) {
    throw new PartnerDevelopmentError("A creationKey túl hosszú.", "PARTNER_PROJECT_CREATION_KEY_INVALID", 400);
  }

  const { data, error } = await db.rpc("dev_center_create_partner_project_draft_atomic", {
    p_name: name,
    p_slug: slug,
    p_partner_org_id: partnerOrgId,
    p_delivery_model: deliveryModel,
    p_data_classification: dataClassification,
    p_default_worker_id: "worker_outminai",
    p_created_by: text(input.createdBy, "BenjAdmin"),
    p_creation_key: creationKey,
  });

  if (error) {
    const code = knownRpcCode(error);
    if (code) throw new PartnerDevelopmentError(error.message || code, code, rpcStatus(code));
    databaseError("A partnerprojekt draft létrehozása sikertelen.", error, 400);
  }

  const result = jsonRecord(data);
  const projectId = text(result.projectId);
  const project = projectId ? (await getPartnerProjectById(projectId)).project : null;
  return { result, project };
}
