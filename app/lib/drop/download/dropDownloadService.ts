import { createDropSecurityFingerprint, hashDropToken, safeTokenReference } from "../dropCrypto";
import { validateDropAccessToken } from "../dropAccess";
import { getDropStorageSafeStatus } from "../storage/dropStorageConfig";
import { createDropS3DownloadUrl, createDropS3InlineUrl } from "../storage/dropS3Storage";
import { createDropPackageZipStream, DROP_PACKAGE_ZIP_MAX_BYTES, DROP_PACKAGE_ZIP_MAX_FILES } from "./dropPackageZip";
import { getDropWorkerConfig } from "../worker/dropWorkerConfig";
import { getDropPackageWorkflow } from "../public/dropPublicRepository";
import { loadDropFinalReportBundle } from "../report/dropReportRepository";
import { renderDropFinalReport, type DropReportImagesPerPage } from "../report/dropFinalReportRenderer";
import { buildDropPackageTextReport } from "../report/dropPackageTextReport";
import { hasDropDownloadProof } from "../public/dropDownloadProof";
import { getDropSupabaseClient, writeDropEvent } from "../dropRepository";
import { listDropPackageGroups } from "../dropGroupService";
import {
  createDropFileDownloadRecord,
  getDropDownloadableFile,
  getDropWorkerSchemaHealth,
  listDropDownloadableFiles,
} from "../worker/dropWorkerRepository";

export class DropDownloadError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "DropDownloadError";
    this.code = code;
    this.status = status;
  }
}

function getClientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")?.trim()
    || "unknown";
}

function getUserAgent(headers: Headers) {
  return (headers.get("user-agent") || "unknown").replace(/[\r\n]/g, " ").slice(0, 240);
}

export async function getDropDownloadPanelFiles(packageId: string) {
  const [files, commentsResult, groups] = await Promise.all([
    listDropDownloadableFiles(packageId),
    getDropSupabaseClient()
      .from("drop_comments")
      .select("file_id,comment_text,status,created_at")
      .eq("package_id", packageId)
      .neq("status", "deleted")
      .not("file_id", "is", null)
      .order("created_at", { ascending: true }),
    listDropPackageGroups(packageId),
  ]);
  if (commentsResult.error) throw commentsResult.error;
  const commentsByFile = new Map<string, string[]>();
  for (const row of commentsResult.data || []) {
    if (!row.file_id) continue;
    const list = commentsByFile.get(String(row.file_id)) || [];
    list.push(String(row.comment_text));
    commentsByFile.set(String(row.file_id), list);
  }
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const previewTtl = Math.max(60, Math.min(600, getDropWorkerConfig().signedDownloadTtlSeconds));
  return Promise.all(files.map(async (file) => {
    const mimeType = file.detected_mime_type || file.mime_type || "application/octet-stream";
    let previewUrl: string | null = null;
    if (mimeType.toLowerCase().startsWith("image/") && file.storage_key) {
      previewUrl = await createDropS3InlineUrl({
        storageKey: file.storage_key,
        bucket: file.storage_bucket,
        contentType: mimeType,
        expiresIn: previewTtl,
      }).then((signed) => signed.url).catch(() => null);
    }
    return {
      id: file.id,
      name: file.display_name,
      sizeBytes: file.size_stored_bytes,
      mimeType,
      sha256: file.sha256,
      readyAt: file.download_ready_at || file.ready_at || null,
      comments: commentsByFile.get(file.id) || [],
      groupId: file.group_id ? String(file.group_id) : null,
      groupName: file.group_id ? groupById.get(String(file.group_id))?.name || null : null,
      groupSortOrder: file.group_id ? groupById.get(String(file.group_id))?.sortOrder ?? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER,
      previewUrl,
    };
  }));
}

export async function issueDropFileDownload(input: {
  rawToken: string;
  fileId: string;
  headers: Headers;
}) {
  const [grant, schema] = await Promise.all([
    validateDropAccessToken({ rawToken: input.rawToken, expectedPurpose: "download", headers: input.headers }),
    getDropWorkerSchemaHealth(),
  ]);
  const workflow = await getDropPackageWorkflow(grant.packageId);
  if (workflow?.requireDownloadPin && !hasDropDownloadProof(input.headers, grant.packageId)) {
    throw new DropDownloadError("A letöltési kód ellenőrzése szükséges.", "DROP_DOWNLOAD_PIN_PROOF_REQUIRED", 401);
  }
  const storage = getDropStorageSafeStatus();
  const worker = getDropWorkerConfig();
  if (!schema.ready || !worker.enabled || !storage.publicDownloadReady) {
    throw new DropDownloadError(
      "A biztonságos DROP letöltési kapu még nincs aktiválva.",
      "DROP_DOWNLOAD_GATE_DISABLED",
      503,
    );
  }

  const file = await getDropDownloadableFile(grant.packageId, input.fileId);
  if (!file) {
    throw new DropDownloadError("A fájl nem található ebben a csomagban.", "DROP_FILE_NOT_FOUND", 404);
  }
  if (
    file.deleted_at
    || file.storage_provider !== "s3-compatible"
    || file.security_status !== "clean"
    || file.virus_scan_status !== "clean"
    || file.upload_status !== "ready"
    || file.processing_status !== "ready"
    || !file.download_ready_at
    || !file.sha256
  ) {
    throw new DropDownloadError(
      "A fájl még nem ment át a kötelező vírusellenőrzésen, vagy már nem elérhető.",
      "DROP_FILE_DOWNLOAD_NOT_READY",
      409,
    );
  }

  const tokenRemainingSeconds = Math.floor((new Date(grant.expiresAt).getTime() - Date.now()) / 1000);
  const packageRemainingSeconds = Math.floor((new Date(grant.packageExpiresAt).getTime() - Date.now()) / 1000);
  if (tokenRemainingSeconds < 60 || packageRemainingSeconds < 60) {
    throw new DropDownloadError("A letöltési jogosultság lejárt vagy egy percen belül lejár.", "DROP_DOWNLOAD_TOKEN_EXPIRED", 410);
  }
  const ttlSeconds = Math.min(
    worker.signedDownloadTtlSeconds,
    tokenRemainingSeconds,
    packageRemainingSeconds,
  );

  const signed = await createDropS3DownloadUrl({
    storageKey: file.storage_key,
    bucket: file.storage_bucket,
    displayName: file.display_name,
    contentType: file.detected_mime_type || file.mime_type,
    expiresIn: ttlSeconds,
  });
  const ipHash = createDropSecurityFingerprint("ip", getClientIp(input.headers));
  const userAgentSummary = getUserAgent(input.headers);
  const tokenHash = hashDropToken(input.rawToken);
  const tokenHint = safeTokenReference(input.rawToken);
  const audit = await createDropFileDownloadRecord({
    packageId: grant.packageId,
    fileId: file.id,
    tokenHash,
    tokenHint,
    ipHash,
    userAgentSummary,
    expiresAt: signed.expiresAt,
  });

  return {
    file: {
      id: file.id,
      name: signed.displayName,
      sizeBytes: file.size_stored_bytes,
      mimeType: file.detected_mime_type || file.mime_type,
      sha256: file.sha256,
    },
    download: {
      url: signed.url,
      method: signed.method,
      expiresAt: signed.expiresAt,
      auditId: String(audit.download.id || ""),
    },
    security: {
      virusScanStatus: file.virus_scan_status,
      securityStatus: file.security_status,
      fullFileSha256Verified: file.integrity_type === "FILE_SHA256" && Boolean(file.sha256),
    },
    secretsExposed: false,
  };
}


export async function issueDropFileInline(input: { rawToken: string; fileId: string; headers: Headers }) {
  const [grant, schema] = await Promise.all([
    validateDropAccessToken({ rawToken: input.rawToken, expectedPurpose: "download", headers: input.headers }),
    getDropWorkerSchemaHealth(),
  ]);
  const workflow = await getDropPackageWorkflow(grant.packageId);
  if (workflow?.requireDownloadPin && !hasDropDownloadProof(input.headers, grant.packageId)) throw new DropDownloadError("A letöltési kód ellenőrzése szükséges.", "DROP_DOWNLOAD_PIN_PROOF_REQUIRED", 401);
  const storage = getDropStorageSafeStatus();
  const worker = getDropWorkerConfig();
  if (!schema.ready || !worker.enabled || !storage.publicDownloadReady) throw new DropDownloadError("A biztonságos DROP letöltési kapu még nincs aktiválva.", "DROP_DOWNLOAD_GATE_DISABLED", 503);
  const file = await getDropDownloadableFile(grant.packageId, input.fileId);
  if (!file || file.deleted_at || file.security_status !== "clean" || file.virus_scan_status !== "clean" || file.upload_status !== "ready" || file.processing_status !== "ready" || !file.download_ready_at || !file.sha256) throw new DropDownloadError("A fájl nem nyitható meg biztonságosan.", "DROP_FILE_DOWNLOAD_NOT_READY", 409);
  const mimeType = file.detected_mime_type || file.mime_type || "application/octet-stream";
  if (!mimeType.toLowerCase().startsWith("image/")) throw new DropDownloadError("Közvetlen előnézet csak képfájlhoz használható.", "DROP_FILE_INLINE_NOT_IMAGE", 400);
  const tokenRemainingSeconds = Math.floor((new Date(grant.expiresAt).getTime() - Date.now()) / 1000);
  const packageRemainingSeconds = Math.floor((new Date(grant.packageExpiresAt).getTime() - Date.now()) / 1000);
  if (tokenRemainingSeconds < 60 || packageRemainingSeconds < 60) throw new DropDownloadError("A letöltési jogosultság lejárt.", "DROP_DOWNLOAD_TOKEN_EXPIRED", 410);
  const signed = await createDropS3InlineUrl({ storageKey: file.storage_key, bucket: file.storage_bucket, contentType: mimeType, expiresIn: Math.min(worker.signedDownloadTtlSeconds, tokenRemainingSeconds, packageRemainingSeconds) });
  await createDropFileDownloadRecord({ packageId: grant.packageId, fileId: file.id, tokenHash: hashDropToken(input.rawToken), tokenHint: safeTokenReference(input.rawToken), ipHash: createDropSecurityFingerprint("ip", getClientIp(input.headers)), userAgentSummary: getUserAgent(input.headers), expiresAt: signed.expiresAt });
  return { url: signed.url, expiresAt: signed.expiresAt };
}


async function resolveDropPackageReportExport(input: { rawToken: string; headers: Headers }) {
  const [grant, schema] = await Promise.all([
    validateDropAccessToken({ rawToken: input.rawToken, expectedPurpose: "download", headers: input.headers }),
    getDropWorkerSchemaHealth(),
  ]);
  const workflow = await getDropPackageWorkflow(grant.packageId);
  if (workflow?.requireDownloadPin && !hasDropDownloadProof(input.headers, grant.packageId)) throw new DropDownloadError("A letöltési kód ellenőrzése szükséges.", "DROP_DOWNLOAD_PIN_PROOF_REQUIRED", 401);
  const storage = getDropStorageSafeStatus();
  if (!schema.ready || !getDropWorkerConfig().enabled || !storage.publicDownloadReady) throw new DropDownloadError("A biztonságos DROP letöltési kapu még nincs aktiválva.", "DROP_DOWNLOAD_GATE_DISABLED", 503);
  const bundle = await loadDropFinalReportBundle(grant.packageId);
  return { grant, workflow, bundle, tokenReference: safeTokenReference(input.rawToken) };
}

export async function issueDropPackagePdfReportDownload(input: { rawToken: string; headers: Headers; imagesPerPage?: DropReportImagesPerPage }) {
  const context = await resolveDropPackageReportExport(input);
  const rendered = await renderDropFinalReport(context.bundle, {
    workflow: context.workflow,
    tokenReference: context.tokenReference,
    reportTitle: "Csomagriport · képek és megjegyzések",
    fileNameSuffix: `csomagriport_${input.imagesPerPage || 1}kep_oldal`,
    imagesPerPage: input.imagesPerPage || 1,
  });
  await writeDropEvent({ packageId: context.grant.packageId, eventType: "package.download_report.pdf", severity: "info", payload: { pageCount: rendered.pageCount, fileSizeBytes: rendered.buffer.length } });
  return { buffer: rendered.buffer, filename: rendered.fileName, pageCount: rendered.pageCount };
}

export async function issueDropPackageTextReportDownload(input: { rawToken: string; headers: Headers }) {
  const context = await resolveDropPackageReportExport(input);
  const report = buildDropPackageTextReport({ bundle: context.bundle, workflow: context.workflow, tokenReference: context.tokenReference });
  await writeDropEvent({ packageId: context.grant.packageId, eventType: "package.download_report.txt", severity: "info", payload: { fileSizeBytes: report.buffer.length } });
  return { buffer: report.buffer, filename: report.fileName };
}

function safeZipFilename(title: string, publicCode: string, brandPrefix = false) {
  const prefix = brandPrefix ? "DIMPRO_" : "";
  const base = `${prefix}${title || "Drop csomag"} - ${publicCode || "csomag"}`
    .normalize("NFKC")
    .replace(/[\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140) || "DIMPRO Drop csomag";
  return `${base}.zip`;
}

export async function issueDropPackageZipDownload(input: {
  rawToken: string;
  headers: Headers;
  brandPrefix?: boolean;
  includePdf?: boolean;
  includeTxt?: boolean;
  pdfImagesPerPage?: DropReportImagesPerPage;
}) {
  const [grant, schema] = await Promise.all([
    validateDropAccessToken({ rawToken: input.rawToken, expectedPurpose: "download", headers: input.headers }),
    getDropWorkerSchemaHealth(),
  ]);
  const workflow = await getDropPackageWorkflow(grant.packageId);
  if (workflow?.requireDownloadPin && !hasDropDownloadProof(input.headers, grant.packageId)) {
    throw new DropDownloadError("A letöltési kód ellenőrzése szükséges.", "DROP_DOWNLOAD_PIN_PROOF_REQUIRED", 401);
  }
  const storage = getDropStorageSafeStatus();
  const worker = getDropWorkerConfig();
  if (!schema.ready || !worker.enabled || !storage.publicDownloadReady) {
    throw new DropDownloadError("A biztonságos DROP letöltési kapu még nincs aktiválva.", "DROP_DOWNLOAD_GATE_DISABLED", 503);
  }

  const files = await listDropDownloadableFiles(grant.packageId);
  if (!files.length) throw new DropDownloadError("A csomagban nincs ZIP-be tehető, vírusellenőrzött fájl.", "DROP_PACKAGE_ZIP_EMPTY", 409);
  if (files.length > DROP_PACKAGE_ZIP_MAX_FILES) {
    throw new DropDownloadError(`A csomag több mint ${DROP_PACKAGE_ZIP_MAX_FILES} fájlt tartalmaz; használja az egyedi letöltést.`, "DROP_PACKAGE_ZIP_FILE_LIMIT", 413);
  }
  const totalBytes = files.reduce((sum, file) => sum + Number(file.size_stored_bytes || 0), 0);
  if (totalBytes > DROP_PACKAGE_ZIP_MAX_BYTES) {
    throw new DropDownloadError("A csomag meghaladja a 2 GB-os ZIP-biztonsági korlátot; használja az egyedi letöltést.", "DROP_PACKAGE_ZIP_SIZE_LIMIT", 413);
  }
  for (const file of files) {
    if (
      file.deleted_at
      || file.storage_provider !== "s3-compatible"
      || file.security_status !== "clean"
      || file.virus_scan_status !== "clean"
      || file.upload_status !== "ready"
      || file.processing_status !== "ready"
      || !file.download_ready_at
      || !file.sha256
      || !file.storage_key
    ) {
      throw new DropDownloadError("A csomag egyik fájlja még nem tölthető le biztonságosan.", "DROP_PACKAGE_ZIP_FILE_NOT_READY", 409);
    }
  }

  const tokenRemainingSeconds = Math.floor((new Date(grant.expiresAt).getTime() - Date.now()) / 1000);
  const packageRemainingSeconds = Math.floor((new Date(grant.packageExpiresAt).getTime() - Date.now()) / 1000);
  if (tokenRemainingSeconds < 60 || packageRemainingSeconds < 60) {
    throw new DropDownloadError("A letöltési jogosultság lejárt vagy egy percen belül lejár.", "DROP_DOWNLOAD_TOKEN_EXPIRED", 410);
  }
  const auditExpiresAt = new Date(Date.now() + Math.min(900, tokenRemainingSeconds, packageRemainingSeconds) * 1000).toISOString();
  const ipHash = createDropSecurityFingerprint("ip", getClientIp(input.headers));
  const userAgentSummary = getUserAgent(input.headers);
  const tokenHash = hashDropToken(input.rawToken);
  const tokenHint = safeTokenReference(input.rawToken);
  await Promise.all(files.map((file) => createDropFileDownloadRecord({
    packageId: grant.packageId,
    fileId: file.id,
    tokenHash,
    tokenHint,
    ipHash,
    userAgentSummary,
    expiresAt: auditExpiresAt,
  })));

  const commentsResult = await getDropSupabaseClient()
    .from("drop_comments")
    .select("file_id,comment_text,status,created_at")
    .eq("package_id", grant.packageId)
    .neq("status", "deleted")
    .not("file_id", "is", null)
    .order("created_at", { ascending: true });
  if (commentsResult.error) throw commentsResult.error;
  const commentsByFile = new Map<string, string[]>();
  for (const row of commentsResult.data || []) {
    if (!row.file_id) continue;
    const current = commentsByFile.get(String(row.file_id)) || [];
    current.push(String(row.comment_text));
    commentsByFile.set(String(row.file_id), current);
  }

  const reportBundle = await loadDropFinalReportBundle(grant.packageId);
  const groupNames = new Map(reportBundle.groups.map((group) => [group.id, group.name]));
  const includePdf = input.includePdf === true;
  const includeTxt = input.includeTxt !== false;
  const supplementalFiles: Array<{ name: string; data: Buffer }> = [];
  if (includePdf) {
    const pdfImagesPerPage = input.pdfImagesPerPage || 1;
    const pdfReport = await renderDropFinalReport(reportBundle, {
      workflow,
      tokenReference: tokenHint,
      reportTitle: "Csomagriport · képek és megjegyzések",
      fileNameSuffix: `csomagriport_${pdfImagesPerPage}kep_oldal`,
      imagesPerPage: pdfImagesPerPage,
    });
    supplementalFiles.push({ name: pdfReport.fileName, data: pdfReport.buffer });
  }
  if (includeTxt) {
    const textReport = buildDropPackageTextReport({ bundle: reportBundle, workflow, tokenReference: tokenHint });
    supplementalFiles.push({ name: textReport.fileName, data: textReport.buffer });
  }

  const archive = createDropPackageZipStream({
    title: grant.title,
    publicCode: grant.publicCode,
    supplementalFiles,
    files: files.map((file) => ({
      id: file.id,
      displayName: file.display_name,
      sizeBytes: Number(file.size_stored_bytes || 0),
      mimeType: file.detected_mime_type || file.mime_type || "application/octet-stream",
      sha256: String(file.sha256),
      storageKey: file.storage_key,
      storageBucket: file.storage_bucket,
      comments: commentsByFile.get(file.id) || [],
      createdAt: file.created_at,
      archiveFolder: workflow?.exportGroupsAsFolders ? (file.group_id ? groupNames.get(file.group_id) || "Csoport nélkül" : "Csoport nélkül") : null,
    })),
  });

  await writeDropEvent({
    packageId: grant.packageId,
    eventType: "package.download_zip.started",
    severity: "info",
    payload: { fileCount: archive.fileCount, sourceFileCount: archive.sourceFileCount, supplementalFileCount: archive.supplementalFileCount, totalBytes: archive.totalBytes, persistentArchiveCreated: false, reportPdfIncluded: includePdf, reportTxtIncluded: includeTxt, pdfImagesPerPage: input.pdfImagesPerPage || 1 },
  });
  archive.stream.once("end", () => {
    void writeDropEvent({
      packageId: grant.packageId,
      eventType: "package.download_zip.completed",
      severity: "info",
      payload: { fileCount: archive.fileCount, totalBytes: archive.totalBytes },
    }).catch(() => undefined);
  });
  archive.stream.once("error", (error) => {
    void writeDropEvent({
      packageId: grant.packageId,
      eventType: "package.download_zip.failed",
      severity: "error",
      payload: { fileCount: archive.fileCount, totalBytes: archive.totalBytes, error: error instanceof Error ? error.message.slice(0, 300) : "ZIP stream hiba" },
    }).catch(() => undefined);
  });

  return {
    stream: archive.stream,
    filename: safeZipFilename(grant.title, grant.publicCode, input.brandPrefix === true),
    fileCount: archive.fileCount,
    totalBytes: archive.totalBytes,
    persistentArchiveCreated: archive.persistentArchiveCreated,
    originalFilesRecompressed: archive.originalFilesRecompressed,
    secretsExposed: false,
  };
}
