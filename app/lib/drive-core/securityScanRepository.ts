import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DriveCoreRepositoryError } from "./errors";
import type { DriveSecurityScan, DriveSecurityScanStatus } from "./types";

type DbVersion = {
  id: string;
  project_id: string;
  document_id: string;
  version_number: number;
  sha256: string | null;
  size_bytes: number;
  storage_provider: string;
  storage_bucket: string | null;
  storage_key: string | null;
  status: string;
};

type DbUploadSession = {
  id: string;
  project_id: string;
  finalized_document_id: string | null;
  finalized_version_id: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
};

type StoredScan = {
  status?: string;
  attempt?: number;
  startedAt?: string | null;
  completedAt?: string | null;
  engine?: string | null;
  engineVersion?: string | null;
  signatureVersion?: string | null;
  signatureName?: string | null;
  sha256?: string | null;
  bytesScanned?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  scannerSource?: string | null;
};

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new DriveCoreRepositoryError(
      "A DRIVE biztonsági ellenőrzés adatbázis-kapcsolata nincs beállítva.",
      "DRIVE_SECURITY_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "dimpro-drive-security/0.5.0" } },
  });
}

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  throw new DriveCoreRepositoryError(
    message,
    candidate?.code || "DRIVE_SECURITY_DATABASE_ERROR",
    status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

function normalizeStatus(value: unknown): DriveSecurityScanStatus {
  const normalized = typeof value === "string" ? value.toUpperCase() : "PENDING";
  if (["PENDING", "SCANNING", "CLEAN", "INFECTED", "ERROR"].includes(normalized)) {
    return normalized as DriveSecurityScanStatus;
  }
  return "PENDING";
}

function mapScan(value: unknown): DriveSecurityScan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as StoredScan;
  return {
    status: normalizeStatus(row.status),
    attempt: Math.max(0, Number(row.attempt || 0)),
    startedAt: typeof row.startedAt === "string" ? row.startedAt : null,
    completedAt: typeof row.completedAt === "string" ? row.completedAt : null,
    engine: typeof row.engine === "string" ? row.engine : null,
    engineVersion: typeof row.engineVersion === "string" ? row.engineVersion : null,
    signatureVersion: typeof row.signatureVersion === "string" ? row.signatureVersion : null,
    signatureName: typeof row.signatureName === "string" ? row.signatureName : null,
    sha256: typeof row.sha256 === "string" ? row.sha256 : null,
    bytesScanned: Number.isFinite(Number(row.bytesScanned)) ? Number(row.bytesScanned) : null,
    errorCode: typeof row.errorCode === "string" ? row.errorCode : null,
    errorMessage: typeof row.errorMessage === "string" ? row.errorMessage : null,
    scannerSource: typeof row.scannerSource === "string" ? row.scannerSource : null,
  };
}

export async function getDriveVersionSecurityContext(input: {
  projectId: string;
  documentId: string;
  versionId: string;
}) {
  const client = getClient();
  const versionResult = await client
    .from("drive_core_document_versions")
    .select("id,project_id,document_id,version_number,sha256,size_bytes,storage_provider,storage_bucket,storage_key,status")
    .eq("project_id", input.projectId)
    .eq("document_id", input.documentId)
    .eq("id", input.versionId)
    .maybeSingle();
  if (versionResult.error) databaseError("A DRIVE dokumentumverzió biztonsági állapota nem tölthető be.", versionResult.error);
  if (!versionResult.data) {
    throw new DriveCoreRepositoryError("A biztonsági vizsgálatra kijelölt verzió nem található.", "DRIVE_SECURITY_VERSION_NOT_FOUND", 404);
  }
  const version = versionResult.data as DbVersion;

  const sessionResult = await client
    .from("drive_core_upload_sessions")
    .select("id,project_id,finalized_document_id,finalized_version_id,status,metadata")
    .eq("project_id", input.projectId)
    .eq("finalized_version_id", input.versionId)
    .eq("status", "FINALIZED")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionResult.error) databaseError("A DRIVE feltöltési munkamenet biztonsági állapota nem tölthető be.", sessionResult.error);
  const session = sessionResult.data as DbUploadSession | null;

  return {
    version: {
      id: version.id,
      projectId: version.project_id,
      documentId: version.document_id,
      versionNumber: Number(version.version_number || 0),
      sha256: version.sha256,
      sizeBytes: Number(version.size_bytes || 0),
      storageProvider: version.storage_provider,
      storageBucket: version.storage_bucket,
      storageKey: version.storage_key,
      status: version.status,
    },
    session: session ? { id: session.id, metadata: session.metadata || {} } : null,
    scan: mapScan(session?.metadata?.driveSecurityScan),
  };
}

async function updateScan(input: {
  projectId: string;
  sessionId: string;
  metadata: Record<string, unknown>;
  scan: DriveSecurityScan;
}) {
  const client = getClient();
  const nextMetadata = { ...input.metadata, driveSecurityScan: input.scan };
  const { data, error } = await client
    .from("drive_core_upload_sessions")
    .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
    .eq("project_id", input.projectId)
    .eq("id", input.sessionId)
    .eq("status", "FINALIZED")
    .select("id")
    .maybeSingle();
  if (error) databaseError("A DRIVE vírusvizsgálati állapot nem menthető.", error);
  if (!data) throw new DriveCoreRepositoryError("A DRIVE feltöltési munkamenet nem frissíthető.", "DRIVE_SECURITY_UPLOAD_SESSION_NOT_FOUND", 404);
  return input.scan;
}

export async function beginDriveVersionSecurityScan(input: {
  projectId: string;
  documentId: string;
  versionId: string;
}) {
  const context = await getDriveVersionSecurityContext(input);
  if (!context.session) {
    throw new DriveCoreRepositoryError(
      "Ehhez a dokumentumverzióhoz nincs valós objektumfeltöltési munkamenet, ezért vírusvizsgálat nem indítható.",
      "DRIVE_SECURITY_UPLOAD_SESSION_NOT_FOUND",
      409,
    );
  }
  if (context.version.status !== "QUARANTINED") {
    throw new DriveCoreRepositoryError(
      "Vírusvizsgálat csak karanténban lévő DRIVE verzión indítható.",
      "DRIVE_SECURITY_VERSION_NOT_QUARANTINED",
      409,
    );
  }
  if (context.version.storageProvider !== "S3" || !context.version.storageBucket || !context.version.storageKey) {
    throw new DriveCoreRepositoryError(
      "A DRIVE verzióhoz nincs vizsgálható privát objektumtár-hivatkozás.",
      "DRIVE_SECURITY_STORAGE_REFERENCE_MISSING",
      409,
    );
  }
  const currentAttempt = context.scan?.attempt || 0;
  const now = new Date().toISOString();
  const scan: DriveSecurityScan = {
    status: "SCANNING",
    attempt: currentAttempt + 1,
    startedAt: now,
    completedAt: null,
    engine: null,
    engineVersion: null,
    signatureVersion: null,
    signatureName: null,
    sha256: null,
    bytesScanned: null,
    errorCode: null,
    errorMessage: null,
    scannerSource: "shared-drop-clamd",
  };
  await updateScan({ projectId: input.projectId, sessionId: context.session.id, metadata: context.session.metadata, scan });
  return { ...context, scan };
}

export async function completeDriveVersionSecurityScan(input: {
  projectId: string;
  documentId: string;
  versionId: string;
  scan: Omit<DriveSecurityScan, "attempt" | "startedAt"> & { attempt?: number; startedAt?: string | null };
}) {
  const context = await getDriveVersionSecurityContext(input);
  if (!context.session) {
    throw new DriveCoreRepositoryError("A DRIVE feltöltési munkamenet nem található.", "DRIVE_SECURITY_UPLOAD_SESSION_NOT_FOUND", 404);
  }
  const previous = context.scan;
  const scan: DriveSecurityScan = {
    ...input.scan,
    attempt: input.scan.attempt || previous?.attempt || 1,
    startedAt: input.scan.startedAt || previous?.startedAt || new Date().toISOString(),
  };
  await updateScan({ projectId: input.projectId, sessionId: context.session.id, metadata: context.session.metadata, scan });
  return scan;
}

export async function requireDriveCleanSecurityScan(input: {
  projectId: string;
  documentId: string;
  versionId: string;
}) {
  const context = await getDriveVersionSecurityContext(input);
  const scan = context.scan;
  if (!scan || scan.status !== "CLEAN") {
    throw new DriveCoreRepositoryError(
      "A dokumentumverzió csak sikeres ClamAV vírusellenőrzés után hagyható jóvá.",
      "DRIVE_REVIEW_SECURITY_SCAN_REQUIRED",
      409,
      { securityStatus: scan?.status || "PENDING" },
    );
  }
  if (!context.version.sha256 || !scan.sha256 || context.version.sha256.toLowerCase() !== scan.sha256.toLowerCase()) {
    throw new DriveCoreRepositoryError(
      "A vírusellenőrzés SHA-256 lenyomata nem egyezik a dokumentumverzió hitelesített lenyomatával.",
      "DRIVE_REVIEW_SECURITY_HASH_MISMATCH",
      409,
    );
  }
  return { context, scan };
}
