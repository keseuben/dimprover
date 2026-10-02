import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DriveCoreRepositoryError } from "./errors";
import type { ProjectAccessContext, ProjectMembershipRole } from "@/app/lib/project-core/types";
import { listDriveTreeForAccess, requireDriveDocumentAccess, requireDriveFolderAccess } from "./folderAccess";
import type { DriveDocument, DriveDocumentVersion, DriveNumberingOrigin, DriveVersionKind } from "./types";
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
export type DriveBoxLifecycleStatus = "DRAFT" | "READY" | "SENT" | "ARCHIVED";

export type DriveBoxFolder = {
  id: string;
  projectId: string;
  boxId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  status: "ACTIVE" | "ARCHIVED";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DriveBoxItem = {
  id: string;
  projectId: string;
  boxId: string;
  documentId: string;
  versionId: string | null;
  folderId: string | null;
  version: {
    id: string;
    versionNumber: number;
    revisionCode: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
    createdBy: string;
    createdAt: string;
  } | null;
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
  lifecycleStatus: DriveBoxLifecycleStatus;
  lifecycleFeatureReady: boolean;
  readyAt: string | null;
  sentAt: string | null;
  archivedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  folderFeatureReady: boolean;
  folders: DriveBoxFolder[];
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
  lifecycle_status?: DriveBoxLifecycleStatus;
  ready_at?: string | null;
  sent_at?: string | null;
  archived_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type DbBoxFolder = {
  id: string;
  project_id: string;
  box_id: string;
  parent_id: string | null;
  name: string;
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
  folder_id?: string | null;
  sort_order: number | string;
  added_by: string;
  added_at: string;
};

type DbVersion = {
  id: string;
  project_id: string;
  document_id: string;
  version_number: number | string;
  revision_number?: number | string | null;
  revision_code: string;
  version_kind?: string | null;
  revision_reason?: string | null;
  revision_date?: string | null;
  numbering_origin?: string | null;
  numbering_correction_reason?: string | null;
  numbering_corrected_by?: string | null;
  numbering_corrected_at?: string | null;
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
  export_alias?: string | null;
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

function isOptionalBoxLifecycleFeatureMissing(error: unknown) {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const code = candidate?.code || "";
  const marker = [candidate?.message, candidate?.details, candidate?.hint].filter(Boolean).join(" ").toLowerCase();
  return ["PGRST202", "PGRST204", "42703", "42883"].includes(code)
    || marker.includes("lifecycle_status")
    || marker.includes("drive_workspace_set_box_lifecycle_atomic");
}

function boxLifecycleFeatureNotReady(error?: unknown): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  throw new DriveCoreRepositoryError(
    "A CsomagBOX életciklus még nincs aktiválva ebben a DEV adatbázisban.",
    "DRIVE_BOX_LIFECYCLE_FEATURE_NOT_READY",
    503,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

function isOptionalBoxFolderFeatureMissing(error: unknown) {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const code = candidate?.code || "";
  const marker = [candidate?.message, candidate?.details, candidate?.hint].filter(Boolean).join(" ").toLowerCase();
  return ["PGRST205", "PGRST202", "42P01", "42703", "42883"].includes(code)
    || marker.includes("drive_core_box_folders")
    || marker.includes("drive_workspace_create_box_folder_atomic")
    || marker.includes("drive_workspace_move_box_item_atomic");
}

function boxFolderFeatureNotReady(error?: unknown): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  throw new DriveCoreRepositoryError(
    "A CsomagBOX mappastruktúra még nincs aktiválva ebben a DEV adatbázisban.",
    "DRIVE_BOX_FOLDER_FEATURE_NOT_READY",
    503,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
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

function mapBoxFolder(row: DbBoxFolder): DriveBoxFolder {
  return {
    id: row.id,
    projectId: row.project_id,
    boxId: row.box_id,
    parentId: row.parent_id,
    name: row.name,
    sortOrder: Number(row.sort_order || 0),
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBoxItem(row: DbBoxItem, version: DbVersion | null = null): DriveBoxItem {
  return {
    id: row.id,
    projectId: row.project_id,
    boxId: row.box_id,
    documentId: row.document_id,
    versionId: row.version_id,
    folderId: row.folder_id || null,
    version: version ? {
      id: version.id,
      versionNumber: Number(version.version_number || 0),
      revisionCode: version.revision_code || "",
      originalName: version.original_name,
      mimeType: version.mime_type,
      sizeBytes: Number(version.size_bytes || 0),
      status: version.status,
      createdBy: version.created_by,
      createdAt: version.created_at,
    } : null,
    sortOrder: Number(row.sort_order || 0),
    addedBy: row.added_by,
    addedAt: row.added_at,
  };
}

function mapBox(
  row: DbBox,
  items: DriveBoxItem[] = [],
  folders: DriveBoxFolder[] = [],
  folderFeatureReady = false,
  lifecycleFeatureReady = false,
): DriveBox {
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
    lifecycleStatus: row.lifecycle_status || "DRAFT",
    lifecycleFeatureReady,
    readyAt: row.ready_at || null,
    sentAt: row.sent_at || null,
    archivedAt: row.archived_at || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    folderFeatureReady,
    folders,
    items,
  };
}

function packageRevisionNumber(row: DbVersion) {
  if (row.revision_number != null) return Number(row.revision_number || 0);
  const match = String(row.revision_code || "").match(/^R(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

function packageVersionKind(row: DbVersion): DriveVersionKind {
  if (row.version_kind === "INITIAL" || row.version_kind === "REVISION") return row.version_kind;
  return Number(row.version_number || 0) === 1 ? "INITIAL" : "VERSION";
}
function packageNumberingOrigin(row: DbVersion): DriveNumberingOrigin {
  if (row.numbering_origin === "IMPORTED" || row.numbering_origin === "CORRECTED") return row.numbering_origin;
  return "SYSTEM";
}

function mapPackageVersion(row: DbVersion): DriveDocumentVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    documentId: row.document_id,
    versionNumber: Number(row.version_number || 0),
    revisionNumber: packageRevisionNumber(row),
    revisionCode: row.revision_code || ("R" + String(packageRevisionNumber(row)).padStart(2, "0")),
    versionKind: packageVersionKind(row),
    revisionReason: row.revision_reason || "",
    revisionDate: row.revision_date || null,
    numberingOrigin: packageNumberingOrigin(row),
    numberingCorrectionReason: row.numbering_correction_reason || "",
    numberingCorrectedBy: row.numbering_corrected_by || null,
    numberingCorrectedAt: row.numbering_corrected_at || null,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    sha256: row.sha256,
    storageProvider: row.storage_provider as DriveDocumentVersion["storageProvider"],
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    status: row.status as DriveDocumentVersion["status"],
    changeNote: row.change_note || "",
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapPackageDocument(row: DbDocument, version: DriveDocumentVersion | null): DriveDocument {
  return {
    id: row.id,
    projectId: row.project_id,
    folderId: row.folder_id,
    name: row.name,
    extension: row.extension || "",
    mimeType: row.mime_type,
    description: row.description || "",
    status: row.status as DriveDocument["status"],
    source: row.source as DriveDocument["source"],
    currentVersionNumber: Number(row.current_version_number || 0),
    exportAlias: row.export_alias || "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentVersion: version,
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

export async function listDriveEngineeringMetadata(projectId: string) {
  const client = await requireReadyClient();
  const { data, error } = await client
    .from("drive_core_document_metadata")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });
  if (error) databaseError("A DRIVE mérnöki metaadatok nem tölthetők be.", error);
  return (data || []).map((row) => mapMetadata(row as DbMetadata));
}

export async function getDriveDocumentWorkspaceDetails(projectId: string, documentId: string, access: ProjectAccessContext) {
  await requireDriveDocumentAccess(projectId, documentId, access);
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

type DriveAuditActor = { userId: string; displayName?: string; role?: ProjectMembershipRole };

const TECHNICAL_REVIEW_FIELDS = new Set([
  "reviewChecked", "reviewResult", "reviewObservations", "reviewObservationItems", "workflowStatus",
  "internalNote", "revisionChange", "openObservationCount",
]);
const CUSTOMER_REVIEW_FIELDS = new Set(["customerApproval", "customerNote", "customerObservations", "customerObservationItems"]);
const PROJECT_MANAGER_FIELDS = new Set(["projectManagerApproval"]);
const INVESTOR_MANAGER_FIELDS = new Set(["investorProjectManagerApproval"]);
const LIFECYCLE_FIELDS = new Set(["lifecycleStatus"]);

function reviewFieldChanges(currentExtra: Record<string, unknown>, nextExtra: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  const keys = new Set([
    ...TECHNICAL_REVIEW_FIELDS,
    ...CUSTOMER_REVIEW_FIELDS,
    ...PROJECT_MANAGER_FIELDS,
    ...INVESTOR_MANAGER_FIELDS,
    ...LIFECYCLE_FIELDS,
  ]);
  for (const key of keys) {
    const current = currentExtra[key];
    const next = nextExtra[key];
    if (JSON.stringify(current ?? null) !== JSON.stringify(next ?? null)) result[key] = next;
  }
  return result;
}

function assertReviewFieldPermissions(fields: Record<string, unknown>, actor: DriveAuditActor) {
  const role = actor.role;
  const changedKeys = Object.keys(fields);
  const hasAny = (set: Set<string>) => changedKeys.some((key) => set.has(key));
  const technicalAllowed = role === "REVIEWER" || role === "PROJECT_MANAGER" || role === "OWNER";
  const customerAllowed = role === "PROJECT_MANAGER" || role === "OWNER";
  const managerAllowed = role === "PROJECT_MANAGER" || role === "OWNER";
  const investorAllowed = role === "OWNER";
  const lifecycleAllowed = role === "PROJECT_MANAGER" || role === "OWNER";

  if (hasAny(TECHNICAL_REVIEW_FIELDS) && !technicalAllowed) {
    throw new DriveCoreRepositoryError("A műszaki tervellenőrzéshez nincs megfelelő jogosultságod.", "DRIVE_REVIEW_TECHNICAL_FORBIDDEN", 403);
  }
  if (hasAny(CUSTOMER_REVIEW_FIELDS) && !customerAllowed) {
    throw new DriveCoreRepositoryError("A megrendelői jóváhagyás módosításához nincs megfelelő jogosultságod.", "DRIVE_REVIEW_CUSTOMER_FORBIDDEN", 403);
  }
  if (hasAny(PROJECT_MANAGER_FIELDS) && !managerAllowed) {
    throw new DriveCoreRepositoryError("A projektvezetői jóváhagyás módosításához nincs megfelelő jogosultságod.", "DRIVE_REVIEW_MANAGER_FORBIDDEN", 403);
  }
  if (hasAny(INVESTOR_MANAGER_FIELDS) && !investorAllowed) {
    throw new DriveCoreRepositoryError("A beruházói projektvezetői jóváhagyás módosításához nincs megfelelő jogosultságod.", "DRIVE_REVIEW_INVESTOR_FORBIDDEN", 403);
  }
  if (hasAny(LIFECYCLE_FIELDS) && !lifecycleAllowed) {
    throw new DriveCoreRepositoryError("A terv életciklusának módosításához nincs megfelelő jogosultságod.", "DRIVE_REVIEW_LIFECYCLE_FORBIDDEN", 403);
  }
}

function normalizedExtraText(extra: Record<string, unknown>, key: string) {
  const value = extra[key];
  return typeof value === "string" ? value.trim() : "";
}

function stampReviewAudit(
  extra: Record<string, unknown>,
  currentExtra: Record<string, unknown>,
  key: string,
  prefix: string,
  actor: DriveAuditActor,
  now: string,
) {
  const nextValue = normalizedExtraText(extra, key);
  const currentValue = normalizedExtraText(currentExtra, key);
  if (nextValue === currentValue) return;
  extra[prefix + "ByUserId"] = actor.userId;
  extra[prefix + "ByName"] = actor.displayName?.trim() || actor.userId;
  extra[prefix + "At"] = now;
  extra[prefix + "Decision"] = nextValue;
}

function reviewFieldFingerprint(value: unknown) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "").trim();
}

function stampReviewActivity(
  extra: Record<string, unknown>,
  currentExtra: Record<string, unknown>,
  keys: string[],
  prefix: string,
  label: string,
  actor: DriveAuditActor,
  now: string,
) {
  const changed = keys.some((key) => reviewFieldFingerprint(extra[key]) !== reviewFieldFingerprint(currentExtra[key]));
  if (!changed) return;
  extra[prefix + "ByUserId"] = actor.userId;
  extra[prefix + "ByName"] = actor.displayName?.trim() || actor.userId;
  extra[prefix + "At"] = now;
  extra[prefix + "Decision"] = label;
}

function applyReviewAuditTrail(
  extra: Record<string, unknown>,
  currentExtra: Record<string, unknown>,
  actor: DriveAuditActor,
  now = new Date().toISOString(),
) {
  stampReviewActivity(
    extra,
    currentExtra,
    ["reviewChecked", "reviewResult", "reviewObservations", "reviewObservationItems", "workflowStatus", "internalNote", "revisionChange"],
    "technicalReview",
    "Műszaki ellenőrzés módosítva",
    actor,
    now,
  );
  stampReviewActivity(
    extra,
    currentExtra,
    ["customerApproval", "customerObservations", "customerObservationItems", "customerNote"],
    "customerReview",
    "Megrendelői ellenőrzés módosítva",
    actor,
    now,
  );
  stampReviewAudit(extra, currentExtra, "workflowStatus", "workflowChanged", actor, now);
  stampReviewAudit(extra, currentExtra, "customerApproval", "customerApproval", actor, now);
  stampReviewAudit(extra, currentExtra, "projectManagerApproval", "projectManagerApproval", actor, now);
  stampReviewAudit(extra, currentExtra, "investorProjectManagerApproval", "investorProjectManagerApproval", actor, now);
  stampReviewAudit(extra, currentExtra, "lifecycleStatus", "lifecycleChanged", actor, now);
}

export async function bulkUpdateDriveReviewMetadata(
  projectId: string,
  input: Record<string, unknown>,
  actor: DriveAuditActor,
  access: ProjectAccessContext,
) {
  const client = await requireReadyClient();
  const explicitIds = Array.isArray(input.documentIds)
    ? input.documentIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim())
    : [];
  const folderId = typeof input.folderId === "string" ? input.folderId.trim() : "";
  const includeDescendants = input.includeDescendants === true;
  const fields = input.fields && typeof input.fields === "object" && !Array.isArray(input.fields)
    ? input.fields as Record<string, unknown>
    : {};
  assertReviewFieldPermissions(fields, actor);

  const tree = await listDriveTreeForAccess(projectId, access);
  const visibleDocumentIds = new Set(tree.documents.map((document) => document.id));
  const hiddenExplicitId = explicitIds.find((documentId) => !visibleDocumentIds.has(documentId));
  if (hiddenExplicitId) {
    await requireDriveDocumentAccess(projectId, hiddenExplicitId, access);
  }

  const targetIds = new Set(explicitIds);
  if (folderId) {
    const visibleFolderIds = new Set(tree.folders.map((folder) => folder.id));
    if (!visibleFolderIds.has(folderId)) {
      await requireDriveFolderAccess(projectId, folderId, access);
    }

    const folderIds = new Set<string>([folderId]);
    if (includeDescendants) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const folder of tree.folders) {
          if (folder.parentId && folderIds.has(folder.parentId) && !folderIds.has(folder.id)) {
            folderIds.add(folder.id);
            changed = true;
          }
        }
      }
    }
    for (const document of tree.documents) {
      if (folderIds.has(document.folderId)) targetIds.add(document.id);
    }
  }

  const documentIds = [...targetIds];
  if (!documentIds.length) {
    return { ok: false as const, error: "Nincs kijelölt dokumentum a csoportos ellenőrzéshez." };
  }
  if (documentIds.length > 1000) {
    return { ok: false as const, error: "Egy művelettel legfeljebb 1000 dokumentum módosítható." };
  }

  const existingResult = await client
    .from("drive_core_document_metadata")
    .select("*")
    .eq("project_id", projectId);
  if (existingResult.error) databaseError("A DRIVE metaadatok nem tölthetők be a csoportos ellenőrzéshez.", existingResult.error);
  const existingByDocument = new Map(
    ((existingResult.data || []) as DbMetadata[]).map((row) => [row.document_id, row] as const),
  );

  const stringField = (name: string) => typeof fields[name] === "string" ? String(fields[name]).trim() : undefined;
  const observationItemsField = (name: string) => {
    if (!Array.isArray(fields[name])) return undefined;
    return (fields[name] as unknown[])
      .slice(0, 200)
      .map((item, index) => {
        const value = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
        const text = typeof value.text === "string" ? value.text.trim().slice(0, 4000) : "";
        if (!text) return null;
        const id = typeof value.id === "string" && value.id.trim() ? value.id.trim().slice(0, 160) : `obs-${index + 1}`;
        const source = value.source === "voice" ? "voice" : "text";
        return { id, text, source };
      })
      .filter((item): item is { id: string; text: string; source: "text" | "voice" } => Boolean(item));
  };
  const reviewChecked = stringField("reviewChecked");
  const reviewResult = stringField("reviewResult");
  const reviewObservations = stringField("reviewObservations");
  const reviewObservationItems = observationItemsField("reviewObservationItems");
  const workflowStatus = stringField("workflowStatus");
  const internalNote = stringField("internalNote");
  const customerApproval = stringField("customerApproval");
  const customerNote = stringField("customerNote");
  const customerObservations = stringField("customerObservations");
  const customerObservationItems = observationItemsField("customerObservationItems");
  const revisionChange = stringField("revisionChange");
  const projectManagerApproval = stringField("projectManagerApproval");
  const investorProjectManagerApproval = stringField("investorProjectManagerApproval");
  const lifecycleStatus = stringField("lifecycleStatus");
  const openObservationCount = fields.openObservationCount !== undefined
    ? Math.max(0, Number(fields.openObservationCount) || 0)
    : undefined;

  let updated = 0;
  for (let offset = 0; offset < documentIds.length; offset += 10) {
    const batch = documentIds.slice(offset, offset + 10);
    await Promise.all(batch.map(async (documentId) => {
      const current = existingByDocument.get(documentId);
      const currentExtra: Record<string, unknown> = { ...(current?.extra || {}) };
      const extra: Record<string, unknown> = { ...currentExtra };
      if (reviewChecked !== undefined) extra.reviewChecked = reviewChecked;
      if (reviewResult !== undefined) extra.reviewResult = reviewResult;
      if (reviewObservations !== undefined) extra.reviewObservations = reviewObservations;
      if (reviewObservationItems !== undefined) {
        extra.reviewObservationItems = reviewObservationItems;
        extra.reviewObservations = reviewObservationItems.map((item, index) => `${index + 1}. ${item.text}`).join("\n");
        extra.openObservationCount = reviewObservationItems.length;
      }
      if (workflowStatus !== undefined) extra.workflowStatus = workflowStatus;
      if (internalNote !== undefined) extra.internalNote = internalNote;
      if (customerApproval !== undefined) extra.customerApproval = customerApproval;
      if (customerNote !== undefined) extra.customerNote = customerNote;
      if (customerObservations !== undefined) extra.customerObservations = customerObservations;
      if (customerObservationItems !== undefined) {
        extra.customerObservationItems = customerObservationItems;
        extra.customerObservations = customerObservationItems.map((item, index) => `${index + 1}. ${item.text}`).join("\n");
      }
      if (revisionChange !== undefined) extra.revisionChange = revisionChange;
      if (projectManagerApproval !== undefined) extra.projectManagerApproval = projectManagerApproval;
      if (investorProjectManagerApproval !== undefined) extra.investorProjectManagerApproval = investorProjectManagerApproval;
      if (lifecycleStatus !== undefined) extra.lifecycleStatus = lifecycleStatus;
      if (openObservationCount !== undefined && reviewObservationItems === undefined) extra.openObservationCount = openObservationCount;

      applyReviewAuditTrail(extra, currentExtra, actor);

      const payload = {
        planNo: current?.plan_no || "",
        discipline: current?.discipline || "",
        documentType: current?.document_type || "",
        revision: current?.revision || "",
        issueStatus: current?.issue_status || "",
        approvalStatus: workflowStatus !== undefined ? workflowStatus : current?.approval_status || "",
        building: current?.building || "",
        level: current?.level || "",
        zone: current?.zone || "",
        extra,
      };
      const { error } = await client.rpc("drive_workspace_upsert_metadata_atomic", {
        p_project_id: projectId,
        p_document_id: documentId,
        p_payload: payload,
        p_actor_user_id: actor.userId,
      });
      if (error) databaseError("A DRIVE csoportos tervellenőrzés mentése sikertelen.", error);
      updated += 1;
    }));
  }

  return {
    ok: true as const,
    updated,
    documentIds,
    scope: folderId ? (includeDescendants ? "FOLDER_RECURSIVE" : "FOLDER") : "SELECTION",
  };
}

export async function upsertDriveEngineeringMetadata(
  projectId: string,
  documentId: string,
  input: Record<string, unknown>,
  actor: DriveAuditActor,
) {
  const client = await requireReadyClient();
  const currentResult = await client
    .from("drive_core_document_metadata")
    .select("*")
    .eq("project_id", projectId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (currentResult.error) databaseError("A DRIVE metaadat előzmény nem tölthető be.", currentResult.error);
  const current = currentResult.data as DbMetadata | null;
  const currentExtra: Record<string, unknown> = { ...(current?.extra || {}) };
  const extra: Record<string, unknown> = input.extra && typeof input.extra === "object" && !Array.isArray(input.extra)
    ? { ...(input.extra as Record<string, unknown>) }
    : {};
  const immutableSourceNameKeys = [
    "originalFileName",
    "safeFileName",
    "originalRelativePath",
    "safeRelativePath",
    "nameNormalizationVersion",
    "nameWasSanitized",
    "nameWasShortened",
    "pathWasCompacted",
  ] as const;
  for (const key of immutableSourceNameKeys) {
    if (currentExtra[key] !== undefined) extra[key] = currentExtra[key];
  }
  assertReviewFieldPermissions(reviewFieldChanges(currentExtra, extra), actor);
  applyReviewAuditTrail(extra, currentExtra, actor);
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
    extra,
  };
  const { data, error } = await client.rpc("drive_workspace_upsert_metadata_atomic", {
    p_project_id: projectId,
    p_document_id: documentId,
    p_payload: payload,
    p_actor_user_id: actor.userId,
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


export async function listDriveBoxes(projectId: string, access: ProjectAccessContext) {
  const [client, tree] = await Promise.all([
    requireReadyClient(),
    listDriveTreeForAccess(projectId, access),
  ]);
  const visibleDocumentIds = new Set(tree.documents.map((document) => document.id));
  const [boxResult, itemResult] = await Promise.all([
    client.from("drive_core_boxes").select("*").eq("project_id", projectId).eq("status", "ACTIVE").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    client.from("drive_core_box_items").select("*").eq("project_id", projectId).order("sort_order", { ascending: true }).order("added_at", { ascending: true }),
  ]);
  if (boxResult.error) databaseError("A CsomagBOX lista nem tölthető be.", boxResult.error);
  if (itemResult.error) databaseError("A CsomagBOX elemek nem tölthetők be.", itemResult.error);

  const folderResult = await client
    .from("drive_core_box_folders")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "ACTIVE")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const folderFeatureReady = !folderResult.error;
  if (folderResult.error && !isOptionalBoxFolderFeatureMissing(folderResult.error)) {
    databaseError("A CsomagBOX mappastruktúra nem tölthető be.", folderResult.error);
  }

  const lifecycleProbe = await client
    .from("drive_core_boxes")
    .select("id,lifecycle_status,ready_at,sent_at,archived_at")
    .eq("project_id", projectId)
    .eq("status", "ACTIVE")
    .limit(1);
  const lifecycleFeatureReady = !lifecycleProbe.error;
  if (lifecycleProbe.error && !isOptionalBoxLifecycleFeatureMissing(lifecycleProbe.error)) {
    databaseError("A CsomagBOX életciklus nem tölthető be.", lifecycleProbe.error);
  }

  const rawItems = ((itemResult.data || []) as DbBoxItem[])
    .filter((item) => visibleDocumentIds.has(item.document_id));
  const versionIds = [...new Set(rawItems.map((item) => item.version_id).filter((value): value is string => Boolean(value)))];
  const versionMap = new Map<string, DbVersion>();
  if (versionIds.length) {
    const versionResult = await client
      .from("drive_core_document_versions")
      .select("id,project_id,document_id,version_number,revision_number,revision_code,version_kind,revision_reason,revision_date,numbering_origin,numbering_correction_reason,numbering_corrected_by,numbering_corrected_at,original_name,mime_type,size_bytes,sha256,storage_provider,storage_bucket,storage_key,status,change_note,created_by,created_at")
      .eq("project_id", projectId)
      .in("id", versionIds);
    if (versionResult.error) databaseError("A CsomagBOX dokumentumverziók nem tölthetők be.", versionResult.error);
    for (const row of (versionResult.data || []) as DbVersion[]) versionMap.set(row.id, row);
  }
  const items = rawItems.map((row) => mapBoxItem(row, row.version_id ? versionMap.get(row.version_id) || null : null));
  const byBox = new Map<string, DriveBoxItem[]>();
  for (const item of items) {
    const bucket = byBox.get(item.boxId) || [];
    bucket.push(item);
    byBox.set(item.boxId, bucket);
  }

  const byBoxFolders = new Map<string, DriveBoxFolder[]>();
  if (folderFeatureReady) {
    for (const row of (folderResult.data || []) as DbBoxFolder[]) {
      const folder = mapBoxFolder(row);
      const bucket = byBoxFolders.get(folder.boxId) || [];
      bucket.push(folder);
      byBoxFolders.set(folder.boxId, bucket);
    }
  }

  return {
    ok: true as const,
    folderFeatureReady,
    lifecycleFeatureReady,
    boxes: (boxResult.data || []).map((row) => {
      const box = row as DbBox;
      return mapBox(box, byBox.get(box.id) || [], byBoxFolders.get(box.id) || [], folderFeatureReady, lifecycleFeatureReady);
    }),
  };
}

export async function getDriveBoxPackageSource(projectId: string, boxId: string, access: ProjectAccessContext) {
  const listed = await listDriveBoxes(projectId, access);
  const box = listed.boxes.find((entry) => entry.id === boxId);
  if (!box) throw new DriveCoreRepositoryError("A CsomagBOX nem található.", "DRIVE_BOX_NOT_FOUND", 404);

  if (!box.items.length) {
    return { ok: true as const, box, entries: [] as Array<{ item: DriveBoxItem; document: DriveDocument | null; version: DriveDocumentVersion | null }> };
  }

  const client = await requireReadyClient();
  const documentIds = [...new Set(box.items.map((item) => item.documentId))];
  const [documentResult, versionResult] = await Promise.all([
    client.from("drive_core_documents").select("*").eq("project_id", projectId).in("id", documentIds).neq("status", "DELETED"),
    client.from("drive_core_document_versions").select("*").eq("project_id", projectId).in("document_id", documentIds),
  ]);
  if (documentResult.error) databaseError("A CsomagBOX dokumentumai nem tölthetők be.", documentResult.error);
  if (versionResult.error) databaseError("A CsomagBOX dokumentumverziói nem tölthetők be.", versionResult.error);

  const documents = new Map<string, DbDocument>();
  for (const row of (documentResult.data || []) as DbDocument[]) documents.set(row.id, row);

  const versionsById = new Map<string, DbVersion>();
  const versionsByDocumentNumber = new Map<string, DbVersion>();
  for (const row of (versionResult.data || []) as DbVersion[]) {
    versionsById.set(row.id, row);
    versionsByDocumentNumber.set(`${row.document_id}::${Number(row.version_number || 0)}`, row);
  }

  const entries = box.items.map((item) => {
    const documentRow = documents.get(item.documentId) || null;
    const versionRow = item.versionId
      ? versionsById.get(item.versionId) || null
      : documentRow
        ? versionsByDocumentNumber.get(`${documentRow.id}::${Number(documentRow.current_version_number || 0)}`) || null
        : null;
    const version = versionRow ? mapPackageVersion(versionRow) : null;
    return {
      item,
      document: documentRow ? mapPackageDocument(documentRow, version) : null,
      version,
    };
  });

  return { ok: true as const, box, entries };
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
  access: ProjectAccessContext,
) {
  const client = await requireReadyClient();
  const documentId = typeof input.documentId === "string" ? input.documentId.trim() : "";
  const versionId = typeof input.versionId === "string" && input.versionId.trim() ? input.versionId.trim() : null;
  if (!documentId) throw new DriveCoreRepositoryError("A dokumentum azonosító kötelező.", "DRIVE_BOX_DOCUMENT_REQUIRED", 400);
  await requireDriveDocumentAccess(projectId, documentId, access);
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

export async function setDriveBoxLifecycle(
  projectId: string,
  boxId: string,
  nextStatus: DriveBoxLifecycleStatus,
  actorUserId: string,
) {
  const client = await requireReadyClient();
  const { data, error } = await client.rpc("drive_workspace_set_box_lifecycle_atomic", {
    p_project_id: projectId,
    p_box_id: boxId,
    p_next_status: nextStatus,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    if (isOptionalBoxLifecycleFeatureMissing(error)) boxLifecycleFeatureNotReady(error);
    databaseError("A CsomagBOX állapotának módosítása sikertelen.", error);
  }
  return { ok: true as const, box: mapBox(data as DbBox, [], [], false, true) };
}

export async function createDriveBoxFolder(
  projectId: string,
  boxId: string,
  input: Record<string, unknown>,
  actorUserId: string,
) {
  const client = await requireReadyClient();
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  const parentId = typeof input.parentId === "string" && input.parentId.trim() ? input.parentId.trim() : null;
  if (!name) throw new DriveCoreRepositoryError("A CsomagBOX mappa neve kötelező.", "DRIVE_BOX_FOLDER_NAME_REQUIRED", 400);
  const { data, error } = await client.rpc("drive_workspace_create_box_folder_atomic", {
    p_project_id: projectId,
    p_box_id: boxId,
    p_parent_id: parentId || "",
    p_name: name,
    p_actor_user_id: actorUserId,
  });
  if (error) {
    if (isOptionalBoxFolderFeatureMissing(error)) boxFolderFeatureNotReady(error);
    databaseError("A CsomagBOX mappa létrehozása sikertelen.", error);
  }
  return { ok: true as const, folder: mapBoxFolder(data as DbBoxFolder) };
}

export async function moveDriveBoxItemToFolder(
  projectId: string,
  boxId: string,
  itemId: string,
  input: Record<string, unknown>,
  actorUserId: string,
  access: ProjectAccessContext,
) {
  const client = await requireReadyClient();
  const itemResult = await client
    .from("drive_core_box_items")
    .select("document_id")
    .eq("project_id", projectId)
    .eq("box_id", boxId)
    .eq("id", itemId)
    .maybeSingle();
  if (itemResult.error) databaseError("A CsomagBOX elem nem ellenőrizhető.", itemResult.error);
  if (!itemResult.data?.document_id) throw new DriveCoreRepositoryError("A CsomagBOX elem nem található.", "DRIVE_BOX_ITEM_NOT_FOUND", 404);
  await requireDriveDocumentAccess(projectId, String(itemResult.data.document_id), access);
  const folderId = typeof input.folderId === "string" && input.folderId.trim() ? input.folderId.trim() : null;
  const { data, error } = await client.rpc("drive_workspace_move_box_item_atomic", {
    p_project_id: projectId,
    p_box_id: boxId,
    p_item_id: itemId,
    p_folder_id: folderId || "",
    p_actor_user_id: actorUserId,
  });
  if (error) {
    if (isOptionalBoxFolderFeatureMissing(error)) boxFolderFeatureNotReady(error);
    databaseError("A CsomagBOX elem áthelyezése sikertelen.", error);
  }
  return { ok: true as const, item: mapBoxItem(data as DbBoxItem) };
}

export async function removeDriveBoxItem(
  projectId: string,
  boxId: string,
  itemId: string,
  actorUserId: string,
  access: ProjectAccessContext,
) {
  const client = await requireReadyClient();
  const itemResult = await client
    .from("drive_core_box_items")
    .select("document_id")
    .eq("project_id", projectId)
    .eq("box_id", boxId)
    .eq("id", itemId)
    .maybeSingle();
  if (itemResult.error) databaseError("A CsomagBOX elem nem ellenőrizhető.", itemResult.error);
  if (!itemResult.data?.document_id) throw new DriveCoreRepositoryError("A CsomagBOX elem nem található.", "DRIVE_BOX_ITEM_NOT_FOUND", 404);
  await requireDriveDocumentAccess(projectId, String(itemResult.data.document_id), access);
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
