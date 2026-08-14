import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DriveCoreRepositoryError } from "./errors";
import {
  DRIVE_WORKSPACE_BOOTSTRAP_ID,
  DRIVE_WORKSPACE_MIGRATION_COUNT,
  DRIVE_WORKSPACE_SCHEMA_VERSION,
  DRIVE_WORKSPACE_TABLES,
  getDriveWorkspaceSchemaSelect,
} from "./workspaceSchema";

export type DriveEngineeringMetadata = {
  id: string;
  projectId: string;
  documentId: string;
  planNo: string;
  discipline: string;
  documentType: string;
  revision: string;
  issueStatus: string;
  approvalStatus: string;
  building: string;
  level: string;
  zone: string;
  extra: Record<string, unknown>;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DriveFileNote = {
  id: string;
  projectId: string;
  documentId: string;
  versionId: string | null;
  note: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DriveQrCode = {
  id: string;
  projectId: string;
  documentId: string;
  versionId: string | null;
  publicKey: string;
  status: "ACTIVE" | "REVOKED";
  createdBy: string;
  createdAt: string;
  revokedBy: string | null;
  revokedAt: string | null;
};

export type DriveBoxPurpose = "GENERAL" | "DROP" | "COMPARE" | "AI_ANALYSIS" | "ISSUE" | "MEETING";

export type DriveBoxItem = {
  id: string;
  projectId: string;
  boxId: string;
  documentId: string;
  versionId: string | null;
  sortOrder: number;
  addedBy: string;
  addedAt: string;
};

export type DriveBox = {
  id: string;
  projectId: string;
  name: string;
  purpose: DriveBoxPurpose;
  colorToken: string;
  iconKey: string;
  note: string;
  sortOrder: number;
  status: "ACTIVE" | "ARCHIVED";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: DriveBoxItem[];
};

type DbMetadata = {
  id: string;
  project_id: string;
  document_id: string;
  plan_no: string;
  discipline: string;
  document_type: string;
  revision: string;
  issue_status: string;
  approval_status: string;
  building: string;
  level: string;
  zone: string;
  extra: Record<string, unknown> | null;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

type DbNote = {
  id: string;
  project_id: string;
  document_id: string;
  version_id: string | null;
  note: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

type DbQr = {
  id: string;
  project_id: string;
  document_id: string;
  version_id: string | null;
  public_key: string;
  status: "ACTIVE" | "REVOKED";
  created_by: string;
  created_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
};

type DbBox = {
  id: string;
  project_id: string;
  name: string;
  purpose: DriveBoxPurpose;
  color_token: string;
  icon_key: string;
  note: string;
  sort_order: number | string;
  status: "ACTIVE" | "ARCHIVED";
  created_by: string;
  created_at: string;
  updated_at: string;
};

type DbBoxItem = {
  id: string;
  project_id: string;
  box_id: string;
  document_id: string;
  version_id: string | null;
  sort_order: number | string;
  added_by: string;
  added_at: string;
};

type DbVersion = {
  id: string;
  project_id: string;
  document_id: string;
  version_number: number | string;
  revision_code: string;
  original_name: string;
  mime_type: string;
  size_bytes: number | string;
  sha256: string | null;
  storage_provider: string;
  storage_bucket: string | null;
  storage_key: string | null;
  status: string;
  change_note: string;
  created_by: string;
  created_at: string;
};

type DbDocument = {
  id: string;
  project_id: string;
  folder_id: string;
  name: string;
  extension: string;
  mime_type: string;
  description: string;
  status: string;
  source: string;
  current_version_number: number | string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function getDatabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey || serviceKey.includes("<") || serviceKey.includes(">")) {
    throw new DriveCoreRepositoryError(
      "A DRIVE Workspace szerveroldali Supabase-kapcsolata nincs beállítva.",
      "DRIVE_WORKSPACE_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-drive-workspace/1.0.0" } },
  });
}

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const missingSchema = candidate?.code === "PGRST205" || candidate?.code === "42P01" || candidate?.code === "42883";
  const marker = [candidate?.message, candidate?.details, candidate?.hint].filter(Boolean).join(" ").toUpperCase();
  const notFound = marker.includes("DRIVE_DOCUMENT_NOT_FOUND") || marker.includes("DRIVE_VERSION_NOT_FOUND");
  throw new DriveCoreRepositoryError(
    missingSchema
      ? "A DRIVE Workspace 1.0.0 PostgreSQL-sémája még nincs alkalmazva."
      : notFound
        ? "A kért DRIVE dokumentum vagy verzió nem található a projektben."
        : message,
    missingSchema ? "DRIVE_WORKSPACE_SCHEMA_NOT_READY" : notFound ? "DRIVE_WORKSPACE_ENTITY_NOT_FOUND" : candidate?.code || "DRIVE_WORKSPACE_DATABASE_ERROR",
    missingSchema ? 503 : notFound ? 404 : status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

function mapMetadata(row: DbMetadata): DriveEngineeringMetadata {
  return {
    id: row.id,
    projectId: row.project_id,
    documentId: row.document_id,
    planNo: row.plan_no || "",
    discipline: row.discipline || "",
    documentType: row.document_type || "",
    revision: row.revision || "",
    issueStatus: row.issue_status || "",
    approvalStatus: row.approval_status || "",
    building: row.building || "",
    level: row.level || "",
    zone: row.zone || "",
    extra: row.extra || {},
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNote(row: DbNote): DriveFileNote {
  return {
    id: row.id,
    projectId: row.project_id,
    documentId: row.document_id,
    versionId: row.version_id,
    note: row.note || "",
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapQr(row: DbQr): DriveQrCode {
  return {
    id: row.id,
    projectId: row.project_id,
    documentId: row.document_id,
    versionId: row.version_id,
    publicKey: row.public_key,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    revokedBy: row.revoked_by,
    revokedAt: row.revoked_at,
  };
}

function mapBoxItem(row: DbBoxItem): DriveBoxItem {
  return {
    id: row.id,
    projectId: row.project_id,
    boxId: row.box_id,
    documentId: row.document_id,
    versionId: row.version_id,
    sortOrder: Number(row.sort_order || 0),
    addedBy: row.added_by,
    addedAt: row.added_at,
  };
}

function mapBox(row: DbBox, items: DriveBoxItem[] = []): DriveBox {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    purpose: row.purpose,
    colorToken: row.color_token,
    iconKey: row.icon_key,
    note: row.note || "",
    sortOrder: Number(row.sort_order || 0),
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  };
}

export async function getDriveWorkspaceDatabaseHealth() {
  try {
    const client = getDatabaseClient();
    const checks = await Promise.all(DRIVE_WORKSPACE_TABLES.map(async (table) => {
      const { error } = await client.from(table).select(getDriveWorkspaceSchemaSelect(table)).limit(0);
      return { table, ready: !error, errorCode: error?.code || null, errorMessage: error?.message || null };
    }));
    const { data: marker, error: markerError } = await client
      .from("drive_workspace_schema_meta")
      .select("schema_version,migration_count,bootstrap_id")
      .eq("component", "drive-workspace")
      .maybeSingle();
    const markerReady = !markerError
      && marker?.schema_version === DRIVE_WORKSPACE_SCHEMA_VERSION
      && Number(marker?.migration_count) === DRIVE_WORKSPACE_MIGRATION_COUNT
      && marker?.bootstrap_id === DRIVE_WORKSPACE_BOOTSTRAP_ID;
    return {
      configured: true,
      ready: checks.every((check) => check.ready) && markerReady,
      provider: "supabase" as const,
      expectedSchemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
      actualSchemaVersion: marker?.schema_version || null,
      migrationCount: marker?.migration_count == null ? null : Number(marker.migration_count),
      bootstrapId: marker?.bootstrap_id || null,
      tables: Object.fromEntries(checks.map((check) => [check.table, check.ready])),
      checks,
      errorCode: checks.find((check) => !check.ready)?.errorCode
        || markerError?.code
        || (markerReady ? null : "DRIVE_WORKSPACE_SCHEMA_VERSION_MISMATCH"),
    };
  } catch (error) {
    return {
      configured: !(error instanceof DriveCoreRepositoryError && error.code === "DRIVE_WORKSPACE_DATABASE_NOT_CONFIGURED"),
      ready: false,
      provider: "supabase" as const,
      expectedSchemaVersion: DRIVE_WORKSPACE_SCHEMA_VERSION,
      actualSchemaVersion: null,
      migrationCount: null,
      bootstrapId: null,
      tables: Object.fromEntries(DRIVE_WORKSPACE_TABLES.map((table) => [table, false])),
      checks: DRIVE_WORKSPACE_TABLES.map((table) => ({
        table,
        ready: false,
        errorCode: error instanceof DriveCoreRepositoryError ? error.code : "DRIVE_WORKSPACE_DATABASE_ERROR",
        errorMessage: null,
      })),
      errorCode: error instanceof DriveCoreRepositoryError ? error.code : "DRIVE_WORKSPACE_DATABASE_ERROR",
    };
  }
}

async function requireReadyClient() {
  const health = await getDriveWorkspaceDatabaseHealth();
  if (!health.ready) {
    throw new DriveCoreRepositoryError(
      "A DRIVE Workspace 1.0.0 PostgreSQL-sémája nem áll készen.",
      health.errorCode || "DRIVE_WORKSPACE_SCHEMA_NOT_READY",
      503,
      health,
    );
  }
  return getDatabaseClient();
}

export async function getDriveDocumentWorkspaceDetails(projectId: string, documentId: string) {
  const client = await requireReadyClient();
  const [documentResult, versionResult, metadataResult, noteResult, qrResult] = await Promise.all([
    client.from("drive_core_documents").select("*").eq("project_id", projectId).eq("id", documentId).neq("status", "DELETED").maybeSingle(),
    client.from("drive_core_document_versions").select("*").eq("project_id", projectId).eq("document_id", documentId).order("version_number", { ascending: false }),
    client.from("drive_core_document_metadata").select("*").eq("project_id", projectId).eq("document_id", documentId).maybeSingle(),
    client.from("drive_core_file_notes").select("*").eq("project_id", projectId).eq("document_id", documentId).order("updated_at", { ascending: false }),
    client.from("drive_core_qr_codes").select("*").eq("project_id", projectId).eq("document_id", documentId).order("created_at", { ascending: false }),
  ]);
  if (documentResult.error) databaseError("A DRIVE dokumentum részletei nem tölthetők be.", documentResult.error);
  if (!documentResult.data) throw new DriveCoreRepositoryError("A dokumentum nem található.", "DRIVE_DOCUMENT_NOT_FOUND", 404);
  if (versionResult.error) databaseError("A DRIVE dokumentumverziók nem tölthetők be.", versionResult.error);
  if (metadataResult.error) databaseError("A DRIVE mérnöki metaadat nem tölthető be.", metadataResult.error);
  if (noteResult.error) databaseError("A DRIVE fájlmegjegyzések nem tölthetők be.", noteResult.error);
  if (qrResult.error) databaseError("A DRIVE QR azonosítók nem tölthetők be.", qrResult.error);

  const document = documentResult.data as DbDocument;
  const versions = (versionResult.data || []).map((row) => {
    const version = row as DbVersion;
    return {
      id: version.id,
      projectId: version.project_id,
      documentId: version.document_id,
      versionNumber: Number(version.version_number || 0),
      revisionCode: version.revision_code || "",
      originalName: version.original_name,
      mimeType: version.mime_type,
      sizeBytes: Number(version.size_bytes || 0),
      sha256: version.sha256,
      storageProvider: version.storage_provider,
      storageBucket: version.storage_bucket,
      storageKey: version.storage_key,
      status: version.status,
      changeNote: version.change_note || "",
      createdBy: version.created_by,
      createdAt: version.created_at,
    };
  });

  return {
    projectId,
    document: {
      id: document.id,
      projectId: document.project_id,
      folderId: document.folder_id,
      name: document.name,
      extension: document.extension || "",
      mimeType: document.mime_type,
      description: document.description || "",
      status: document.status,
      source: document.source,
      currentVersionNumber: Number(document.current_version_number || 0),
      createdBy: document.created_by,
      createdAt: document.created_at,
      updatedAt: document.updated_at,
    },
    versions,
    metadata: metadataResult.data ? mapMetadata(metadataResult.data as DbMetadata) : null,
    notes: (noteResult.data || []).map((row) => mapNote(row as DbNote)),
    qrCodes: (qrResult.data || []).map((row) => mapQr(row as DbQr)),
  };
}

export async function upsertDriveEngineeringMetadata(
  projectId: string,
  documentId: string,
  input: Record<string, unknown>,
  actorUserId: string,
) {
  const client = await requireReadyClient();
  const payload = {
    planNo: typeof input.planNo === "string" ? input.planNo.trim() : "",
    discipline: typeof input.discipline === "string" ? input.discipline.trim() : "",
    documentType: typeof input.documentType === "string" ? input.documentType.trim() : "",
    revision: typeof input.revision === "string" ? input.revision.trim() : "",
    issueStatus: typeof input.issueStatus === "string" ? input.issueStatus.trim() : "",
    approvalStatus: typeof input.approvalStatus === "string" ? input.approvalStatus.trim() : "",
    building: typeof input.building === "string" ? input.building.trim() : "",
    level: typeof input.level === "string" ? input.level.trim() : "",
    zone: typeof input.zone === "string" ? input.zone.trim() : "",
    extra: input.extra && typeof input.extra === "object" && !Array.isArray(input.extra) ? input.extra : {},
  };
  const { data, error } = await client.rpc("drive_workspace_upsert_metadata_atomic", {
    p_project_id: projectId,
    p_document_id: documentId,
    p_payload: payload,
    p_actor_user_id: actorUserId,
  });
  if (error) databaseError("A DRIVE mérnöki metaadat mentése sikertelen.", error);
  return { ok: true as const, metadata: mapMetadata(data as DbMetadata) };
}

export async function upsertDriveFileNote(
  projectId: string,
  documentId: string,
  input: Record<string, unknown>,
  actorUserId: string,
) {
  const client = await requireReadyClient();
  const versionId = typeof input.versionId === "string" ? input.versionId.trim() : "";
  const note = typeof input.note === "string" ? input.note.slice(0, 8000) : "";
  const { data, error } = await client.rpc("drive_workspace_upsert_note_atomic", {
    p_project_id: projectId,
    p_document_id: documentId,
    p_version_id: versionId,
    p_note: note,
    p_actor_user_id: actorUserId,
  });
  if (error) databaseError("A DRIVE fájlmegjegyzés mentése sikertelen.", error);
  return { ok: true as const, note: mapNote(data as DbNote) };
}

export async function ensureDriveQrCode(
  projectId: string,
  documentId: string,
  input: Record<string, unknown>,
  actorUserId: string,
) {
  const client = await requireReadyClient();
  const versionId = typeof input.versionId === "string" ? input.versionId.trim() : "";
  const publicKey = `drv_${randomBytes(24).toString("base64url")}`;
  const { data, error } = await client.rpc("drive_workspace_ensure_qr_atomic", {
    p_project_id: projectId,
    p_document_id: documentId,
    p_version_id: versionId,
    p_public_key: publicKey,
    p_actor_user_id: actorUserId,
  });
  if (error) databaseError("A DRIVE QR azonosító létrehozása sikertelen.", error);
  const result = data as { qr: DbQr; idempotent: boolean };
  return { ok: true as const, qr: mapQr(result.qr), idempotent: Boolean(result.idempotent) };
}


export async function listDriveBoxes(projectId: string) {
  const client = await requireReadyClient();
  const [boxResult, itemResult] = await Promise.all([
    client.from("drive_core_boxes").select("*").eq("project_id", projectId).eq("status", "ACTIVE").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    client.from("drive_core_box_items").select("*").eq("project_id", projectId).order("sort_order", { ascending: true }).order("added_at", { ascending: true }),
  ]);
  if (boxResult.error) databaseError("A CsomagBOX lista nem tölthető be.", boxResult.error);
  if (itemResult.error) databaseError("A CsomagBOX elemek nem tölthetők be.", itemResult.error);
  const items = (itemResult.data || []).map((row) => mapBoxItem(row as DbBoxItem));
  const byBox = new Map<string, DriveBoxItem[]>();
  for (const item of items) {
    const bucket = byBox.get(item.boxId) || [];
    bucket.push(item);
    byBox.set(item.boxId, bucket);
  }
  return {
    ok: true as const,
    boxes: (boxResult.data || []).map((row) => mapBox(row as DbBox, byBox.get((row as DbBox).id) || [])),
  };
}

export async function createDriveBox(
  projectId: string,
  input: Record<string, unknown>,
  actorUserId: string,
) {
  const client = await requireReadyClient();
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  if (!name) throw new DriveCoreRepositoryError("A CsomagBOX neve kötelező.", "DRIVE_BOX_NAME_REQUIRED", 400);
  const allowedPurposes: DriveBoxPurpose[] = ["GENERAL", "DROP", "COMPARE", "AI_ANALYSIS", "ISSUE", "MEETING"];
  const requestedPurpose = typeof input.purpose === "string" ? input.purpose.toUpperCase() : "GENERAL";
  const purpose = allowedPurposes.includes(requestedPurpose as DriveBoxPurpose) ? requestedPurpose as DriveBoxPurpose : "GENERAL";
  const colorToken = typeof input.colorToken === "string" && input.colorToken.trim() ? input.colorToken.trim().slice(0, 40) : "blue";
  const iconKey = typeof input.iconKey === "string" && input.iconKey.trim() ? input.iconKey.trim().slice(0, 80) : "box";
  const note = typeof input.note === "string" ? input.note.slice(0, 2000) : "";
  const { data, error } = await client.rpc("drive_workspace_create_box_atomic", {
    p_project_id: projectId,
    p_name: name,
    p_purpose: purpose,
    p_color_token: colorToken,
    p_icon_key: iconKey,
    p_note: note,
    p_actor_user_id: actorUserId,
  });
  if (error) databaseError("A CsomagBOX létrehozása sikertelen.", error);
  return { ok: true as const, box: mapBox(data as DbBox) };
}

export async function addDriveBoxItem(
  projectId: string,
  boxId: string,
  input: Record<string, unknown>,
  actorUserId: string,
) {
  const client = await requireReadyClient();
  const documentId = typeof input.documentId === "string" ? input.documentId.trim() : "";
  const versionId = typeof input.versionId === "string" && input.versionId.trim() ? input.versionId.trim() : null;
  if (!documentId) throw new DriveCoreRepositoryError("A dokumentum azonosító kötelező.", "DRIVE_BOX_DOCUMENT_REQUIRED", 400);
  const { data, error } = await client.rpc("drive_workspace_add_box_item_atomic", {
    p_project_id: projectId,
    p_box_id: boxId,
    p_document_id: documentId,
    p_version_id: versionId,
    p_actor_user_id: actorUserId,
  });
  if (error) databaseError("A fájl CsomagBOX-hoz adása sikertelen.", error);
  const result = data as { item: DbBoxItem; idempotent?: boolean };
  return { ok: true as const, item: mapBoxItem(result.item), idempotent: Boolean(result.idempotent) };
}

export async function removeDriveBoxItem(
  projectId: string,
  boxId: string,
  itemId: string,
  actorUserId: string,
) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("drive_workspace_remove_box_item_atomic", {
    p_project_id: projectId,
    p_box_id: boxId,
    p_item_id: itemId,
    p_actor_user_id: actorUserId,
  });
  if (error) databaseError("A fájl eltávolítása a CsomagBOX-ból sikertelen.", error);
  return { ok: true as const, removed: data as DbBoxItem };
}


export async function moveDriveDocument(
  projectId: string,
  documentId: string,
  targetFolderId: string,
  actorUserId: string,
) {
  const client = await requireReadyClient();
  const normalizedTarget = targetFolderId.trim();
  if (!normalizedTarget) throw new DriveCoreRepositoryError("A célmappa azonosító kötelező.", "DRIVE_MOVE_TARGET_REQUIRED", 400);
  const { data, error } = await client.rpc("drive_workspace_move_document_atomic", {
    p_project_id: projectId,
    p_document_id: documentId,
    p_target_folder_id: normalizedTarget,
    p_actor_user_id: actorUserId,
  });
  if (error) databaseError("A dokumentum áthelyezése sikertelen.", error);
  const result = data as { document: DbDocument; idempotent?: boolean; previousFolderId?: string };
  return {
    ok: true as const,
    document: {
      id: result.document.id,
      projectId: result.document.project_id,
      folderId: result.document.folder_id,
      name: result.document.name,
      extension: result.document.extension || "",
      mimeType: result.document.mime_type,
      description: result.document.description || "",
      status: result.document.status,
      source: result.document.source,
      currentVersionNumber: Number(result.document.current_version_number || 0),
      createdBy: result.document.created_by,
      createdAt: result.document.created_at,
      updatedAt: result.document.updated_at,
    },
    idempotent: Boolean(result.idempotent),
    previousFolderId: result.previousFolderId || null,
  };
}
