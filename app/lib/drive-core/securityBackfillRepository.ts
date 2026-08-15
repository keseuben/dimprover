import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DriveCoreRepositoryError } from "./errors";

export type DriveSecurityBackfillState =
  | "LEGACY_AVAILABLE"
  | "BACKFILL_PENDING"
  | "CLEAN_AWAITING_APPROVAL";

export type DriveSecurityBackfillCandidate = {
  projectId: string;
  documentId: string;
  documentName: string;
  documentSource: "WEB" | "DESKTOP";
  versionId: string;
  versionNumber: number;
  revisionCode: string;
  versionStatus: "AVAILABLE" | "QUARANTINED";
  createdAt: string;
  uploadSessionId: string | null;
  scanStatus: "PENDING" | "SCANNING" | "CLEAN" | "INFECTED" | "ERROR";
  securityHashMatch: boolean;
  backfillMarked: boolean;
  canScan: boolean;
  state: DriveSecurityBackfillState;
  reason: string;
};

type DbVersion = {
  id: string;
  project_id: string;
  document_id: string;
  version_number: number;
  revision_code: string | null;
  sha256: string | null;
  status: string;
  storage_provider: string;
  storage_bucket: string | null;
  storage_key: string | null;
  created_at: string;
};

type DbDocument = {
  id: string;
  project_id: string;
  name: string;
  source: string;
  status: string;
};

type DbUploadSession = {
  id: string;
  project_id: string;
  finalized_document_id: string | null;
  finalized_version_id: string | null;
  status: string;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
};

type StoredScan = {
  status?: unknown;
  sha256?: unknown;
};

type StoredBackfill = {
  version?: unknown;
  previousStatus?: unknown;
  requarantinedAt?: unknown;
};

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) {
    throw new DriveCoreRepositoryError(
      "A DRIVE legacy security backfill adatbázis-kapcsolata nincs beállítva.",
      "DRIVE_SECURITY_BACKFILL_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "dimpro-drive-security-backfill/0.5.1" } },
  });
}

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  throw new DriveCoreRepositoryError(
    message,
    candidate?.code || "DRIVE_SECURITY_BACKFILL_DATABASE_ERROR",
    status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

function scanStatus(metadata: Record<string, unknown> | null) {
  const raw = metadata?.driveSecurityScan;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "PENDING" as const;
  const status = String((raw as StoredScan).status || "PENDING").toUpperCase();
  if (["SCANNING", "CLEAN", "INFECTED", "ERROR"].includes(status)) {
    return status as "SCANNING" | "CLEAN" | "INFECTED" | "ERROR";
  }
  return "PENDING" as const;
}

function scanSha256(metadata: Record<string, unknown> | null) {
  const raw = metadata?.driveSecurityScan;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as StoredScan).sha256;
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
}

function backfillMarker(metadata: Record<string, unknown> | null) {
  const raw = metadata?.driveSecurityBackfill;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as StoredBackfill;
}

function boundedLimit(value: number | undefined, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export async function listDriveLegacySecurityBackfillPlan(input: {
  projectId?: string | null;
  versionIds?: string[];
  limit?: number;
} = {}) {
  const client = getClient();
  const requestedVersionIds = unique((input.versionIds || []).map((value) => value.trim())).slice(0, 100);
  const limit = boundedLimit(input.limit);

  let versionQuery = client
    .from("drive_core_document_versions")
    .select("id,project_id,document_id,version_number,revision_code,sha256,status,storage_provider,storage_bucket,storage_key,created_at")
    .eq("storage_provider", "S3")
    .in("status", ["AVAILABLE", "QUARANTINED"])
    .order("created_at", { ascending: true })
    .limit(Math.max(limit * 4, 50));
  if (input.projectId?.trim()) versionQuery = versionQuery.eq("project_id", input.projectId.trim());
  if (requestedVersionIds.length) versionQuery = versionQuery.in("id", requestedVersionIds);

  const versionResult = await versionQuery;
  if (versionResult.error) databaseError("A legacy DRIVE verziók listázása sikertelen.", versionResult.error);
  const versions = (versionResult.data || []) as DbVersion[];
  if (!versions.length) {
    return {
      ok: true as const,
      version: "0.5.1",
      candidates: [] as DriveSecurityBackfillCandidate[],
      summary: { total: 0, legacyAvailable: 0, backfillPending: 0, cleanAwaitingApproval: 0, executable: 0, unscannable: 0 },
    };
  }

  const documentIds = unique(versions.map((row) => row.document_id));
  const sessionVersionIds = unique(versions.map((row) => row.id));
  const [documentResult, sessionResult] = await Promise.all([
    client
      .from("drive_core_documents")
      .select("id,project_id,name,source,status")
      .in("id", documentIds)
      .in("source", ["WEB", "DESKTOP"])
      .eq("status", "ACTIVE"),
    client
      .from("drive_core_upload_sessions")
      .select("id,project_id,finalized_document_id,finalized_version_id,status,completed_at,metadata")
      .in("finalized_version_id", sessionVersionIds)
      .eq("status", "FINALIZED")
      .order("completed_at", { ascending: false }),
  ]);
  if (documentResult.error) databaseError("A legacy DRIVE dokumentumok listázása sikertelen.", documentResult.error);
  if (sessionResult.error) databaseError("A legacy DRIVE upload sessionök listázása sikertelen.", sessionResult.error);

  const documents = new Map((documentResult.data || []).map((row) => [(row as DbDocument).id, row as DbDocument]));
  const sessions = new Map<string, DbUploadSession>();
  for (const row of (sessionResult.data || []) as DbUploadSession[]) {
    if (row.finalized_version_id && !sessions.has(row.finalized_version_id)) sessions.set(row.finalized_version_id, row);
  }

  const candidates: DriveSecurityBackfillCandidate[] = [];
  for (const version of versions) {
    const document = documents.get(version.document_id);
    if (!document || (document.source !== "WEB" && document.source !== "DESKTOP")) continue;
    const session = sessions.get(version.id) || null;
    const status = scanStatus(session?.metadata || null);
    const scannedSha256 = scanSha256(session?.metadata || null);
    const securityHashMatch = Boolean(version.sha256 && scannedSha256 && version.sha256.toLowerCase() === scannedSha256);
    const validCleanAudit = status === "CLEAN" && securityHashMatch;
    const marker = backfillMarker(session?.metadata || null);
    const hasStorageReference = Boolean(version.storage_bucket && version.storage_key);
    const canScan = Boolean(session && session.finalized_document_id === version.document_id && hasStorageReference);

    let state: DriveSecurityBackfillState | null = null;
    let reason = "";
    if (version.status === "AVAILABLE" && !validCleanAudit) {
      state = "LEGACY_AVAILABLE";
      reason = status === "CLEAN"
        ? "Az AVAILABLE verzió CLEAN auditja nem egyezik a hitelesített SHA-256 lenyomattal."
        : "Security V0.5 előtti AVAILABLE WEB/DESKTOP verzió CLEAN audit nélkül.";
    } else if (version.status === "QUARANTINED" && marker) {
      if (validCleanAudit) {
        state = "CLEAN_AWAITING_APPROVAL";
        reason = "Legacy backfill scan CLEAN és SHA-256 egyező; külön emberi APPROVE szükséges.";
      } else {
        state = "BACKFILL_PENDING";
        reason = "Legacy verzió már visszakerült karanténba, a security scan futtatása vagy újrapróbálása szükséges.";
      }
    }
    if (!state) continue;

    candidates.push({
      projectId: version.project_id,
      documentId: version.document_id,
      documentName: document.name,
      documentSource: document.source as "WEB" | "DESKTOP",
      versionId: version.id,
      versionNumber: Number(version.version_number || 0),
      revisionCode: version.revision_code || "",
      versionStatus: version.status as "AVAILABLE" | "QUARANTINED",
      createdAt: version.created_at,
      uploadSessionId: session?.id || null,
      scanStatus: status,
      securityHashMatch,
      backfillMarked: Boolean(marker),
      canScan,
      state,
      reason: canScan ? reason : `${reason} A hitelesített FINALIZED upload session vagy S3 hivatkozás hiányzik; automatikus scan nem indítható.`,
    });
    if (candidates.length >= limit) break;
  }

  return {
    ok: true as const,
    version: "0.5.1",
    candidates,
    summary: {
      total: candidates.length,
      legacyAvailable: candidates.filter((item) => item.state === "LEGACY_AVAILABLE").length,
      backfillPending: candidates.filter((item) => item.state === "BACKFILL_PENDING").length,
      cleanAwaitingApproval: candidates.filter((item) => item.state === "CLEAN_AWAITING_APPROVAL").length,
      executable: candidates.filter((item) => item.canScan && item.state !== "CLEAN_AWAITING_APPROVAL").length,
      unscannable: candidates.filter((item) => !item.canScan).length,
    },
  };
}

async function ensureBackfillAudit(candidate: DriveSecurityBackfillCandidate, actorUserId: string) {
  const client = getClient();
  const auditId = `drive-sec-backfill-audit-${candidate.versionId}`;
  const changeId = `drive-sec-backfill-change-${candidate.versionId}`;
  const metadata = {
    documentId: candidate.documentId,
    versionId: candidate.versionId,
    version: candidate.versionNumber,
    previousStatus: "AVAILABLE",
    targetStatus: "QUARANTINED",
    source: candidate.documentSource,
    securityBackfillVersion: "0.5.1",
  };
  const [auditResult, changeResult] = await Promise.all([
    client.from("project_core_audit_events").upsert({
      id: auditId,
      project_id: candidate.projectId,
      actor_user_id: actorUserId,
      event_type: "DRIVE_SECURITY_LEGACY_REQUARANTINED",
      entity_type: "document_version",
      entity_id: candidate.versionId,
      summary: `Legacy DRIVE verzió visszahelyezve biztonsági karanténba: ${candidate.documentName} · V${candidate.versionNumber}`,
      metadata,
    }, { onConflict: "id", ignoreDuplicates: true }),
    client.from("drive_core_change_events").upsert({
      id: changeId,
      project_id: candidate.projectId,
      event_type: "SECURITY_LEGACY_REQUARANTINED",
      entity_type: "document_version",
      entity_id: candidate.versionId,
      payload: metadata,
      actor_user_id: actorUserId,
    }, { onConflict: "id", ignoreDuplicates: true }),
  ]);
  if (auditResult.error) databaseError("A legacy security backfill projektaudit rögzítése sikertelen.", auditResult.error);
  if (changeResult.error) databaseError("A legacy security backfill Drive change event rögzítése sikertelen.", changeResult.error);
}

export async function requarantineDriveLegacyVersion(input: {
  projectId: string;
  documentId: string;
  versionId: string;
  actorUserId: string;
}) {
  const plan = await listDriveLegacySecurityBackfillPlan({
    projectId: input.projectId,
    versionIds: [input.versionId],
    limit: 5,
  });
  const candidate = plan.candidates.find((item) => item.versionId === input.versionId && item.documentId === input.documentId);
  if (!candidate) {
    throw new DriveCoreRepositoryError(
      "A kiválasztott verzió nem legacy Security V0.5 backfill jelölt.",
      "DRIVE_SECURITY_BACKFILL_NOT_CANDIDATE",
      409,
    );
  }
  if (!candidate.canScan || !candidate.uploadSessionId) {
    throw new DriveCoreRepositoryError(
      "A legacy verzióhoz nincs hitelesített FINALIZED upload session vagy vizsgálható S3 objektum.",
      "DRIVE_SECURITY_BACKFILL_UNSCANNABLE",
      409,
    );
  }

  if (candidate.state !== "LEGACY_AVAILABLE") {
    await ensureBackfillAudit(candidate, input.actorUserId);
    return { ok: true as const, idempotent: true, candidate };
  }

  const client = getClient();
  const sessionResult = await client
    .from("drive_core_upload_sessions")
    .select("id,metadata")
    .eq("project_id", input.projectId)
    .eq("id", candidate.uploadSessionId)
    .eq("status", "FINALIZED")
    .maybeSingle();
  if (sessionResult.error) databaseError("A legacy upload session nem tölthető be.", sessionResult.error);
  if (!sessionResult.data) {
    throw new DriveCoreRepositoryError("A legacy upload session időközben eltűnt.", "DRIVE_SECURITY_BACKFILL_UPLOAD_SESSION_NOT_FOUND", 409);
  }

  const now = new Date().toISOString();
  const currentMetadata = (sessionResult.data.metadata && typeof sessionResult.data.metadata === "object")
    ? sessionResult.data.metadata as Record<string, unknown>
    : {};
  const marker = {
    version: "0.5.1",
    previousStatus: "AVAILABLE",
    requarantinedAt: now,
    actorUserId: input.actorUserId,
    reason: "Security V0.5 legacy WEB/DESKTOP re-quarantine backfill",
  };
  const markerUpdate = await client
    .from("drive_core_upload_sessions")
    .update({ metadata: { ...currentMetadata, driveSecurityBackfill: marker }, updated_at: now })
    .eq("project_id", input.projectId)
    .eq("id", candidate.uploadSessionId)
    .eq("status", "FINALIZED")
    .select("id")
    .maybeSingle();
  if (markerUpdate.error) databaseError("A legacy security backfill marker nem menthető.", markerUpdate.error);
  if (!markerUpdate.data) {
    throw new DriveCoreRepositoryError("A legacy security backfill upload session nem frissíthető.", "DRIVE_SECURITY_BACKFILL_UPLOAD_SESSION_NOT_FOUND", 409);
  }

  const versionUpdate = await client
    .from("drive_core_document_versions")
    .update({ status: "QUARANTINED" })
    .eq("project_id", input.projectId)
    .eq("document_id", input.documentId)
    .eq("id", input.versionId)
    .eq("status", "AVAILABLE")
    .select("id,status")
    .maybeSingle();
  if (versionUpdate.error) databaseError("A legacy verzió visszakaranténozása sikertelen.", versionUpdate.error);
  if (!versionUpdate.data) {
    const current = await client
      .from("drive_core_document_versions")
      .select("id,status")
      .eq("project_id", input.projectId)
      .eq("document_id", input.documentId)
      .eq("id", input.versionId)
      .maybeSingle();
    if (current.error) databaseError("A legacy verzió állapota nem ellenőrizhető.", current.error);
    if (current.data?.status !== "QUARANTINED") {
      throw new DriveCoreRepositoryError(
        "A legacy verzió állapota időközben megváltozott; backfill megszakítva.",
        "DRIVE_SECURITY_BACKFILL_STATUS_CONFLICT",
        409,
      );
    }
  }

  const documentTouch = await client
    .from("drive_core_documents")
    .update({ updated_at: now })
    .eq("project_id", input.projectId)
    .eq("id", input.documentId);
  if (documentTouch.error) databaseError("A legacy dokumentum frissítési időpontja nem menthető.", documentTouch.error);

  const nextCandidate: DriveSecurityBackfillCandidate = {
    ...candidate,
    versionStatus: "QUARANTINED",
    backfillMarked: true,
    state: "BACKFILL_PENDING",
    reason: "Legacy verzió visszakerült karanténba; ClamAV scan szükséges.",
  };
  await ensureBackfillAudit(nextCandidate, input.actorUserId);
  return { ok: true as const, idempotent: false, candidate: nextCandidate };
}
