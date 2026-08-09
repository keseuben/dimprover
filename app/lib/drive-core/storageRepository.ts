import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DriveCoreRepositoryError } from "./errors";
import {
  DRIVE_OBJECT_STORAGE_BOOTSTRAP_ID,
  DRIVE_OBJECT_STORAGE_MIGRATION_COUNT,
  DRIVE_OBJECT_STORAGE_SCHEMA_VERSION,
  DRIVE_OBJECT_STORAGE_TABLES,
  getDriveObjectStorageSchemaSelect,
} from "./storageSchema";
import type { DriveUploadSession } from "./types";

type DbUploadSession = {
  id: string;
  project_id: string;
  folder_id: string | null;
  document_id: string | null;
  upload_kind: DriveUploadSession["uploadKind"];
  document_name: string;
  original_name: string;
  mime_type: string;
  size_bytes: number | string;
  sha256: string | null;
  expected_current_version: number;
  source: DriveUploadSession["source"];
  client_id: string | null;
  storage_provider: "S3";
  storage_bucket: string;
  storage_key: string;
  final_version_status: DriveUploadSession["finalVersionStatus"];
  status: DriveUploadSession["status"];
  expires_at: string;
  finalized_document_id: string | null;
  finalized_version_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
};

type DbDownloadVersion = {
  id: string;
  project_id: string;
  document_id: string;
  version_number: number;
  original_name: string;
  mime_type: string;
  size_bytes: number | string;
  storage_provider: string;
  storage_bucket: string | null;
  storage_key: string | null;
  status: string;
};

function getDatabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey || serviceKey.includes("<") || serviceKey.includes(">")) {
    throw new DriveCoreRepositoryError(
      "A DRIVE Object Storage szerveroldali Supabase-kapcsolata nincs beállítva.",
      "DRIVE_OBJECT_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-drive-object-storage/0.4.0" } },
  });
}

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const missingSchema = candidate?.code === "PGRST205" || candidate?.code === "42P01" || candidate?.code === "42883";
  throw new DriveCoreRepositoryError(
    missingSchema ? "A DRIVE Object Storage PostgreSQL-sémája még nincs alkalmazva." : message,
    missingSchema ? "DRIVE_OBJECT_SCHEMA_NOT_READY" : candidate?.code || "DRIVE_OBJECT_DATABASE_ERROR",
    missingSchema ? 503 : status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

function mapUploadSession(row: DbUploadSession): DriveUploadSession {
  return {
    id: row.id,
    projectId: row.project_id,
    folderId: row.folder_id,
    documentId: row.document_id,
    uploadKind: row.upload_kind,
    documentName: row.document_name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    sha256: row.sha256,
    expectedCurrentVersion: Number(row.expected_current_version || 0),
    source: row.source,
    clientId: row.client_id,
    storageProvider: row.storage_provider,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    finalVersionStatus: row.final_version_status,
    status: row.status,
    expiresAt: row.expires_at,
    finalizedDocumentId: row.finalized_document_id,
    finalizedVersionId: row.finalized_version_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    metadata: row.metadata || {},
  };
}

export async function getDriveObjectStorageDatabaseHealth() {
  try {
    const client = getDatabaseClient();
    const checks = await Promise.all(DRIVE_OBJECT_STORAGE_TABLES.map(async (table) => {
      const { error } = await client.from(table).select(getDriveObjectStorageSchemaSelect(table)).limit(0);
      return { table, ready: !error, errorCode: error?.code || null, errorMessage: error?.message || null };
    }));
    const { data: marker, error: markerError } = await client
      .from("drive_storage_schema_meta")
      .select("schema_version,migration_count,bootstrap_id")
      .eq("component", "drive-object-storage")
      .maybeSingle();
    const markerReady = !markerError
      && marker?.schema_version === DRIVE_OBJECT_STORAGE_SCHEMA_VERSION
      && Number(marker?.migration_count) === DRIVE_OBJECT_STORAGE_MIGRATION_COUNT
      && marker?.bootstrap_id === DRIVE_OBJECT_STORAGE_BOOTSTRAP_ID;
    return {
      configured: true,
      ready: checks.every((check) => check.ready) && markerReady,
      provider: "supabase" as const,
      expectedSchemaVersion: DRIVE_OBJECT_STORAGE_SCHEMA_VERSION,
      actualSchemaVersion: marker?.schema_version || null,
      migrationCount: marker?.migration_count == null ? null : Number(marker.migration_count),
      bootstrapId: marker?.bootstrap_id || null,
      tables: Object.fromEntries(checks.map((check) => [check.table, check.ready])),
      checks,
      errorCode: checks.find((check) => !check.ready)?.errorCode
        || markerError?.code
        || (markerReady ? null : "DRIVE_OBJECT_SCHEMA_VERSION_MISMATCH"),
    };
  } catch (error) {
    return {
      configured: !(error instanceof DriveCoreRepositoryError && error.code === "DRIVE_OBJECT_DATABASE_NOT_CONFIGURED"),
      ready: false,
      provider: "supabase" as const,
      expectedSchemaVersion: DRIVE_OBJECT_STORAGE_SCHEMA_VERSION,
      actualSchemaVersion: null,
      migrationCount: null,
      bootstrapId: null,
      tables: Object.fromEntries(DRIVE_OBJECT_STORAGE_TABLES.map((table) => [table, false])),
      checks: DRIVE_OBJECT_STORAGE_TABLES.map((table) => ({
        table,
        ready: false,
        errorCode: error instanceof DriveCoreRepositoryError ? error.code : "DRIVE_OBJECT_DATABASE_ERROR",
        errorMessage: null,
      })),
      errorCode: error instanceof DriveCoreRepositoryError ? error.code : "DRIVE_OBJECT_DATABASE_ERROR",
    };
  }
}

async function requireReadyClient() {
  const health = await getDriveObjectStorageDatabaseHealth();
  if (!health.ready) {
    throw new DriveCoreRepositoryError(
      "A DRIVE Object Storage PostgreSQL-sémája nem áll készen.",
      health.errorCode || "DRIVE_OBJECT_SCHEMA_NOT_READY",
      503,
      health,
    );
  }
  return getDatabaseClient();
}

export async function createDriveUploadSessionRecord(input: DriveUploadSession, actorUserId: string) {
  const client = await requireReadyClient();
  const session = {
    id: input.id,
    folder_id: input.folderId,
    document_id: input.documentId,
    upload_kind: input.uploadKind,
    document_name: input.documentName,
    original_name: input.originalName,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    sha256: input.sha256,
    expected_current_version: input.expectedCurrentVersion,
    source: input.source,
    client_id: input.clientId,
    storage_provider: input.storageProvider,
    storage_bucket: input.storageBucket,
    storage_key: input.storageKey,
    final_version_status: input.finalVersionStatus,
    status: input.status,
    expires_at: input.expiresAt,
    created_by: actorUserId,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
    metadata: input.metadata,
  };
  const { data, error } = await client.rpc("drive_core_create_upload_session_atomic", {
    p_project_id: input.projectId,
    p_session: session,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    if (error.code === "23505") {
      throw new DriveCoreRepositoryError("Ehhez a célhoz már létezik aktív feltöltési munkamenet.", "DRIVE_UPLOAD_SESSION_CONFLICT", 409);
    }
    databaseError("A DRIVE feltöltési munkamenet létrehozása sikertelen.", error);
  }
  return mapUploadSession(data as DbUploadSession);
}


export async function findDriveUploadSessionByArchiveKey(input: { projectId: string; archiveKey: string }) {
  const client = await requireReadyClient();
  const { data, error } = await client
    .from("drive_core_upload_sessions")
    .select("*")
    .eq("project_id", input.projectId)
    .contains("metadata", { dropArchiveKey: input.archiveKey })
    .in("status", ["INITIATED", "FINALIZED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) databaseError("A DROP → DRIVE archiválási munkamenet nem tölthető be.", error);
  return data ? mapUploadSession(data as DbUploadSession) : null;
}

export async function getDriveUploadSessionRecord(projectId: string, uploadId: string) {
  const client = await requireReadyClient();
  const { data, error } = await client
    .from("drive_core_upload_sessions")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", uploadId)
    .maybeSingle();
  if (error) databaseError("A DRIVE feltöltési munkamenet betöltése sikertelen.", error);
  return data ? mapUploadSession(data as DbUploadSession) : null;
}

export async function finalizeDriveUploadSessionRecord(input: {
  projectId: string;
  uploadId: string;
  receivedSizeBytes: number;
  storageEtag: string | null;
  verifiedSha256: string;
  actorUserId: string;
}) {
  const client = await requireReadyClient();
  const verifiedSha256 = input.verifiedSha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(verifiedSha256)) {
    throw new DriveCoreRepositoryError(
      "A DRIVE feltöltés csak érvényes szerveroldali SHA-256 ellenőrzés után véglegesíthető.",
      "DRIVE_UPLOAD_CHECKSUM_REQUIRED",
      409,
    );
  }

  const { data: currentSession, error: currentSessionError } = await client
    .from("drive_core_upload_sessions")
    .select("id,status,sha256,metadata")
    .eq("project_id", input.projectId)
    .eq("id", input.uploadId)
    .maybeSingle();
  if (currentSessionError) databaseError("A DRIVE feltöltés checksum előellenőrzése sikertelen.", currentSessionError);
  if (!currentSession) {
    throw new DriveCoreRepositoryError("A feltöltési munkamenet nem található.", "DRIVE_UPLOAD_NOT_FOUND", 404);
  }
  if (currentSession.sha256 && String(currentSession.sha256).toLowerCase() !== verifiedSha256) {
    throw new DriveCoreRepositoryError(
      "A feltöltött fájl SHA-256 lenyomata eltér az előre megadott ellenőrző összegtől.",
      "DRIVE_UPLOAD_CHECKSUM_MISMATCH",
      409,
      { expectedSha256: String(currentSession.sha256).toLowerCase(), receivedSha256: verifiedSha256 },
    );
  }
  if (currentSession.status !== "INITIATED" && currentSession.status !== "FINALIZED") {
    throw new DriveCoreRepositoryError(
      "A feltöltési munkamenet már nem véglegesíthető.",
      "DRIVE_UPLOAD_INVALID_STATE",
      409,
    );
  }

  if (currentSession.status === "INITIATED") {
    const checksumMetadata = {
      ...(currentSession.metadata && typeof currentSession.metadata === "object" ? currentSession.metadata : {}),
      checksumAlgorithm: "SHA-256",
      checksumVerified: true,
      checksumVerifiedAt: new Date().toISOString(),
      serverSha256: verifiedSha256,
    };
    const { error: checksumUpdateError } = await client
      .from("drive_core_upload_sessions")
      .update({ sha256: verifiedSha256, metadata: checksumMetadata, updated_at: new Date().toISOString() })
      .eq("project_id", input.projectId)
      .eq("id", input.uploadId)
      .eq("status", "INITIATED");
    if (checksumUpdateError) databaseError("A DRIVE checksum eredménye nem menthető.", checksumUpdateError);
  }

  const { data, error } = await client.rpc("drive_core_finalize_upload_atomic", {
    p_project_id: input.projectId,
    p_upload_id: input.uploadId,
    p_received_size_bytes: input.receivedSizeBytes,
    p_storage_etag: input.storageEtag,
    p_actor_user_id: input.actorUserId,
  });
  if (error) {
    const marker = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toUpperCase();
    if (marker.includes("DRIVE_CORE_VERSION_CONFLICT")) {
      throw new DriveCoreRepositoryError(
        "A dokumentum közben újabb verziót kapott. A feltöltés nem véglegesíthető.",
        "DRIVE_CORE_VERSION_CONFLICT",
        409,
      );
    }
    if (marker.includes("DRIVE_UPLOAD_EXPIRED")) {
      throw new DriveCoreRepositoryError("A feltöltési munkamenet lejárt.", "DRIVE_UPLOAD_EXPIRED", 410);
    }
    if (marker.includes("DRIVE_UPLOAD_SIZE_MISMATCH")) {
      throw new DriveCoreRepositoryError("A feltöltött objektum mérete nem egyezik az előkészített fájlmérettel.", "DRIVE_UPLOAD_SIZE_MISMATCH", 409);
    }
    databaseError("A DRIVE feltöltés véglegesítése sikertelen.", error);
  }
  const result = data as { session: DbUploadSession; document: Record<string, unknown>; version: Record<string, unknown> };

  const finalizedMetadata = {
    ...(result.session.metadata || {}),
    checksumAlgorithm: "SHA-256",
    checksumVerified: true,
    checksumVerifiedAt: new Date().toISOString(),
    serverSha256: verifiedSha256,
  };
  const { data: finalizedSession, error: finalizedSessionError } = await client
    .from("drive_core_upload_sessions")
    .update({ sha256: verifiedSha256, metadata: finalizedMetadata, updated_at: new Date().toISOString() })
    .eq("project_id", input.projectId)
    .eq("id", input.uploadId)
    .select("*")
    .single();
  if (finalizedSessionError) databaseError("A DRIVE checksum auditállapotának mentése sikertelen.", finalizedSessionError);

  const { data: auditRows, error: auditReadError } = await client
    .from("project_core_audit_events")
    .select("id,metadata")
    .eq("project_id", input.projectId)
    .contains("metadata", { uploadId: input.uploadId })
    .order("created_at", { ascending: false })
    .limit(1);
  if (auditReadError) databaseError("A DRIVE checksum auditbejegyzése nem tölthető be.", auditReadError);
  const auditRow = auditRows?.[0] as { id: string; metadata: Record<string, unknown> | null } | undefined;
  if (auditRow) {
    const { error: auditUpdateError } = await client
      .from("project_core_audit_events")
      .update({
        metadata: {
          ...(auditRow.metadata || {}),
          checksumAlgorithm: "SHA-256",
          checksumVerified: true,
          sha256: verifiedSha256,
        },
      })
      .eq("id", auditRow.id)
      .eq("project_id", input.projectId);
    if (auditUpdateError) databaseError("A DRIVE checksum auditbejegyzése nem frissíthető.", auditUpdateError);
  }

  return {
    session: mapUploadSession((finalizedSession || result.session) as DbUploadSession),
    document: result.document,
    version: result.version,
  };
}

export async function abortDriveUploadSessionRecord(input: {
  projectId: string;
  uploadId: string;
  actorUserId: string;
  reason?: string;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("drive_core_abort_upload_session", {
    p_project_id: input.projectId,
    p_upload_id: input.uploadId,
    p_actor_user_id: input.actorUserId,
    p_reason: input.reason || "Felhasználói megszakítás.",
  });
  if (error) databaseError("A DRIVE feltöltési munkamenet megszakítása sikertelen.", error);
  return mapUploadSession(data as DbUploadSession);
}


export async function markDriveDocumentAsDropArchive(input: {
  projectId: string;
  documentId: string;
  actorUserId: string;
  dropPackageId: string;
  dropSourceType: "file" | "report";
  dropSourceId: string;
  folderId: string;
}) {
  const client = await requireReadyClient();
  const { data: current, error: currentError } = await client
    .from("drive_core_documents")
    .select("id,name,source,folder_id")
    .eq("project_id", input.projectId)
    .eq("id", input.documentId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (currentError) databaseError("A DROP archívumdokumentum nem tölthető be.", currentError);
  if (!current) throw new DriveCoreRepositoryError("A véglegesített DRIVE dokumentum nem található.", "DRIVE_DROP_ARCHIVE_DOCUMENT_NOT_FOUND", 404);
  if (current.source === "DROP" && current.folder_id === input.folderId) {
    return { document: current, idempotent: true, moved: false };
  }

  const previousFolderId = String(current.folder_id || "");
  const now = new Date().toISOString();
  const { data: document, error: updateError } = await client
    .from("drive_core_documents")
    .update({ source: "DROP", folder_id: input.folderId, updated_at: now })
    .eq("project_id", input.projectId)
    .eq("id", input.documentId)
    .select("id,name,source,folder_id")
    .single();
  if (updateError || !document) databaseError("A DRIVE dokumentum DROP archívummá minősítése sikertelen.", updateError);

  const { error: sessionUpdateError } = await client
    .from("drive_core_upload_sessions")
    .update({ folder_id: input.folderId, updated_at: now })
    .eq("project_id", input.projectId)
    .eq("finalized_document_id", input.documentId);
  if (sessionUpdateError) databaseError("A DROP archívum feltöltési munkamenetének célmappája nem frissíthető.", sessionUpdateError);

  const moved = previousFolderId !== input.folderId;
  const eventType = current.source === "DROP" ? "DROP_ARCHIVE_DOCUMENT_MOVED" : "DROP_ARCHIVE_DOCUMENT_CREATED";
  const auditId = `project-audit-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const changeId = `drive-change-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const metadata = {
    dropPackageId: input.dropPackageId,
    dropSourceType: input.dropSourceType,
    dropSourceId: input.dropSourceId,
    previousFolderId: previousFolderId || null,
    folderId: input.folderId,
    moved,
  };
  const [auditResult, changeResult] = await Promise.all([
    client.from("project_core_audit_events").insert({
      id: auditId,
      project_id: input.projectId,
      actor_user_id: input.actorUserId,
      event_type: eventType,
      entity_type: "document",
      entity_id: input.documentId,
      summary: moved
        ? `DROP archívumdokumentum mappába rendezve: ${document.name}`
        : `DROP archívumdokumentum létrehozva: ${document.name}`,
      metadata,
    }),
    client.from("drive_core_change_events").insert({
      id: changeId,
      project_id: input.projectId,
      event_type: eventType,
      entity_type: "document",
      entity_id: input.documentId,
      payload: { ...metadata, source: "DROP" },
      actor_user_id: input.actorUserId,
    }),
  ]);
  if (auditResult.error) databaseError("A DROP archívumdokumentum projekt-auditja nem menthető.", auditResult.error);
  if (changeResult.error) databaseError("A DROP archívumdokumentum Drive-változása nem menthető.", changeResult.error);
  return { document, idempotent: false, moved };
}

export async function getDriveDownloadVersionRecord(input: {
  projectId: string;
  documentId: string;
  versionId?: string | null;
}) {
  const client = await requireReadyClient();
  const documentResult = await client
    .from("drive_core_documents")
    .select("id,name,status,current_version_number,source")
    .eq("project_id", input.projectId)
    .eq("id", input.documentId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (documentResult.error) databaseError("A DRIVE dokumentum betöltése sikertelen.", documentResult.error);
  if (!documentResult.data) return null;

  let query = client
    .from("drive_core_document_versions")
    .select("id,project_id,document_id,version_number,original_name,mime_type,size_bytes,storage_provider,storage_bucket,storage_key,status")
    .eq("project_id", input.projectId)
    .eq("document_id", input.documentId);
  if (input.versionId) query = query.eq("id", input.versionId);
  else query = query.eq("version_number", documentResult.data.current_version_number);
  const versionResult = await query.maybeSingle();
  if (versionResult.error) databaseError("A DRIVE dokumentumverzió betöltése sikertelen.", versionResult.error);
  if (!versionResult.data) return null;
  const version = versionResult.data as DbDownloadVersion;
  return {
    documentName: documentResult.data.name as string,
    documentSource: String(documentResult.data.source || "WEB"),
    version: {
      id: version.id,
      projectId: version.project_id,
      documentId: version.document_id,
      versionNumber: Number(version.version_number),
      originalName: version.original_name,
      mimeType: version.mime_type,
      sizeBytes: Number(version.size_bytes || 0),
      storageProvider: version.storage_provider,
      storageBucket: version.storage_bucket,
      storageKey: version.storage_key,
      status: version.status,
    },
  };
}

export async function logDriveDownloadRecord(input: {
  projectId: string;
  documentId: string;
  versionId: string;
  actorUserId: string;
  clientId?: string | null;
}) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("drive_core_log_download", {
    p_project_id: input.projectId,
    p_document_id: input.documentId,
    p_version_id: input.versionId,
    p_actor_user_id: input.actorUserId,
    p_client_id: input.clientId || null,
  });
  if (error) databaseError("A DRIVE letöltési auditnapló rögzítése sikertelen.", error);
  return data as Record<string, unknown>;
}
