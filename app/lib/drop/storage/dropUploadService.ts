import { createHash, randomUUID } from "node:crypto";
import { assertDropFeatureEnabled, getDropFeatureState } from "../dropFeatureFlags";
import { getDropSupabaseClient, writeDropEvent } from "../dropRepository";
import { validateDropUploadRulesAcceptance } from "../dropUploadRules";
import { sendDropUploadCompleteNotifications } from "../dropEmail";
import { dispatchDropFileScan } from "../worker/dropScanDispatch";
import { invalidateDropFinalReport } from "../report/dropReportRepository";
import { listVisibleDropSpacePackages, resolveDropSpaceSession } from "../dropSpaceRepository";
import type { DropAccessGrant, DropUploadInitResult } from "../dropTypes";
import { inspectDropIncomingFile, sanitizeDropFileName } from "./dropFileSecurity";
import {
  createDropStorageKey,
  getDropIncomingPath,
  moveDropFileToQuarantine,
  removeDropStoredFile,
  streamDropIncomingFile,
} from "./dropLocalStorage";
import {
  assembleDropUploadParts,
  removeDropMultipartSession,
  streamDropUploadPart,
} from "./dropMultipartLocalStorage";
import {
  abortDropS3Multipart,
  completeDropS3Multipart,
  createDropS3Multipart,
  createDropS3PartUrl,
  deleteDropS3Object,
  headDropS3Object,
  inspectDropS3Part,
} from "./dropS3Storage";
import { ensureDropLocalStorage, getDropStorageConfig, getDropStorageSafeStatus } from "./dropStorageConfig";
import {
  abortDropUpload,
  completeDropObjectCleanup,
  finalizeDropMultipartReceived,
  finalizeDropQuarantineUpload,
  finalizeDropS3QuarantineUpload,
  findReusableDropUpload,
  getDropMultipartSchemaHealth,
  getDropStorageSchemaHealth,
  getDropUploadBundle,
  initializeDropUploadAtomic,
  listDropPackageFiles,
  listDropUploadParts,
  listPendingDropObjectCleanup,
  markDropUploadPartReceived,
  markDropUploadReceived,
  queueDropObjectCleanup,
} from "./dropStorageRepository";
import { assertDropUploadSessionTokenReady, createDropUploadSessionToken, verifyDropUploadSessionToken } from "./dropUploadToken";

export type DropResolvedSpaceSession = Awaited<ReturnType<typeof resolveDropSpaceSession>>;

function createServiceError(message: string, code: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { code, status });
  return error;
}

function asFailure(error: unknown) {
  const candidate = error as { message?: string; code?: string; status?: number } | null;
  return {
    message: candidate?.message || "A feltöltés váratlan hiba miatt leállt.",
    code: candidate?.code || "DROP_UPLOAD_FAILED",
    status: typeof candidate?.status === "number" ? candidate.status : 500,
  };
}

async function assertQuarantineUploadReady() {
  assertDropFeatureEnabled("storageCoreEnabled");
  assertDropFeatureEnabled("quarantineUploadEnabled");
  const [schema, config] = await Promise.all([
    getDropStorageSchemaHealth(),
    Promise.resolve(getDropStorageConfig()),
  ]);
  const safeStatus = getDropStorageSafeStatus(config);
  if (!schema.ready) {
    throw createServiceError("A DROP 0.3.3 privát tárhely-séma még nincs alkalmazva.", "DROP_STORAGE_SCHEMA_NOT_READY", 503);
  }
  if (!safeStatus.storageConfigured || config.mode === "disabled") {
    throw createServiceError("A privát Drop tárhely nincs biztonságosan konfigurálva.", "DROP_STORAGE_NOT_CONFIGURED", 503);
  }
  if (config.provider === "local-private") {
    await ensureDropLocalStorage(config);
  } else if (!safeStatus.s3Configured) {
    throw createServiceError("A Hetzner Object Storage még nincs konfigurálva.", "DROP_S3_NOT_CONFIGURED", 503);
  }
  return { schema, config, safeStatus };
}

function validateUploadInput(input: unknown) {
  const value = input as Record<string, unknown> | null;
  if (!value || typeof value !== "object") {
    throw createServiceError("Hiányzó fájlmetaadatok.", "DROP_UPLOAD_INPUT_INVALID", 400);
  }
  const legacyFileName = String(value.fileName || "").trim();
  const originalFileName = String(value.originalFileName || legacyFileName).trim();
  const displayFileName = String(value.displayFileName || legacyFileName).trim();
  const sizeBytes = Number(value.sizeBytes || 0);
  const sourceOriginalSizeBytes = Number(value.sourceOriginalSizeBytes || sizeBytes);
  const mimeType = String(value.mimeType || "application/octet-stream").trim().slice(0, 180) || "application/octet-stream";
  const groupId = value.groupId ? String(value.groupId).trim() : null;
  const clientUploadId = value.clientUploadId ? String(value.clientUploadId).trim().slice(0, 120) : `web_${randomUUID()}`;
  const rulesAcceptance = validateDropUploadRulesAcceptance(value);
  if (!originalFileName || !displayFileName || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw createServiceError("A fájlnév vagy fájlméret érvénytelen.", "DROP_UPLOAD_INPUT_INVALID", 400);
  }
  if (!Number.isSafeInteger(sourceOriginalSizeBytes) || sourceOriginalSizeBytes <= 0) {
    throw createServiceError("Az eredeti fájlméret érvénytelen.", "DROP_UPLOAD_SOURCE_SIZE_INVALID", 400);
  }
  if (groupId && !/^[0-9a-f-]{36}$/i.test(groupId)) {
    throw createServiceError("A fájlcsoport azonosítója érvénytelen.", "DROP_UPLOAD_GROUP_INVALID", 400);
  }
  return { originalFileName, displayFileName, sizeBytes, sourceOriginalSizeBytes, mimeType, groupId, clientUploadId, rulesAcceptance };
}


export async function assertDropSpacePackageUploadAccess(
  session: DropResolvedSpaceSession,
  packageId: string,
) {
  if (session.runtimeMode !== "writable" || !session.permissions.includes("file.upload")) {
    throw createServiceError("A tértagság jelenleg nem tölthet fel fájlt.", "DROP_SPACE_UPLOAD_FORBIDDEN", 403);
  }
  const visiblePackages = await listVisibleDropSpacePackages(session);
  const packageItem = visiblePackages.find((item) => item.id === packageId);
  if (!packageItem) {
    throw createServiceError("A Drop csomag nem található vagy nem látható.", "DROP_PACKAGE_NOT_FOUND", 404);
  }
  const canUpload = session.permissions.includes("package.read_all")
    || packageItem.isOwn
    || (packageItem.visibility === "space_members" && session.permissions.includes("file.upload"))
    || Boolean(packageItem.memberAccess?.canUpload);
  if (!canUpload) {
    throw createServiceError("Ehhez a csomaghoz nincs feltöltési jogosultság.", "DROP_PACKAGE_UPLOAD_FORBIDDEN", 403);
  }
  return packageItem;
}

function validateCapabilityUploader(input: unknown) {
  const value = input as Record<string, unknown> | null;
  const uploadedByName = String(value?.uploadedByName || "").trim().replace(/[\r\n]/g, " ").slice(0, 160);
  const uploadedByEmail = String(value?.uploadedByEmail || "").trim().toLowerCase().slice(0, 254);
  if (!uploadedByName) {
    throw createServiceError("A feltöltő nevét meg kell adni.", "DROP_UPLOAD_ACTOR_NAME_REQUIRED", 400);
  }
  if (uploadedByEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(uploadedByEmail)) {
    throw createServiceError("A feltöltő e-mail-címe érvénytelen.", "DROP_UPLOAD_ACTOR_EMAIL_INVALID", 400);
  }
  return { uploadedByName, uploadedByEmail: uploadedByEmail || null };
}

async function recordDropUploadRulesAcceptance(input: {
  packageId: string;
  fileId: string;
  sessionId: string;
  authorizationMode: "space_session" | "capability_token";
  actorName: string;
  actorEmail: string | null;
  rulesVersion: string;
  rulesAcceptedAt: string;
  protocol: "single" | "multipart";
  resumed: boolean;
  sourceOriginalSizeBytes: number;
  uploadSizeBytes: number;
}) {
  await writeDropEvent({
    packageId: input.packageId,
    fileId: input.fileId,
    eventType: input.resumed ? "upload.rules_reconfirmed" : "upload.rules_accepted",
    actorName: input.actorName,
    actorEmail: input.actorEmail,
    payload: {
      sessionId: input.sessionId,
      authorizationMode: input.authorizationMode,
      rulesVersion: input.rulesVersion,
      rulesAcceptedAt: input.rulesAcceptedAt,
      protocol: input.protocol,
      resumed: input.resumed,
      acceptanceRequired: true,
      sourceOriginalSizeBytes: input.sourceOriginalSizeBytes,
      uploadSizeBytes: input.uploadSizeBytes,
      optimized: input.sourceOriginalSizeBytes > input.uploadSizeBytes,
      savedBytes: Math.max(0, input.sourceOriginalSizeBytes - input.uploadSizeBytes),
      savedPercent: input.sourceOriginalSizeBytes > 0
        ? Math.max(0, Math.round((1 - input.uploadSizeBytes / input.sourceOriginalSizeBytes) * 100))
        : 0,
    },
  });
}

type InitializeUploadCoreInput = {
  packageId: string;
  groupId: string | null;
  authorizationMode: "space_session" | "capability_token";
  createdByMembershipId: string | null;
  uploadedByName: string;
  uploadedByEmail: string | null;
  normalized: ReturnType<typeof validateUploadInput>;
  capabilityExpiresAt?: string;
};

function buildUploadInitResult(input: {
  created: { file: Awaited<ReturnType<typeof initializeDropUploadAtomic>>["file"]; session: Awaited<ReturnType<typeof initializeDropUploadAtomic>>["session"] };
  expiresAt: string;
  maxBytes: number;
  protocol: "single" | "multipart";
  completedPartNumbers: number[];
}): DropUploadInitResult {
  const { created } = input;
  const uploadToken = createDropUploadSessionToken({
    sessionId: created.session.id,
    fileId: created.file.id,
    packageId: created.file.package_id,
    expiresAt: input.expiresAt,
  });
  return {
    file: {
      id: created.file.id,
      packageId: created.file.package_id,
      displayName: created.file.display_name,
      sizeBytes: created.file.size_original_bytes,
      uploadStatus: created.file.upload_status,
    },
    session: {
      id: created.session.id,
      status: created.session.status,
      totalBytes: created.session.total_bytes,
      uploadedBytes: created.session.uploaded_bytes,
      chunkSizeBytes: created.session.chunk_size_bytes,
      totalParts: created.session.total_parts,
      completedParts: created.session.completed_parts,
      expiresAt: created.session.expires_at,
    },
    protocol: input.protocol,
    storageProvider: created.session.storage_provider === "s3-compatible" ? "s3-compatible" : "local-private",
    completedPartNumbers: input.completedPartNumbers,
    uploadToken,
    uploadUrl: `/api/drop/uploads/${created.session.id}/content`,
    partUrlTemplate: `/api/drop/uploads/${created.session.id}/parts/{partNumber}`,
    partSignUrlTemplate: `/api/drop/uploads/${created.session.id}/parts/{partNumber}`,
    partConfirmUrlTemplate: `/api/drop/uploads/${created.session.id}/parts/{partNumber}`,
    stateUrl: `/api/drop/uploads/${created.session.id}/parts`,
    completeUrl: `/api/drop/uploads/${created.session.id}/complete`,
    abortUrl: `/api/drop/uploads/${created.session.id}`,
    expiresAt: input.expiresAt,
    maxBytes: input.maxBytes,
    quarantineOnly: true,
  };
}

async function initializeDropUploadCore(input: InitializeUploadCoreInput): Promise<DropUploadInitResult> {
  // Fail fast before creating S3 multipart / DB rows if the secure session signer is unavailable.
  assertDropUploadSessionTokenReady();
  const { config } = await assertQuarantineUploadReady();
  const feature = getDropFeatureState();
  const multipartSchema = await getDropMultipartSchemaHealth();
  const resumableReady = Boolean(feature.flags.resumableUploadEnabled && multipartSchema.ready);
  const maxBytes = resumableReady ? config.maxFileBytes : config.maxPartBytes;
  if (input.normalized.sizeBytes > maxBytes) {
    throw createServiceError(
      resumableReady ? "A fájl meghaladja az 500 MB-os fájlméretkorlátot." : "A fájl meghaladja az egykéréses feltöltési korlátot.",
      "DROP_UPLOAD_FILE_TOO_LARGE",
      413,
    );
  }
  const protocol: "single" | "multipart" = resumableReady ? "multipart" : "single";
  const chunkSizeBytes = protocol === "multipart"
    ? Math.min(config.chunkSizeBytes, input.normalized.sizeBytes)
    : input.normalized.sizeBytes;
  const originalFileName = sanitizeDropFileName(input.normalized.originalFileName);
  const fileName = sanitizeDropFileName(input.normalized.displayFileName);
  const expiresAt = new Date(Math.min(
    input.capabilityExpiresAt ? new Date(input.capabilityExpiresAt).getTime() : Number.POSITIVE_INFINITY,
    Date.now() + (protocol === "multipart" ? 24 * 60 * 60_000 : 30 * 60_000),
  )).toISOString();

  if (protocol === "multipart") {
    const reusable = await findReusableDropUpload({ packageId: input.packageId, clientUploadId: input.normalized.clientUploadId });
    if (reusable) {
      if (reusable.file.size_original_bytes !== input.normalized.sizeBytes || reusable.file.display_name !== fileName.displayName) {
        throw createServiceError("A korábbi munkamenet más fájlhoz tartozik.", "DROP_UPLOAD_RESUME_FILE_MISMATCH", 409);
      }
      await recordDropUploadRulesAcceptance({
        packageId: input.packageId,
        fileId: reusable.file.id,
        sessionId: reusable.session.id,
        authorizationMode: input.authorizationMode,
        actorName: input.uploadedByName,
        actorEmail: input.uploadedByEmail,
        rulesVersion: input.normalized.rulesAcceptance.version,
        rulesAcceptedAt: input.normalized.rulesAcceptance.acceptedAt,
        protocol,
        resumed: true,
        sourceOriginalSizeBytes: input.normalized.sourceOriginalSizeBytes,
        uploadSizeBytes: input.normalized.sizeBytes,
      });
      return buildUploadInitResult({
        created: { file: reusable.file, session: reusable.session },
        expiresAt: reusable.session.expires_at,
        maxBytes,
        protocol,
        completedPartNumbers: reusable.parts.filter((part) => part.status === "completed").map((part) => Number(part.part_number)),
      });
    }
  }

  const fileId = randomUUID();
  const sessionId = randomUUID();
  const generatedName = `${Date.now()}_${fileId.slice(0, 8)}.${fileName.extension}`;
  const storageKey = createDropStorageKey({ packageId: input.packageId, fileId, generatedName });
  let storageMultipartId: string | null = null;
  if (protocol === "multipart" && config.provider === "s3-compatible") {
    storageMultipartId = (await createDropS3Multipart({ storageKey, contentType: input.normalized.mimeType })).uploadId;
  }
  try {
    const created = await initializeDropUploadAtomic({
      packageId: input.packageId,
      fileId,
      sessionId,
      groupId: input.groupId,
      createdByMembershipId: input.createdByMembershipId,
      authorizationMode: input.authorizationMode,
      clientUploadId: input.normalized.clientUploadId,
      originalName: originalFileName.originalName,
      displayName: fileName.displayName,
      generatedName,
      extension: fileName.extension,
      mimeType: input.normalized.mimeType,
      sizeBytes: input.normalized.sizeBytes,
      storageProvider: config.provider,
      storageBucket: config.bucket,
      storageKey,
      storageMultipartId,
      chunkSizeBytes,
      expiresAt,
      isImage: fileName.isImage,
      isZip: fileName.isZip,
      uploadedByName: input.uploadedByName,
      uploadedByEmail: input.uploadedByEmail,
    });
    try {
      await recordDropUploadRulesAcceptance({
        packageId: input.packageId,
        fileId: created.file.id,
        sessionId: created.session.id,
        authorizationMode: input.authorizationMode,
        actorName: input.uploadedByName,
        actorEmail: input.uploadedByEmail,
        rulesVersion: input.normalized.rulesAcceptance.version,
        rulesAcceptedAt: input.normalized.rulesAcceptance.acceptedAt,
        protocol,
        resumed: false,
        sourceOriginalSizeBytes: input.normalized.sourceOriginalSizeBytes,
        uploadSizeBytes: input.normalized.sizeBytes,
      });
    } catch (auditError) {
      await abortDropUpload({
        sessionId: created.session.id,
        failureCode: "DROP_UPLOAD_RULES_AUDIT_FAILED",
        failureMessage: "A feltöltési szabályzat elfogadása nem naplózható.",
      }).catch(() => undefined);
      throw auditError;
    }
    const parts = protocol === "multipart" ? await listDropUploadParts(created.session.id) : [];
    return buildUploadInitResult({ created, expiresAt, maxBytes, protocol, completedPartNumbers: parts.filter((part) => part.status === "completed").map((part) => Number(part.part_number)) });
  } catch (error) {
    if (storageMultipartId) await abortDropS3Multipart({ storageKey, uploadId: storageMultipartId }).catch(() => undefined);
    throw error;
  }
}

export async function initializeDropCapabilityUpload(input: {
  grant: DropAccessGrant;
  body: unknown;
}): Promise<DropUploadInitResult> {
  if (input.grant.purpose !== "upload") {
    throw createServiceError("Ez a capability nem használható feltöltésre.", "DROP_TOKEN_PURPOSE_MISMATCH", 403);
  }
  const normalized = validateUploadInput(input.body);
  const actor = validateCapabilityUploader(input.body);
  return initializeDropUploadCore({
    packageId: input.grant.packageId,
    groupId: normalized.groupId,
    authorizationMode: "capability_token",
    createdByMembershipId: null,
    uploadedByName: actor.uploadedByName,
    uploadedByEmail: actor.uploadedByEmail,
    normalized,
    capabilityExpiresAt: input.grant.expiresAt,
  });
}

export async function initializeDropSpaceUpload(input: {
  session: DropResolvedSpaceSession;
  packageId: string;
  body: unknown;
}): Promise<DropUploadInitResult> {
  await assertDropSpacePackageUploadAccess(input.session, input.packageId);
  const normalized = validateUploadInput(input.body);
  return initializeDropUploadCore({
    packageId: input.packageId,
    groupId: normalized.groupId,
    authorizationMode: "space_session",
    createdByMembershipId: input.session.membership.id,
    uploadedByName: input.session.membership.displayName,
    uploadedByEmail: input.session.membership.email,
    normalized,
  });
}

function assertTokenMatchesBundle(rawToken: string, uploadId: string, bundle: NonNullable<Awaited<ReturnType<typeof getDropUploadBundle>>>) {
  const payload = verifyDropUploadSessionToken(rawToken);
  if (
    payload.sessionId !== uploadId
    || payload.sessionId !== bundle.session.id
    || payload.fileId !== bundle.file.id
    || payload.packageId !== bundle.package.id
  ) {
    throw createServiceError("A feltöltési token nem ehhez a munkamenethez tartozik.", "DROP_UPLOAD_TOKEN_CONTEXT_MISMATCH", 403);
  }
  return payload;
}

export async function receiveDropUploadContent(input: {
  uploadId: string;
  rawToken: string;
  body: ReadableStream<Uint8Array> | null;
  contentLength?: number | null;
}) {
  await assertQuarantineUploadReady();
  const bundle = await getDropUploadBundle(input.uploadId);
  if (!bundle) throw createServiceError("A feltöltési munkamenet nem található.", "DROP_UPLOAD_SESSION_NOT_FOUND", 404);
  assertTokenMatchesBundle(input.rawToken, input.uploadId, bundle);
  if (bundle.session.total_parts > 1) {
    throw createServiceError("Ez a munkamenet csak darabolt feltöltéssel használható.", "DROP_UPLOAD_MULTIPART_REQUIRED", 409);
  }
  if (input.contentLength != null && input.contentLength !== bundle.session.total_bytes) {
    throw createServiceError("A HTTP tartalomhossz eltér a munkamenet fájlméretétől.", "DROP_UPLOAD_CONTENT_LENGTH_MISMATCH", 400);
  }

  try {
    const streamed = await streamDropIncomingFile({
      sessionId: bundle.session.id,
      body: input.body,
      expectedBytes: bundle.session.total_bytes,
    });
    const received = await markDropUploadReceived({
      sessionId: bundle.session.id,
      receivedBytes: streamed.receivedBytes,
      sha256: streamed.sha256,
    });
    return { ...received, sha256: streamed.sha256, receivedBytes: streamed.receivedBytes };
  } catch (error) {
    const failure = asFailure(error);
    await removeDropStoredFile({ sessionId: bundle.session.id }).catch(() => undefined);
    await abortDropUpload({
      sessionId: bundle.session.id,
      failureCode: failure.code,
      failureMessage: failure.message,
    }).catch(() => undefined);
    throw error;
  }
}

export async function getDropUploadResumeState(input: { uploadId: string; rawToken: string }) {
  await assertQuarantineUploadReady();
  const bundle = await getDropUploadBundle(input.uploadId);
  if (!bundle) throw createServiceError("A feltöltési munkamenet nem található.", "DROP_UPLOAD_SESSION_NOT_FOUND", 404);
  assertTokenMatchesBundle(input.rawToken, input.uploadId, bundle);
  const parts = await listDropUploadParts(input.uploadId);
  return {
    session: {
      id: bundle.session.id,
      status: bundle.session.status,
      totalBytes: bundle.session.total_bytes,
      uploadedBytes: bundle.session.uploaded_bytes,
      chunkSizeBytes: bundle.session.chunk_size_bytes,
      totalParts: bundle.session.total_parts,
      completedParts: bundle.session.completed_parts,
      expiresAt: bundle.session.expires_at,
    },
    parts: parts.map((part) => ({
      partNumber: Number(part.part_number),
      sizeBytes: Number(part.size_bytes),
      status: String(part.status),
      completed: part.status === "completed",
    })),
  };
}

export async function createDropS3UploadPartUrl(input: {
  uploadId: string;
  partNumber: number;
  rawToken: string;
}) {
  const { config } = await assertQuarantineUploadReady();
  if (config.provider !== "s3-compatible") {
    throw createServiceError("A DROP S3 adapter nem aktív.", "DROP_S3_NOT_CONFIGURED", 503);
  }
  const bundle = await getDropUploadBundle(input.uploadId);
  if (!bundle) throw createServiceError("A feltöltési munkamenet nem található.", "DROP_UPLOAD_SESSION_NOT_FOUND", 404);
  assertTokenMatchesBundle(input.rawToken, input.uploadId, bundle);
  if (bundle.session.storage_provider !== "s3-compatible" || !bundle.session.storage_multipart_id) {
    throw createServiceError("Ez nem S3 multipart munkamenet.", "DROP_S3_SESSION_NOT_FINALIZABLE", 409);
  }
  const parts = await listDropUploadParts(input.uploadId);
  const part = parts.find((candidate) => Number(candidate.part_number) === input.partNumber);
  if (!part) throw createServiceError("A feltöltési rész nem található.", "DROP_UPLOAD_PART_NOT_FOUND", 404);
  if (part.status === "completed") {
    return { alreadyCompleted: true, partNumber: input.partNumber, sizeBytes: Number(part.size_bytes), etag: part.etag || null };
  }
  const signed = await createDropS3PartUrl({
    storageKey: bundle.file.storage_key,
    uploadId: bundle.session.storage_multipart_id,
    partNumber: input.partNumber,
    expiresIn: config.signedUrlTtlSeconds,
  });
  return {
    alreadyCompleted: false,
    partNumber: input.partNumber,
    sizeBytes: Number(part.size_bytes),
    method: signed.method,
    url: signed.url,
    expiresAt: signed.expiresAt,
    headers: { "content-type": "application/octet-stream" },
  };
}

export async function confirmDropS3UploadPart(input: {
  uploadId: string;
  partNumber: number;
  rawToken: string;
  checksum: string;
  etag?: string | null;
  receivedBytes: number;
}) {
  await assertQuarantineUploadReady();
  const checksum = input.checksum.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(checksum)) {
    throw createServiceError("A feltöltési rész SHA-256 értéke érvénytelen.", "DROP_UPLOAD_PART_CHECKSUM_INVALID", 400);
  }
  const bundle = await getDropUploadBundle(input.uploadId);
  if (!bundle) throw createServiceError("A feltöltési munkamenet nem található.", "DROP_UPLOAD_SESSION_NOT_FOUND", 404);
  assertTokenMatchesBundle(input.rawToken, input.uploadId, bundle);
  if (bundle.session.storage_provider !== "s3-compatible" || !bundle.session.storage_multipart_id) {
    throw createServiceError("Ez nem S3 multipart munkamenet.", "DROP_S3_SESSION_NOT_FINALIZABLE", 409);
  }
  const expectedParts = await listDropUploadParts(input.uploadId);
  const expected = expectedParts.find((candidate) => Number(candidate.part_number) === input.partNumber);
  if (!expected) throw createServiceError("A feltöltési rész nem található.", "DROP_UPLOAD_PART_NOT_FOUND", 404);
  const inspected = await inspectDropS3Part({
    storageKey: bundle.file.storage_key,
    uploadId: bundle.session.storage_multipart_id,
    partNumber: input.partNumber,
  });
  if (inspected.sizeBytes !== Number(expected.size_bytes) || input.receivedBytes !== Number(expected.size_bytes)) {
    throw createServiceError("Az S3 fájlrész mérete eltér a várt mérettől.", "DROP_UPLOAD_PART_SIZE_MISMATCH", 409);
  }
  const clientEtag = (input.etag || "").trim().replace(/^"|"$/g, "");
  if (clientEtag && clientEtag !== inspected.etag) {
    throw createServiceError("Az S3 fájlrész ETag értéke nem egyezik.", "DROP_S3_PART_ETAG_MISMATCH", 409);
  }
  const recorded = await markDropUploadPartReceived({
    sessionId: input.uploadId,
    partNumber: input.partNumber,
    receivedBytes: inspected.sizeBytes,
    checksum,
    etag: inspected.etag,
  });
  return {
    partNumber: input.partNumber,
    receivedBytes: inspected.sizeBytes,
    etag: inspected.etag,
    completedParts: recorded.session.completed_parts,
    totalParts: recorded.session.total_parts,
    uploadedBytes: recorded.session.uploaded_bytes,
    totalBytes: recorded.session.total_bytes,
    allPartsReceived: recorded.allPartsReceived,
  };
}

export async function receiveDropUploadPart(input: {
  uploadId: string;
  partNumber: number;
  rawToken: string;
  body: ReadableStream<Uint8Array> | null;
  contentLength?: number | null;
}) {
  const { config } = await assertQuarantineUploadReady();
  assertDropFeatureEnabled("resumableUploadEnabled");
  const multipartSchema = await getDropMultipartSchemaHealth();
  if (!multipartSchema.ready) throw createServiceError("A DROP 0.3.4 multipart séma még nincs alkalmazva.", "DROP_MULTIPART_SCHEMA_NOT_READY", 503);
  const bundle = await getDropUploadBundle(input.uploadId);
  if (!bundle) throw createServiceError("A feltöltési munkamenet nem található.", "DROP_UPLOAD_SESSION_NOT_FOUND", 404);
  assertTokenMatchesBundle(input.rawToken, input.uploadId, bundle);
  if (bundle.session.total_parts <= 1) throw createServiceError("Ez nem multipart munkamenet.", "DROP_UPLOAD_NOT_MULTIPART", 409);
  const parts = await listDropUploadParts(input.uploadId);
  const expected = parts.find((part) => Number(part.part_number) === input.partNumber);
  if (!expected) throw createServiceError("A feltöltési rész nem található.", "DROP_UPLOAD_PART_NOT_FOUND", 404);
  const expectedBytes = Number(expected.size_bytes);
  if (input.contentLength != null && input.contentLength !== expectedBytes) {
    throw createServiceError("A HTTP részméret eltér a várt mérettől.", "DROP_UPLOAD_PART_SIZE_MISMATCH", 400);
  }
  if (config.provider !== "local-private") {
    throw createServiceError("A Hetzner közvetlen presigned részfeltöltés a bucket bekötése után aktiválható.", "DROP_S3_MULTIPART_NOT_ACTIVE", 503);
  }
  const streamed = await streamDropUploadPart({
    sessionId: input.uploadId,
    partNumber: input.partNumber,
    body: input.body,
    expectedBytes,
  });
  const recorded = await markDropUploadPartReceived({
    sessionId: input.uploadId,
    partNumber: input.partNumber,
    receivedBytes: streamed.receivedBytes,
    checksum: streamed.sha256,
  });
  return {
    partNumber: input.partNumber,
    receivedBytes: streamed.receivedBytes,
    completedParts: recorded.session.completed_parts,
    totalParts: recorded.session.total_parts,
    uploadedBytes: recorded.session.uploaded_bytes,
    totalBytes: recorded.session.total_bytes,
    allPartsReceived: recorded.allPartsReceived,
  };
}

export async function completeDropUpload(input: {
  uploadId: string;
  rawToken: string;
}) {
  await assertQuarantineUploadReady();
  let bundle = await getDropUploadBundle(input.uploadId);
  if (!bundle) throw createServiceError("A feltöltési munkamenet nem található.", "DROP_UPLOAD_SESSION_NOT_FOUND", 404);
  assertTokenMatchesBundle(input.rawToken, input.uploadId, bundle);
  if (bundle.session.storage_provider === "s3-compatible") {
    if (bundle.session.status === "completed") {
      await invalidateDropFinalReport(bundle.package.id, "A feltöltött fájl miatt a korábbi végleges riport érvényét vesztette.");
      return {
        file: {
          id: bundle.file.id,
          packageId: bundle.file.package_id,
          displayName: bundle.file.display_name,
          sizeBytes: bundle.file.size_stored_bytes,
          mimeType: bundle.file.detected_mime_type || bundle.file.mime_type,
          uploadStatus: bundle.file.upload_status,
          processingStatus: bundle.file.processing_status,
          virusScanStatus: bundle.file.virus_scan_status,
          securityStatus: bundle.file.security_status || "scanner_required",
          quarantineReason: bundle.file.quarantine_reason || "Víruskereső ellenőrzés szükséges.",
        },
        session: { id: bundle.session.id, status: bundle.session.status, completedAt: bundle.session.completed_at },
        inspection: { detectedMimeType: bundle.file.detected_mime_type || bundle.file.mime_type, zipScanStatus: bundle.file.zip_scan_status, zipEntryCount: null },
        emailNotification: null,
        downloadable: false,
        quarantineOnly: true as const,
        idempotent: true,
      };
    }
    if (bundle.session.status !== "parts_received" || !bundle.session.storage_multipart_id) {
      throw createServiceError("Az S3 fájlrészek még nem teljesek.", "DROP_UPLOAD_PARTS_INCOMPLETE", 409);
    }
    const parts = await listDropUploadParts(bundle.session.id);
    const ordered = parts.map((part) => ({
      partNumber: Number(part.part_number),
      sizeBytes: Number(part.size_bytes),
      checksum: String(part.checksum || ""),
      etag: String(part.etag || "").replace(/^"|"$/g, ""),
      status: String(part.status),
    })).sort((left, right) => left.partNumber - right.partNumber);
    if (ordered.length !== bundle.session.total_parts || ordered.some((part, index) => part.partNumber !== index + 1 || part.status !== "completed" || !/^[0-9a-f]{64}$/.test(part.checksum) || !part.etag)) {
      throw createServiceError("Az S3 fájlrészek integritási adatai hiányosak.", "DROP_UPLOAD_PARTS_INCOMPLETE", 409);
    }
    let multipartCompleted = false;
    try {
      let object = await headDropS3Object({
        storageKey: bundle.file.storage_key,
        bucket: bundle.file.storage_bucket,
      }).catch(() => null);
      let completedEtag = object?.etag || "";
      if (!object) {
        const completed = await completeDropS3Multipart({
          storageKey: bundle.file.storage_key,
          uploadId: bundle.session.storage_multipart_id,
          parts: ordered.map((part) => ({ partNumber: part.partNumber, etag: part.etag })),
        });
        multipartCompleted = true;
        completedEtag = completed.etag;
        object = await headDropS3Object({ storageKey: bundle.file.storage_key, bucket: bundle.file.storage_bucket });
      } else {
        multipartCompleted = true;
      }
      if (object.sizeBytes !== bundle.session.total_bytes) {
        throw createServiceError("Az S3 objektum mérete eltér a várt fájlmérettől.", "DROP_S3_OBJECT_SIZE_MISMATCH", 409);
      }
      const manifestSha256 = createHash("sha256")
        .update(ordered.map((part) => `${part.partNumber}:${part.sizeBytes}:${part.checksum}:${part.etag}`).join("\n"))
        .digest("hex");
      await invalidateDropFinalReport(bundle.package.id, "Új fájl feltöltése miatt a végleges riportot újra kell készíteni.");
      const finalized = await finalizeDropS3QuarantineUpload({
        sessionId: bundle.session.id,
        storedBytes: object.sizeBytes,
        manifestSha256,
        objectEtag: object.etag || completedEtag,
        detectedMimeType: object.contentType || bundle.file.mime_type,
        quarantineReason: "A fájl közvetlenül a privát DROP S3 karanténba érkezett; víruskereső ellenőrzés szükséges.",
      });
      const emailNotification = await sendDropUploadCompleteNotifications({
        packageId: bundle.package.id,
        uploadedByName: finalized.file.uploaded_by_name || "Drop feltöltő",
        uploadedByEmail: finalized.file.uploaded_by_email || undefined,
        files: [{ id: finalized.file.id, name: finalized.file.display_name, sizeBytes: finalized.file.size_stored_bytes, mimeType: finalized.file.detected_mime_type || finalized.file.mime_type }],
      }).catch(() => null);
      const scanDispatch = await dispatchDropFileScan(finalized.file).catch((error) => ({
        queued: false as const,
        priority: finalized.file.is_image ? "image" as const : "standard" as const,
        immediateWakeRequested: false as const,
        triggerPathExposed: false as const,
        error: error instanceof Error ? error.message.slice(0, 500) : "A vírusellenőrző azonnali indítása sikertelen.",
      }));
      return {
        file: {
          id: finalized.file.id,
          packageId: finalized.file.package_id,
          displayName: finalized.file.display_name,
          sizeBytes: finalized.file.size_stored_bytes,
          mimeType: finalized.file.detected_mime_type || finalized.file.mime_type,
          uploadStatus: finalized.file.upload_status,
          processingStatus: finalized.file.processing_status,
          virusScanStatus: finalized.file.virus_scan_status,
          securityStatus: finalized.file.security_status || "scanner_required",
          quarantineReason: finalized.file.quarantine_reason,
          integrityType: finalized.file.integrity_type || "PART_MANIFEST_SHA256",
          integrityManifestSha256: finalized.file.integrity_manifest_sha256 || manifestSha256,
          objectEtag: finalized.file.object_etag || object.etag,
        },
        session: { id: finalized.session.id, status: finalized.session.status, completedAt: finalized.session.completed_at },
        inspection: { detectedMimeType: finalized.file.detected_mime_type || finalized.file.mime_type, zipScanStatus: finalized.file.zip_scan_status, zipEntryCount: null },
        emailNotification,
        scanDispatch,
        downloadable: false,
        quarantineOnly: true as const,
      };
    } catch (error) {
      if (multipartCompleted) {
        await queueDropObjectCleanup({
          packageId: bundle.package.id,
          fileId: bundle.file.id,
          sessionId: bundle.session.id,
          storageBucket: bundle.file.storage_bucket,
          storageKey: bundle.file.storage_key,
          operation: "DELETE_OBJECT",
          reason: error instanceof Error ? error.message : "S3 véglegesítés utáni takarítás szükséges.",
        }).catch(() => undefined);
      }
      throw error;
    }
  }
  if (bundle.session.total_parts > 1 && bundle.session.status === "parts_received") {
    if (bundle.session.storage_provider !== "local-private") {
      throw createServiceError("A Hetzner multipart összefűzés a bucket bekötése után aktiválható.", "DROP_S3_MULTIPART_NOT_ACTIVE", 503);
    }
    const assembled = await assembleDropUploadParts({
      sessionId: bundle.session.id,
      totalParts: bundle.session.total_parts,
      expectedBytes: bundle.session.total_bytes,
    });
    await finalizeDropMultipartReceived({
      sessionId: bundle.session.id,
      receivedBytes: assembled.receivedBytes,
      sha256: assembled.sha256,
    });
    bundle = await getDropUploadBundle(input.uploadId);
    if (!bundle) throw createServiceError("A multipart munkamenet lezárás után nem található.", "DROP_UPLOAD_SESSION_NOT_FOUND", 404);
  }
  if (bundle.session.status !== "uploaded" || !bundle.session.received_sha256) {
    throw createServiceError("A fájltartalom még nem érkezett be teljesen.", "DROP_UPLOAD_CONTENT_INCOMPLETE", 409);
  }

  try {
    const incomingPath = await getDropIncomingPath(bundle.session.id);
    const inspection = await inspectDropIncomingFile({
      filePath: incomingPath,
      extension: bundle.file.extension,
      expectedBytes: bundle.session.total_bytes,
    });
    await invalidateDropFinalReport(bundle.package.id, "Új fájl feltöltése miatt a végleges riportot újra kell készíteni.");
    const moved = await moveDropFileToQuarantine({
      sessionId: bundle.session.id,
      storageKey: bundle.file.storage_key,
    });
    const finalized = await finalizeDropQuarantineUpload({
      sessionId: bundle.session.id,
      detectedMimeType: inspection.detectedMimeType,
      storedBytes: moved.sizeBytes,
      sha256: bundle.session.received_sha256,
      zipScanStatus: inspection.zipScanStatus,
      quarantineReason: inspection.quarantineReason,
    });
    if (bundle.session.total_parts > 1) await removeDropMultipartSession(bundle.session.id).catch(() => undefined);
    const emailNotification = await sendDropUploadCompleteNotifications({
      packageId: bundle.package.id,
      uploadedByName: finalized.file.uploaded_by_name || "Drop feltöltő",
      uploadedByEmail: finalized.file.uploaded_by_email || undefined,
      files: [{
        id: finalized.file.id,
        name: finalized.file.display_name,
        sizeBytes: finalized.file.size_stored_bytes,
        mimeType: finalized.file.detected_mime_type || finalized.file.mime_type,
      }],
    }).catch((error) => ({
      enabled: true,
      configured: true,
      kind: "upload_complete" as const,
      attempted: 0,
      sent: 0,
      failed: 1,
      skipped: 0,
      recipients: [],
      generatedAt: new Date().toISOString(),
      note: error instanceof Error ? error.message : "A feltöltési e-mail értesítés sikertelen.",
    }));
    const scanDispatch = await dispatchDropFileScan(finalized.file).catch((error) => ({
      queued: false as const,
      priority: finalized.file.is_image ? "image" as const : "standard" as const,
      immediateWakeRequested: false as const,
      triggerPathExposed: false as const,
      error: error instanceof Error ? error.message.slice(0, 500) : "A vírusellenőrző azonnali indítása sikertelen.",
    }));
    return {
      file: {
        id: finalized.file.id,
        packageId: finalized.file.package_id,
        displayName: finalized.file.display_name,
        sizeBytes: finalized.file.size_stored_bytes,
        mimeType: finalized.file.detected_mime_type || finalized.file.mime_type,
        uploadStatus: finalized.file.upload_status,
        processingStatus: finalized.file.processing_status,
        virusScanStatus: finalized.file.virus_scan_status,
        securityStatus: finalized.file.security_status || "scanner_required",
        quarantineReason: finalized.file.quarantine_reason || inspection.quarantineReason,
      },
      session: {
        id: finalized.session.id,
        status: finalized.session.status,
        completedAt: finalized.session.completed_at,
      },
      inspection: {
        detectedMimeType: inspection.detectedMimeType,
        zipScanStatus: inspection.zipScanStatus,
        zipEntryCount: inspection.zipEntryCount,
      },
      emailNotification,
      scanDispatch,
      downloadable: false,
      quarantineOnly: true as const,
    };
  } catch (error) {
    const failure = asFailure(error);
    await removeDropStoredFile({
      sessionId: bundle.session.id,
      storageKey: bundle.file.storage_key,
    }).catch(() => undefined);
    await abortDropUpload({
      sessionId: bundle.session.id,
      failureCode: failure.code,
      failureMessage: failure.message,
    }).catch(() => undefined);
    throw error;
  }
}

export async function cancelDropUpload(input: {
  uploadId: string;
  rawToken: string;
  reason?: string;
}) {
  const bundle = await getDropUploadBundle(input.uploadId);
  if (!bundle) throw createServiceError("A feltöltési munkamenet nem található.", "DROP_UPLOAD_SESSION_NOT_FOUND", 404);
  assertTokenMatchesBundle(input.rawToken, input.uploadId, bundle);
  if (bundle.session.status === "completed") {
    throw createServiceError(
      "A már karanténban véglegesített fájl nem törölhető feltöltés-megszakítással.",
      "DROP_UPLOAD_ALREADY_FINALIZED",
      409,
    );
  }
  if (bundle.session.storage_provider === "s3-compatible") {
    if (bundle.session.storage_multipart_id && bundle.session.status !== "completed") {
      try {
        await abortDropS3Multipart({ storageKey: bundle.file.storage_key, uploadId: bundle.session.storage_multipart_id });
      } catch (error) {
        await queueDropObjectCleanup({
          packageId: bundle.package.id,
          fileId: bundle.file.id,
          sessionId: bundle.session.id,
          storageBucket: bundle.file.storage_bucket,
          storageKey: bundle.file.storage_key,
          storageMultipartId: bundle.session.storage_multipart_id,
          operation: "ABORT_MULTIPART",
          reason: error instanceof Error ? error.message : "S3 multipart megszakítása sikertelen.",
        }).catch(() => undefined);
      }
    } else if (bundle.session.status === "completed") {
      try {
        await deleteDropS3Object({ storageKey: bundle.file.storage_key, bucket: bundle.file.storage_bucket });
      } catch (error) {
        await queueDropObjectCleanup({
          packageId: bundle.package.id,
          fileId: bundle.file.id,
          sessionId: bundle.session.id,
          storageBucket: bundle.file.storage_bucket,
          storageKey: bundle.file.storage_key,
          operation: "DELETE_OBJECT",
          reason: error instanceof Error ? error.message : "S3 objektumtörlés sikertelen.",
        }).catch(() => undefined);
      }
    }
  } else {
    await removeDropStoredFile({ sessionId: bundle.session.id, storageKey: bundle.file.storage_key });
    if (bundle.session.total_parts > 1) await removeDropMultipartSession(bundle.session.id).catch(() => undefined);
  }
  return abortDropUpload({
    sessionId: bundle.session.id,
    failureCode: "DROP_UPLOAD_CANCELLED",
    failureMessage: input.reason || "A feltöltést a felhasználó megszakította.",
  });
}

export async function getDropGlobalUploadReadiness() {
  const [schema, multipartSchema] = await Promise.all([
    getDropStorageSchemaHealth(),
    getDropMultipartSchemaHealth(),
  ]);
  const feature = getDropFeatureState();
  const config = getDropStorageConfig();
  const storage = getDropStorageSafeStatus(config);
  const uploadReady = Boolean(
    schema.ready
      && feature.flags.storageCoreEnabled
      && feature.flags.quarantineUploadEnabled
      && storage.storageConfigured
      && storage.objectWriteEnabled,
  );
  return {
    schemaReady: schema.ready,
    storageCoreEnabled: feature.flags.storageCoreEnabled,
    quarantineUploadEnabled: feature.flags.quarantineUploadEnabled,
    resumableUploadEnabled: feature.flags.resumableUploadEnabled,
    storageConfigured: storage.storageConfigured,
    scannerAvailable: storage.scannerAvailable,
    uploadReady,
    quarantineUploadReady: uploadReady,
    resumableUploadReady: Boolean(uploadReady && feature.flags.resumableUploadEnabled && multipartSchema.ready),
    publicDownloadReady: storage.publicDownloadReady,
    fileUploadModesReleased: uploadReady,
    storageMode: storage.mode,
    storageProvider: storage.provider,
    maxFileBytes: config.maxFileBytes,
    chunkSizeBytes: config.chunkSizeBytes,
  };
}

export async function getDropPackageUploadState(session: DropResolvedSpaceSession, packageId: string) {
  const packageItem = await assertDropSpacePackageUploadAccess(session, packageId).catch(async (error) => {
    const visiblePackages = await listVisibleDropSpacePackages(session);
    const visible = visiblePackages.find((item) => item.id === packageId);
    if (!visible) throw error;
    return visible;
  });
  const [files, readiness, metricEvents] = await Promise.all([
    listDropPackageFiles(packageId),
    getDropGlobalUploadReadiness(),
    getDropSupabaseClient()
      .from("drop_events")
      .select("file_id,event_type,payload,created_at")
      .eq("package_id", packageId)
      .in("event_type", ["upload.rules_accepted", "upload.rules_reconfirmed"])
      .not("file_id", "is", null)
      .order("created_at", { ascending: false }),
  ]);
  if (metricEvents.error) {
    throw createServiceError("A mobil képoptimalizálási metrikák nem tölthetők be.", metricEvents.error.code || "DROP_SOURCE_METRICS_LOAD_FAILED", 500);
  }
  const metricsByFile = new Map<string, { sourceOriginalSizeBytes: number; uploadSizeBytes: number; savedBytes: number; savedPercent: number }>();
  for (const event of metricEvents.data || []) {
    const fileId = event.file_id ? String(event.file_id) : "";
    if (!fileId || metricsByFile.has(fileId)) continue;
    const payload = (event.payload || {}) as Record<string, unknown>;
    const sourceOriginalSizeBytes = Number(payload.sourceOriginalSizeBytes || 0);
    const uploadSizeBytes = Number(payload.uploadSizeBytes || 0);
    if (!Number.isSafeInteger(sourceOriginalSizeBytes) || sourceOriginalSizeBytes <= 0 || !Number.isSafeInteger(uploadSizeBytes) || uploadSizeBytes <= 0) continue;
    metricsByFile.set(fileId, {
      sourceOriginalSizeBytes,
      uploadSizeBytes,
      savedBytes: Math.max(0, Number(payload.savedBytes || sourceOriginalSizeBytes - uploadSizeBytes)),
      savedPercent: Math.max(0, Math.min(100, Number(payload.savedPercent || Math.round((1 - uploadSizeBytes / sourceOriginalSizeBytes) * 100)))),
    });
  }
  return {
    package: packageItem,
    files: files.map((file) => ({
      id: file.id,
      package_id: file.package_id,
      group_id: file.group_id,
      original_name: file.original_name,
      display_name: file.display_name,
      mime_type: file.mime_type,
      detected_mime_type: file.detected_mime_type,
      size_original_bytes: file.size_original_bytes,
      size_stored_bytes: file.size_stored_bytes,
      source_original_size_bytes: metricsByFile.get(file.id)?.sourceOriginalSizeBytes || file.size_original_bytes,
      optimization_saved_bytes: metricsByFile.get(file.id)?.savedBytes || 0,
      optimization_saved_percent: metricsByFile.get(file.id)?.savedPercent || 0,
      upload_status: file.upload_status,
      processing_status: file.processing_status,
      virus_scan_status: file.virus_scan_status,
      zip_scan_status: file.zip_scan_status,
      security_status: file.security_status || "pending",
      quarantine_reason: file.quarantine_reason || null,
      created_at: file.created_at,
    })),
    readiness,
  };
}


export async function processDropObjectCleanup(limit = 50) {
  const tasks = await listPendingDropObjectCleanup(limit);
  const results = [];
  for (const task of tasks) {
    try {
      if (task.operation === "ABORT_MULTIPART") {
        if (!task.storage_multipart_id) throw new Error("Hiányzó S3 multipart azonosító.");
        await abortDropS3Multipart({ storageKey: task.storage_key, uploadId: task.storage_multipart_id });
      } else {
        await deleteDropS3Object({ storageKey: task.storage_key, bucket: task.storage_bucket });
      }
      const completed = await completeDropObjectCleanup({ taskId: task.id, success: true });
      results.push({ task: completed, success: true, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2000) : "Ismeretlen S3 takarítási hiba.";
      const failed = await completeDropObjectCleanup({ taskId: task.id, success: false, error: message });
      results.push({ task: failed, success: false, error: message });
    }
  }
  return {
    attempted: tasks.length,
    completed: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results,
  };
}
