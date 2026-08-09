import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DriveCoreRepositoryError } from "./errors";
import {
  DRIVE_CORE_BOOTSTRAP_ID,
  DRIVE_CORE_MIGRATION_COUNT,
  DRIVE_CORE_SCHEMA_VERSION,
  DRIVE_CORE_TABLES,
  getDriveCoreSchemaSelect,
} from "./schema";
import type {
  DriveChangeEvent,
  DriveDocument,
  DriveDocumentSource,
  DriveDocumentVersion,
  DriveFolder,
  DriveSyncCursor,
  DriveTree,
} from "./types";

type DbFolder = {
  id: string; project_id: string; parent_id: string | null; name: string; path: string;
  sort_order: number; status: DriveFolder["status"]; created_by: string; created_at: string; updated_at: string;
};
type DbDocument = {
  id: string; project_id: string; folder_id: string; name: string; extension: string; mime_type: string;
  description: string; status: DriveDocument["status"]; source: DriveDocumentSource; current_version_number: number;
  created_by: string; created_at: string; updated_at: string;
};
type DbVersion = {
  id: string; project_id: string; document_id: string; version_number: number; revision_code: string;
  original_name: string; mime_type: string; size_bytes: number | string; sha256: string | null;
  storage_provider: DriveDocumentVersion["storageProvider"]; storage_bucket: string | null; storage_key: string | null;
  status: DriveDocumentVersion["status"]; change_note: string; created_by: string; created_at: string;
};
type DbChange = {
  sequence: number | string; id: string; project_id: string; event_type: string;
  entity_type: DriveChangeEvent["entityType"]; entity_id: string; payload: Record<string, unknown> | null;
  actor_user_id: string; created_at: string;
};
type DbSyncCursor = {
  id: string; project_id: string; client_id: string; machine_name: string | null; cursor_value: number | string;
  last_sync_at: string; metadata: Record<string, unknown> | null; created_at: string; updated_at: string;
};

function getDatabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey || serviceKey.includes("<") || serviceKey.includes(">")) {
    throw new DriveCoreRepositoryError(
      "A DRIVE Core szerveroldali Supabase-kapcsolata nincs beállítva.",
      "DRIVE_CORE_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-drive-core/0.3.0" } },
  });
}

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const missingSchema = candidate?.code === "PGRST205" || candidate?.code === "42P01" || candidate?.code === "42883";
  throw new DriveCoreRepositoryError(
    missingSchema ? "A DRIVE Core PostgreSQL-sémája még nincs alkalmazva." : message,
    missingSchema ? "DRIVE_CORE_SCHEMA_NOT_READY" : candidate?.code || "DRIVE_CORE_DATABASE_ERROR",
    missingSchema ? 503 : status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}
function normalizeInteger(value: unknown, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}
function normalizeDocumentSource(value: unknown): DriveDocumentSource {
  return value === "DESKTOP" || value === "DROP" || value === "SYSTEM" ? value : "WEB";
}
function normalizeSha256(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : null;
}
function normalizeFileName(value: unknown) {
  return normalizeText(value).replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 240);
}
function extensionFromName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase().slice(0, 24) : "";
}
function mapFolder(row: DbFolder): DriveFolder {
  return {
    id: row.id, projectId: row.project_id, parentId: row.parent_id, name: row.name, path: row.path,
    sortOrder: Number(row.sort_order || 0), status: row.status, createdBy: row.created_by,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function mapVersion(row: DbVersion): DriveDocumentVersion {
  return {
    id: row.id, projectId: row.project_id, documentId: row.document_id,
    versionNumber: Number(row.version_number), revisionCode: row.revision_code || "",
    originalName: row.original_name, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes || 0),
    sha256: row.sha256, storageProvider: row.storage_provider, storageBucket: row.storage_bucket,
    storageKey: row.storage_key, status: row.status, changeNote: row.change_note || "",
    createdBy: row.created_by, createdAt: row.created_at,
  };
}
function mapDocument(row: DbDocument, version: DriveDocumentVersion | null): DriveDocument {
  return {
    id: row.id, projectId: row.project_id, folderId: row.folder_id, name: row.name,
    extension: row.extension || "", mimeType: row.mime_type, description: row.description || "",
    status: row.status, source: row.source, currentVersionNumber: Number(row.current_version_number || 0),
    createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at, currentVersion: version,
  };
}
function mapChange(row: DbChange): DriveChangeEvent {
  return {
    sequence: Number(row.sequence), id: row.id, projectId: row.project_id, eventType: row.event_type,
    entityType: row.entity_type, entityId: row.entity_id, payload: row.payload || {},
    actorUserId: row.actor_user_id, createdAt: row.created_at,
  };
}
function mapSyncCursor(row: DbSyncCursor): DriveSyncCursor {
  return {
    id: row.id, projectId: row.project_id, clientId: row.client_id, machineName: row.machine_name,
    cursorValue: Number(row.cursor_value || 0), lastSyncAt: row.last_sync_at, metadata: row.metadata || {},
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function getDriveCoreDatabaseHealth() {
  try {
    const client = getDatabaseClient();
    const checks = await Promise.all(DRIVE_CORE_TABLES.map(async (table) => {
      const { error } = await client.from(table).select(getDriveCoreSchemaSelect(table)).limit(0);
      return { table, ready: !error, errorCode: error?.code || null, errorMessage: error?.message || null };
    }));
    const { data: marker, error: markerError } = await client
      .from("drive_core_schema_meta")
      .select("schema_version,migration_count,bootstrap_id")
      .eq("component", "drive-core")
      .maybeSingle();
    const markerReady = !markerError
      && marker?.schema_version === DRIVE_CORE_SCHEMA_VERSION
      && Number(marker?.migration_count) === DRIVE_CORE_MIGRATION_COUNT
      && marker?.bootstrap_id === DRIVE_CORE_BOOTSTRAP_ID;
    return {
      configured: true,
      ready: checks.every((check) => check.ready) && markerReady,
      provider: "supabase" as const,
      expectedSchemaVersion: DRIVE_CORE_SCHEMA_VERSION,
      actualSchemaVersion: marker?.schema_version || null,
      migrationCount: marker?.migration_count == null ? null : Number(marker.migration_count),
      bootstrapId: marker?.bootstrap_id || null,
      tables: Object.fromEntries(checks.map((check) => [check.table, check.ready])),
      checks,
      errorCode: checks.find((check) => !check.ready)?.errorCode || markerError?.code || (markerReady ? null : "DRIVE_CORE_SCHEMA_VERSION_MISMATCH"),
    };
  } catch (error) {
    return {
      configured: !(error instanceof DriveCoreRepositoryError && error.code === "DRIVE_CORE_DATABASE_NOT_CONFIGURED"),
      ready: false,
      provider: "supabase" as const,
      expectedSchemaVersion: DRIVE_CORE_SCHEMA_VERSION,
      actualSchemaVersion: null,
      migrationCount: null,
      bootstrapId: null,
      tables: Object.fromEntries(DRIVE_CORE_TABLES.map((table) => [table, false])),
      checks: DRIVE_CORE_TABLES.map((table) => ({
        table, ready: false,
        errorCode: error instanceof DriveCoreRepositoryError ? error.code : "DRIVE_CORE_DATABASE_ERROR",
        errorMessage: null,
      })),
      errorCode: error instanceof DriveCoreRepositoryError ? error.code : "DRIVE_CORE_DATABASE_ERROR",
    };
  }
}

async function requireReadyClient() {
  const health = await getDriveCoreDatabaseHealth();
  if (!health.ready) {
    throw new DriveCoreRepositoryError(
      "A DRIVE Core PostgreSQL-sémája nem áll készen.",
      health.errorCode || "DRIVE_CORE_SCHEMA_NOT_READY",
      503,
      health,
    );
  }
  return getDatabaseClient();
}

export async function listDriveTree(projectId: string): Promise<DriveTree> {
  const client = await requireReadyClient();
  const [folderResult, documentResult, versionResult, cursorResult] = await Promise.all([
    client.from("drive_core_folders").select("*").eq("project_id", projectId).neq("status", "ARCHIVED").order("path"),
    client.from("drive_core_documents").select("*").eq("project_id", projectId).neq("status", "DELETED").order("updated_at", { ascending: false }),
    client.from("drive_core_document_versions").select("*").eq("project_id", projectId).order("version_number", { ascending: false }),
    client.from("drive_core_change_events").select("sequence").eq("project_id", projectId).order("sequence", { ascending: false }).limit(1),
  ]);
  if (folderResult.error) databaseError("A DRIVE mappák betöltése sikertelen.", folderResult.error);
  if (documentResult.error) databaseError("A DRIVE dokumentumok betöltése sikertelen.", documentResult.error);
  if (versionResult.error) databaseError("A dokumentumverziók betöltése sikertelen.", versionResult.error);
  if (cursorResult.error) databaseError("A DRIVE változáskurzor betöltése sikertelen.", cursorResult.error);

  const versions = (versionResult.data || []).map((row) => mapVersion(row as DbVersion));
  const versionByDocument = new Map<string, DriveDocumentVersion>();
  for (const version of versions) {
    if (!versionByDocument.has(version.documentId)) versionByDocument.set(version.documentId, version);
  }
  const documents = (documentResult.data || []).map((row) => {
    const document = row as DbDocument;
    return mapDocument(document, versionByDocument.get(document.id) || null);
  });
  return {
    projectId,
    folders: (folderResult.data || []).map((row) => mapFolder(row as DbFolder)),
    documents,
    summary: {
      folderCount: folderResult.data?.length || 0,
      documentCount: documents.length,
      versionCount: versions.length,
      metadataOnlyCount: versions.filter((version) => version.status === "METADATA_ONLY").length,
      totalSizeBytes: versions.reduce((total, version) => total + version.sizeBytes, 0),
      latestCursor: Number(cursorResult.data?.[0]?.sequence || 0),
    },
  };
}

export async function createDriveFolder(projectId: string, input: Record<string, unknown>, actorUserId: string) {
  const client = await requireReadyClient();
  const name = normalizeText(input.name).replace(/[\\/\u0000-\u001f]/g, " ").replace(/\s+/g, " ").slice(0, 120);
  if (!name) return { ok: false as const, error: "A mappa neve kötelező." };
  const folder = {
    id: normalizeText(input.id) || `drive-folder-${randomUUID().slice(0, 12)}`,
    parent_id: normalizeText(input.parentId) || null,
    name,
    sort_order: normalizeInteger(input.sortOrder, 100, 0, 999999),
    created_by: actorUserId,
  };
  const { data, error } = await client.rpc("drive_core_create_folder_atomic", {
    p_project_id: projectId,
    p_folder: folder,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    if (error.code === "23505") return { ok: false as const, error: "Ebben a mappában már létezik ilyen nevű mappa." };
    databaseError("A DRIVE mappa létrehozása sikertelen.", error);
  }
  return { ok: true as const, folder: mapFolder(data as DbFolder) };
}

export async function createDriveDocument(projectId: string, input: Record<string, unknown>, actorUserId: string) {
  const client = await requireReadyClient();
  const folderId = normalizeText(input.folderId);
  const name = normalizeFileName(input.name || input.originalName);
  if (!folderId) return { ok: false as const, error: "A célmappa kiválasztása kötelező." };
  if (!name) return { ok: false as const, error: "A dokumentum neve kötelező." };
  const now = new Date().toISOString();
  const documentId = normalizeText(input.id) || `drive-document-${randomUUID().slice(0, 12)}`;
  const versionId = `drive-version-${randomUUID().slice(0, 12)}`;
  const mimeType = normalizeText(input.mimeType, "application/octet-stream").slice(0, 160);
  const source = normalizeDocumentSource(input.source);
  const document = {
    id: documentId, folder_id: folderId, name, extension: extensionFromName(name), mime_type: mimeType,
    description: normalizeText(input.description).slice(0, 2000), source, created_by: actorUserId,
    created_at: now, updated_at: now,
  };
  const version = {
    id: versionId, version_number: 1, revision_code: normalizeText(input.revisionCode, "V1").slice(0, 40),
    original_name: normalizeFileName(input.originalName || name), mime_type: mimeType,
    size_bytes: normalizeInteger(input.sizeBytes, 0), sha256: normalizeSha256(input.sha256),
    storage_provider: "METADATA_ONLY", status: "METADATA_ONLY",
    change_note: normalizeText(input.changeNote, "Első dokumentumverzió – metaadat rekord.").slice(0, 1000),
    created_by: actorUserId, created_at: now,
  };
  const { data, error } = await client.rpc("drive_core_create_document_atomic", {
    p_project_id: projectId,
    p_document: document,
    p_version: version,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    if (error.code === "23505") return { ok: false as const, error: "Ebben a mappában már létezik ilyen nevű aktív dokumentum." };
    databaseError("A DRIVE dokumentum létrehozása sikertelen.", error);
  }
  const result = data as { document: DbDocument; version: DbVersion };
  const mappedVersion = mapVersion(result.version);
  return { ok: true as const, document: mapDocument(result.document, mappedVersion), version: mappedVersion };
}

export async function addDriveDocumentVersion(
  projectId: string,
  documentId: string,
  input: Record<string, unknown>,
  actorUserId: string,
) {
  const client = await requireReadyClient();
  const originalName = normalizeFileName(input.originalName || input.name);
  if (!originalName) return { ok: false as const, error: "Az új verzió eredeti fájlneve kötelező." };

  const expectedCurrentVersion = normalizeInteger(input.expectedCurrentVersion, 0);
  const { data: currentDocument, error: currentDocumentError } = await client
    .from("drive_core_documents")
    .select("id,current_version_number,status")
    .eq("project_id", projectId)
    .eq("id", documentId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (currentDocumentError) databaseError("A dokumentum aktuális verziójának ellenőrzése sikertelen.", currentDocumentError);
  if (!currentDocument) return { ok: false as const, error: "A dokumentum nem található." };
  if (expectedCurrentVersion > 0 && Number(currentDocument.current_version_number) !== expectedCurrentVersion) {
    return {
      ok: false as const,
      conflict: true as const,
      error: "A dokumentum közben újabb verziót kapott. Frissítsd a listát.",
    };
  }

  const version = {
    id: `drive-version-${randomUUID().slice(0, 12)}`,
    expected_current_version: expectedCurrentVersion,
    revision_code: normalizeText(input.revisionCode).slice(0, 40),
    original_name: originalName,
    mime_type: normalizeText(input.mimeType, "application/octet-stream").slice(0, 160),
    size_bytes: normalizeInteger(input.sizeBytes, 0),
    sha256: normalizeSha256(input.sha256),
    storage_provider: "METADATA_ONLY",
    status: "METADATA_ONLY",
    change_note: normalizeText(input.changeNote, "Új dokumentumverzió – metaadat rekord.").slice(0, 1000),
    created_by: actorUserId,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await client.rpc("drive_core_add_version_atomic", {
    p_project_id: projectId,
    p_document_id: documentId,
    p_version: version,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    const conflictMarker = [error.code, error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" ")
      .toUpperCase();
    if (error.code === "40001" || conflictMarker.includes("DRIVE_CORE_VERSION_CONFLICT")) {
      return {
        ok: false as const,
        conflict: true as const,
        error: "A dokumentum közben újabb verziót kapott. Frissítsd a listát.",
      };
    }
    databaseError("A dokumentumverzió létrehozása sikertelen.", error);
  }
  const result = data as { document: DbDocument; version: DbVersion };
  const mappedVersion = mapVersion(result.version);
  return { ok: true as const, document: mapDocument(result.document, mappedVersion), version: mappedVersion };
}

export async function listDriveChanges(projectId: string, cursor = 0, limit = 100) {
  const client = await requireReadyClient();
  const normalizedCursor = normalizeInteger(cursor, 0);
  const normalizedLimit = normalizeInteger(limit, 100, 1, 250);
  const { data, error } = await client
    .from("drive_core_change_events")
    .select("*")
    .eq("project_id", projectId)
    .gt("sequence", normalizedCursor)
    .order("sequence", { ascending: true })
    .limit(normalizedLimit);
  if (error) databaseError("A DRIVE változáslista betöltése sikertelen.", error);
  const changes = (data || []).map((row) => mapChange(row as DbChange));
  return {
    ok: true as const,
    projectId,
    cursor: normalizedCursor,
    nextCursor: changes.length ? changes[changes.length - 1].sequence : normalizedCursor,
    hasMore: changes.length === normalizedLimit,
    changes,
  };
}

export async function upsertDriveSyncCursor(projectId: string, input: Record<string, unknown>, actorUserId: string) {
  const client = await requireReadyClient();
  const clientId = normalizeText(input.clientId).slice(0, 160);
  if (!clientId) return { ok: false as const, error: "A desktop kliensazonosító kötelező." };
  const { data, error } = await client.rpc("drive_core_upsert_sync_cursor", {
    p_project_id: projectId,
    p_client_id: clientId,
    p_machine_name: normalizeText(input.machineName).slice(0, 160) || null,
    p_cursor_value: normalizeInteger(input.cursorValue, 0),
    p_metadata: typeof input.metadata === "object" && input.metadata !== null ? input.metadata : {},
    p_actor_user_id: actorUserId,
  });
  if (error) databaseError("A DRIVE szinkronkurzor mentése sikertelen.", error);
  return { ok: true as const, cursor: mapSyncCursor(data as DbSyncCursor) };
}

export async function bootstrapDriveProject(projectId: string, actorUserId: string) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("drive_core_bootstrap_project", {
    p_project_id: projectId,
    p_actor_user_id: actorUserId,
  });
  if (error) databaseError("A DRIVE alapmappák létrehozása sikertelen.", error);
  return data as { projectId: string; folders: number; alreadyBootstrapped: boolean };
}
