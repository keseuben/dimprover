import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DriveCoreRepositoryError } from "./errors";
import {
  DRIVE_QUARANTINE_REVIEW_BOOTSTRAP_ID,
  DRIVE_QUARANTINE_REVIEW_COMPONENT,
  DRIVE_QUARANTINE_REVIEW_MIGRATION_COUNT,
  DRIVE_QUARANTINE_REVIEW_SCHEMA_VERSION,
  DRIVE_QUARANTINE_REVIEW_TABLES,
} from "./reviewSchema";
import type { DriveObjectCleanupTask, DriveReviewAction } from "./types";

type DbCleanupTask = {
  id: string;
  project_id: string;
  version_id: string;
  storage_provider: "S3";
  storage_bucket: string;
  storage_key: string;
  reason: string;
  status: DriveObjectCleanupTask["status"];
  attempts: number;
  last_error: string | null;
  requested_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new DriveCoreRepositoryError(
      "A DRIVE karanténellenőrzés szerveroldali adatbázis-kapcsolata nincs beállítva.",
      "DRIVE_REVIEW_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "dimpro-drive-quarantine-review/0.4.1" } },
  });
}

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const marker = [candidate?.code, candidate?.message, candidate?.details, candidate?.hint]
    .filter(Boolean).join(" ").toUpperCase();
  if (candidate?.code === "PGRST205" || candidate?.code === "42P01" || candidate?.code === "42883") {
    throw new DriveCoreRepositoryError(
      "A DRIVE karanténellenőrzés 0.4.1 PostgreSQL-sémája még nincs alkalmazva.",
      "DRIVE_REVIEW_SCHEMA_NOT_READY",
      503,
    );
  }
  if (marker.includes("DRIVE_REVIEW_NOT_QUARANTINED")) {
    throw new DriveCoreRepositoryError("Csak karanténban lévő dokumentumverzió bírálható el.", "DRIVE_REVIEW_NOT_QUARANTINED", 409);
  }
  if (marker.includes("DRIVE_REVIEW_VERSION_NOT_FOUND")) {
    throw new DriveCoreRepositoryError("A bírálatra kijelölt dokumentumverzió nem található.", "DRIVE_REVIEW_VERSION_NOT_FOUND", 404);
  }
  if (marker.includes("DRIVE_REVIEW_ACTION_INVALID")) {
    throw new DriveCoreRepositoryError("Érvénytelen karanténdöntés.", "DRIVE_REVIEW_ACTION_INVALID", 400);
  }
  throw new DriveCoreRepositoryError(
    message,
    candidate?.code || "DRIVE_REVIEW_DATABASE_ERROR",
    status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

function mapCleanupTask(row: DbCleanupTask): DriveObjectCleanupTask {
  return {
    id: row.id,
    projectId: row.project_id,
    versionId: row.version_id,
    storageProvider: row.storage_provider,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    reason: row.reason,
    status: row.status,
    attempts: Number(row.attempts || 0),
    lastError: row.last_error,
    requestedBy: row.requested_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export async function getDriveQuarantineReviewDatabaseHealth(projectId?: string) {
  try {
    const client = getClient();
    const checks = await Promise.all(DRIVE_QUARANTINE_REVIEW_TABLES.map(async (table) => {
      const { error } = await client.from(table).select("id,project_id,version_id,status,attempts").limit(0);
      return { table, ready: !error, errorCode: error?.code || null, errorMessage: error?.message || null };
    }));
    const { data: marker, error: markerError } = await client
      .from("drive_storage_schema_meta")
      .select("schema_version,migration_count,bootstrap_id")
      .eq("component", DRIVE_QUARANTINE_REVIEW_COMPONENT)
      .maybeSingle();
    const markerReady = !markerError
      && marker?.schema_version === DRIVE_QUARANTINE_REVIEW_SCHEMA_VERSION
      && Number(marker?.migration_count) === DRIVE_QUARANTINE_REVIEW_MIGRATION_COUNT
      && marker?.bootstrap_id === DRIVE_QUARANTINE_REVIEW_BOOTSTRAP_ID;
    let pendingCleanupCount: number | null = null;
    if (projectId && checks.every((check) => check.ready)) {
      const pending = await client.from("drive_core_object_cleanup_tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .in("status", ["PENDING", "FAILED"]);
      if (!pending.error) pendingCleanupCount = pending.count || 0;
    }
    return {
      configured: true,
      ready: checks.every((check) => check.ready) && markerReady,
      expectedSchemaVersion: DRIVE_QUARANTINE_REVIEW_SCHEMA_VERSION,
      actualSchemaVersion: marker?.schema_version || null,
      migrationCount: marker?.migration_count == null ? null : Number(marker.migration_count),
      bootstrapId: marker?.bootstrap_id || null,
      tables: Object.fromEntries(checks.map((check) => [check.table, check.ready])),
      checks,
      pendingCleanupCount,
      errorCode: checks.find((check) => !check.ready)?.errorCode
        || markerError?.code
        || (markerReady ? null : "DRIVE_REVIEW_SCHEMA_VERSION_MISMATCH"),
    };
  } catch (error) {
    return {
      configured: !(error instanceof DriveCoreRepositoryError && error.code === "DRIVE_REVIEW_DATABASE_NOT_CONFIGURED"),
      ready: false,
      expectedSchemaVersion: DRIVE_QUARANTINE_REVIEW_SCHEMA_VERSION,
      actualSchemaVersion: null,
      migrationCount: null,
      bootstrapId: null,
      tables: Object.fromEntries(DRIVE_QUARANTINE_REVIEW_TABLES.map((table) => [table, false])),
      checks: DRIVE_QUARANTINE_REVIEW_TABLES.map((table) => ({ table, ready: false, errorCode: error instanceof DriveCoreRepositoryError ? error.code : "DRIVE_REVIEW_DATABASE_ERROR", errorMessage: null })),
      pendingCleanupCount: null,
      errorCode: error instanceof DriveCoreRepositoryError ? error.code : "DRIVE_REVIEW_DATABASE_ERROR",
    };
  }
}

async function requireReadyClient() {
  const health = await getDriveQuarantineReviewDatabaseHealth();
  if (!health.ready) {
    throw new DriveCoreRepositoryError(
      "A DRIVE karanténellenőrzés 0.4.1 adatbázissémája nem áll készen.",
      "DRIVE_REVIEW_SCHEMA_NOT_READY",
      503,
      health,
    );
  }
  return getClient();
}

export async function reviewDriveQuarantinedVersionRecord(input: {
  projectId: string;
  documentId: string;
  versionId: string;
  action: DriveReviewAction;
  note: string;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("drive_core_review_quarantined_version_atomic", {
    p_project_id: input.projectId,
    p_document_id: input.documentId,
    p_version_id: input.versionId,
    p_action: input.action,
    p_note: input.note,
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DRIVE karanténdöntés rögzítése sikertelen.", error);
  const result = data as { action: DriveReviewAction; idempotent: boolean; version: Record<string, unknown>; cleanupTask: DbCleanupTask | null };
  return {
    action: result.action,
    idempotent: Boolean(result.idempotent),
    version: result.version,
    cleanupTask: result.cleanupTask ? mapCleanupTask(result.cleanupTask) : null,
  };
}

export async function listDriveCleanupTasks(projectId: string, limit = 20) {
  const client = await requireReadyClient();
  const { data, error } = await client.from("drive_core_object_cleanup_tasks")
    .select("*")
    .eq("project_id", projectId)
    .in("status", ["PENDING", "FAILED"])
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(100, Math.floor(limit))));
  if (error) databaseError("A DRIVE takarítási feladatok betöltése sikertelen.", error);
  return (data || []).map((row) => mapCleanupTask(row as DbCleanupTask));
}

export async function completeDriveCleanupTaskRecord(input: {
  projectId: string;
  taskId: string;
  success: boolean;
  errorMessage?: string | null;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("drive_core_complete_cleanup_task", {
    p_project_id: input.projectId,
    p_task_id: input.taskId,
    p_success: input.success,
    p_error: input.errorMessage || "",
    p_actor_user_id: input.actorUserId,
  });
  if (error) databaseError("A DRIVE takarítási feladat lezárása sikertelen.", error);
  return mapCleanupTask(data as DbCleanupTask);
}
