import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DriveCoreRepositoryError } from "./errors";
import {
  DRIVE_DOCUMENT_FLOW_BOOTSTRAP_ID,
  DRIVE_DOCUMENT_FLOW_COMPONENT,
  DRIVE_DOCUMENT_FLOW_MIGRATION_COUNT,
  DRIVE_DOCUMENT_FLOW_SCHEMA_VERSION,
  DRIVE_DOCUMENT_FLOW_TABLES,
} from "./documentFlowSchema";
import type { DriveReviewAction } from "./types";

export type DriveDocumentGovernance = {
  versionId: string;
  projectId: string;
  documentId: string;
  businessStatus: "BEJOVO" | "ELLENORZES_ALATT" | "ERVENYES" | "KIADOTT" | "ARCHIV" | null;
  reviewDecision: "PENDING" | "APPROVED" | "REJECTED";
  reviewMode: "DRIVE_SIMPLE" | "DECIDE";
  decideRequestId: string | null;
  issueStatus: "NOT_ISSUED" | "ISSUED" | "WITHDRAWN" | "SUPERSEDED";
  sourceChannel: "DRIVE" | "DROP" | "DESKTOP" | "SYSTEM";
  dropPackageId: string | null;
  dropFileId: string | null;
  reviewNote: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  validBy: string | null;
  validAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type DbGovernance = {
  version_id: string;
  project_id: string;
  document_id: string;
  business_status: DriveDocumentGovernance["businessStatus"];
  review_decision: DriveDocumentGovernance["reviewDecision"];
  review_mode: DriveDocumentGovernance["reviewMode"];
  decide_request_id: string | null;
  issue_status: DriveDocumentGovernance["issueStatus"];
  source_channel: DriveDocumentGovernance["sourceChannel"];
  drop_package_id: string | null;
  drop_file_id: string | null;
  review_note: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  valid_by: string | null;
  valid_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new DriveCoreRepositoryError(
      "A DRIVE Document Flow szerveroldali adatbázis-kapcsolata nincs beállítva.",
      "DRIVE_DOCUMENT_FLOW_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-drive-document-flow/0.1.0" } },
  });
}

function mapGovernance(row: DbGovernance): DriveDocumentGovernance {
  return {
    versionId: row.version_id,
    projectId: row.project_id,
    documentId: row.document_id,
    businessStatus: row.business_status,
    reviewDecision: row.review_decision,
    reviewMode: row.review_mode,
    decideRequestId: row.decide_request_id,
    issueStatus: row.issue_status,
    sourceChannel: row.source_channel,
    dropPackageId: row.drop_package_id,
    dropFileId: row.drop_file_id,
    reviewNote: row.review_note || "",
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    validBy: row.valid_by,
    validAt: row.valid_at,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dbError(message: string, error: unknown): never {
  const item = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const marker = [item?.code, item?.message, item?.details, item?.hint].filter(Boolean).join(" ").toUpperCase();
  if (item?.code === "PGRST205" || item?.code === "42P01" || item?.code === "42883") {
    throw new DriveCoreRepositoryError(
      "A DRIVE Document Flow 0.1.0 PostgreSQL-sémája még nincs alkalmazva.",
      "DRIVE_DOCUMENT_FLOW_SCHEMA_NOT_READY",
      503,
    );
  }
  if (marker.includes("DRIVE_DOCUMENT_FLOW_INCOMING_NOT_QUARANTINED")) {
    throw new DriveCoreRepositoryError("Beérkező dokumentum csak karanténverzióként regisztrálható.", "DRIVE_DOCUMENT_FLOW_INCOMING_NOT_QUARANTINED", 409);
  }
  if (marker.includes("DRIVE_DOCUMENT_FLOW_GOVERNANCE_NOT_FOUND")) {
    throw new DriveCoreRepositoryError("A dokumentum üzleti életciklus-rekordja nem található.", "DRIVE_DOCUMENT_FLOW_GOVERNANCE_NOT_FOUND", 404);
  }
  throw new DriveCoreRepositoryError(message, item?.code || "DRIVE_DOCUMENT_FLOW_DATABASE_ERROR", 500);
}

export async function getDriveDocumentFlowHealth() {
  try {
    const db = client();
    const checks = await Promise.all(DRIVE_DOCUMENT_FLOW_TABLES.map(async (table) => {
      const { error } = await db.from(table).select("*").limit(0);
      return { table, ready: !error, errorCode: error?.code || null };
    }));
    const { data: marker, error: markerError } = await db
      .from("drive_storage_schema_meta")
      .select("schema_version,migration_count,bootstrap_id")
      .eq("component", DRIVE_DOCUMENT_FLOW_COMPONENT)
      .maybeSingle();
    const markerReady = !markerError
      && marker?.schema_version === DRIVE_DOCUMENT_FLOW_SCHEMA_VERSION
      && Number(marker?.migration_count) === DRIVE_DOCUMENT_FLOW_MIGRATION_COUNT
      && marker?.bootstrap_id === DRIVE_DOCUMENT_FLOW_BOOTSTRAP_ID;
    return {
      configured: true,
      ready: checks.every((item) => item.ready) && markerReady,
      expectedSchemaVersion: DRIVE_DOCUMENT_FLOW_SCHEMA_VERSION,
      actualSchemaVersion: marker?.schema_version || null,
      migrationCount: marker?.migration_count == null ? null : Number(marker.migration_count),
      bootstrapId: marker?.bootstrap_id || null,
      checks,
      errorCode: checks.find((item) => !item.ready)?.errorCode || markerError?.code || (markerReady ? null : "DRIVE_DOCUMENT_FLOW_SCHEMA_VERSION_MISMATCH"),
    };
  } catch (error) {
    return {
      configured: !(error instanceof DriveCoreRepositoryError && error.code === "DRIVE_DOCUMENT_FLOW_DATABASE_NOT_CONFIGURED"),
      ready: false,
      expectedSchemaVersion: DRIVE_DOCUMENT_FLOW_SCHEMA_VERSION,
      actualSchemaVersion: null,
      migrationCount: null,
      bootstrapId: null,
      checks: DRIVE_DOCUMENT_FLOW_TABLES.map((table) => ({ table, ready: false, errorCode: error instanceof DriveCoreRepositoryError ? error.code : "DRIVE_DOCUMENT_FLOW_DATABASE_ERROR" })),
      errorCode: error instanceof DriveCoreRepositoryError ? error.code : "DRIVE_DOCUMENT_FLOW_DATABASE_ERROR",
    };
  }
}

async function readyClient() {
  const health = await getDriveDocumentFlowHealth();
  if (!health.ready) {
    throw new DriveCoreRepositoryError(
      "A DRIVE Document Flow 0.1.0 adatbázissémája nem áll készen.",
      health.errorCode || "DRIVE_DOCUMENT_FLOW_SCHEMA_NOT_READY",
      503,
      health,
    );
  }
  return client();
}

export async function getDriveDocumentGovernance(input: { projectId: string; documentId: string; versionId: string }) {
  const db = await readyClient();
  const { data, error } = await db
    .from("drive_core_document_governance")
    .select("*")
    .eq("project_id", input.projectId)
    .eq("document_id", input.documentId)
    .eq("version_id", input.versionId)
    .maybeSingle();
  if (error) dbError("A dokumentum üzleti életciklusa nem tölthető be.", error);
  return data ? mapGovernance(data as DbGovernance) : null;
}

export async function registerDriveIncomingDocument(input: {
  projectId: string;
  documentId: string;
  versionId: string;
  sourceChannel: "DROP" | "DRIVE" | "DESKTOP" | "SYSTEM";
  dropPackageId?: string | null;
  dropFileId?: string | null;
  actorUserId: string;
}) {
  const db = await readyClient();
  const { data, error } = await db.rpc("drive_core_register_incoming_document_atomic", {
    p_project_id: input.projectId,
    p_document_id: input.documentId,
    p_version_id: input.versionId,
    p_source_channel: input.sourceChannel,
    p_drop_package_id: input.dropPackageId || "",
    p_drop_file_id: input.dropFileId || "",
    p_actor_user_id: input.actorUserId,
  });
  if (error) dbError("A beérkező DRIVE dokumentum regisztrációja sikertelen.", error);
  const payload = data as { governance?: DbGovernance } | null;
  if (!payload?.governance?.version_id) throw new DriveCoreRepositoryError("A beérkező dokumentum regisztrációja nem igazolható.", "DRIVE_DOCUMENT_FLOW_REGISTER_RESPONSE_INVALID", 500);
  return mapGovernance(payload.governance);
}

export async function markDriveDocumentReview(input: {
  projectId: string;
  documentId: string;
  versionId: string;
  action: DriveReviewAction;
  note: string;
  actorUserId: string;
}) {
  const db = await readyClient();
  const { data, error } = await db.rpc("drive_core_mark_document_review_atomic", {
    p_project_id: input.projectId,
    p_document_id: input.documentId,
    p_version_id: input.versionId,
    p_action: input.action,
    p_note: input.note,
    p_actor_user_id: input.actorUserId,
  });
  if (error) dbError("A dokumentum üzleti review állapota nem menthető.", error);
  const payload = data as { governance?: DbGovernance } | null;
  if (!payload?.governance?.version_id) throw new DriveCoreRepositoryError("A dokumentum review állapota nem igazolható.", "DRIVE_DOCUMENT_FLOW_REVIEW_RESPONSE_INVALID", 500);
  return mapGovernance(payload.governance);
}

export async function recordDriveStorageVersionReference(input: {
  projectId: string;
  uploadId: string;
  versionId: string;
  storageVersionId: string | null;
}) {
  if (!input.storageVersionId) return { recorded: false, storageVersionId: null };
  const db = await readyClient();
  const now = new Date().toISOString();
  const [sessionResult, versionResult] = await Promise.all([
    db.from("drive_core_upload_sessions")
      .update({ storage_version_id: input.storageVersionId, updated_at: now })
      .eq("project_id", input.projectId)
      .eq("id", input.uploadId),
    db.from("drive_core_document_versions")
      .update({ storage_version_id: input.storageVersionId })
      .eq("project_id", input.projectId)
      .eq("id", input.versionId),
  ]);
  if (sessionResult.error) dbError("Az upload S3 VersionId nem menthető.", sessionResult.error);
  if (versionResult.error) dbError("A dokumentumverzió S3 VersionId nem menthető.", versionResult.error);
  return { recorded: true, storageVersionId: input.storageVersionId };
}
