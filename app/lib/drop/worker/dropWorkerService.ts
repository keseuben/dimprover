import { abortDropS3Multipart, deleteDropS3Object, openDropS3Object } from "../storage/dropS3Storage";
import { removeDropStoredFile } from "../storage/dropLocalStorage";
import {
  abortDropUpload,
  completeDropObjectCleanup,
  getDropUploadBundle,
  queueDropObjectCleanup,
} from "../storage/dropStorageRepository";
import { processDropObjectCleanup } from "../storage/dropUploadService";
import { getDropStorageSafeStatus } from "../storage/dropStorageConfig";
import { getDropFeatureFlags } from "../dropFeatureFlags";
import { getDropDriveArchiveState, processDropDriveArchive } from "../archive/dropDriveArchiveService";
import { processDropFinalReport } from "../report/dropFinalReportService";
import { getLatestDropFinalReport, isDropReportFresh, loadDropFinalReportBundle } from "../report/dropReportRepository";
import { getAutomatedDropStatusTarget } from "../dropPackageLifecycle";
import { runScheduledDropOperationsMonitor } from "../operations/dropOperationsService";
import { processDropPublicFinalizationCandidates } from "../public/dropPublicFinalizeService";
import { transitionDropPackageStatus } from "../dropAdminService";
import { supabaseDropAdminRepository } from "../dropSupabaseAdminRepository";
import { DropScannerError, getClamdHealth, scanAsyncIterableWithClamd } from "./clamdInstream";
import { getDropWorkerConfig } from "./dropWorkerConfig";
import {
  applyDropFileScanResult,
  claimDropWorkerJobs,
  countDropPackageLiveFiles,
  finishDropWorkerJob,
  getDropWorkerFile,
  getDropWorkerSchemaHealth,
  listDropDuePackages,
  listDropPackageWorkerFiles,
  listDropScanCandidates,
  listDropStaleUploadSessions,
  markDropFileObjectDeleted,
  markDropPackageFinalReportQueued,
  queueDropWorkerJob,
  startDropFileScan,
  writeDropWorkerEvent,
  type DropWorkerJob,
} from "./dropWorkerRepository";

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Ismeretlen DROP worker hiba.").slice(0, 2000);
}

function scanQueuePriority(file: Awaited<ReturnType<typeof listDropScanCandidates>>[number]) {
  if (file.is_image) return { name: "image", offsetMs: 60_000 } as const;
  if (file.size_stored_bytes <= 25 * 1024 * 1024) return { name: "small-file", offsetMs: 30_000 } as const;
  return { name: "standard", offsetMs: 0 } as const;
}

async function queueScanCandidates(limit: number) {
  const files = await listDropScanCandidates(limit);
  for (const file of files) {
    const priority = scanQueuePriority(file);
    await queueDropWorkerJob({
      type: "scan_file",
      packageId: file.package_id,
      fileId: file.id,
      jobKey: `scan_file:${file.id}`,
      maxAttempts: 5,
      runAfter: new Date(Date.now() - priority.offsetMs).toISOString(),
      payload: {
        fileId: file.id,
        packageId: file.package_id,
        storageBucket: file.storage_bucket,
        storageKey: file.storage_key,
        priority: priority.name,
        sizeBytes: file.size_stored_bytes,
      },
    });
  }
  return files.length;
}

async function deleteFileObjectDurably(input: {
  packageId: string;
  fileId: string;
  storageProvider: string;
  storageBucket: string;
  storageKey: string;
  reason: string;
}) {
  if (input.storageProvider === "s3-compatible") {
    const task = await queueDropObjectCleanup({
      packageId: input.packageId,
      fileId: input.fileId,
      storageBucket: input.storageBucket,
      storageKey: input.storageKey,
      operation: "DELETE_OBJECT",
      reason: input.reason,
    });
    try {
      await deleteDropS3Object({ storageKey: input.storageKey, bucket: input.storageBucket });
      await completeDropObjectCleanup({ taskId: task.id, success: true });
    } catch (error) {
      await completeDropObjectCleanup({ taskId: task.id, success: false, error: errorMessage(error) }).catch(() => undefined);
      throw error;
    }
  } else {
    await removeDropStoredFile({ storageKey: input.storageKey });
  }
  return markDropFileObjectDeleted(input.fileId, input.reason);
}

async function processScanJob(job: DropWorkerJob) {
  const config = getDropWorkerConfig();
  if (!job.file_id) {
    await finishDropWorkerJob({ jobId: job.id, workerId: config.workerId, success: true });
    return { jobId: job.id, status: "skipped", reason: "missing-file-id" };
  }
  const current = await getDropWorkerFile(job.file_id);
  if (!current || current.deleted_at || current.virus_scan_status === "clean") {
    await finishDropWorkerJob({ jobId: job.id, workerId: config.workerId, success: true });
    return { jobId: job.id, fileId: job.file_id, status: "idempotent" };
  }
  if (current.virus_scan_status === "infected" || current.security_status === "infected") {
    try {
      await deleteFileObjectDurably({
        packageId: current.package_id,
        fileId: current.id,
        storageProvider: current.storage_provider,
        storageBucket: current.storage_bucket,
        storageKey: current.storage_key,
        reason: `Korábban észlelt vírusveszély miatt törölve: ${current.scan_signature_name || "ismeretlen ClamAV találat"}`,
      });
      await finishDropWorkerJob({ jobId: job.id, workerId: config.workerId, success: true });
      return { jobId: job.id, fileId: current.id, status: "infected-cleanup-completed", objectDeleted: true };
    } catch (error) {
      const message = errorMessage(error);
      await finishDropWorkerJob({
        jobId: job.id,
        workerId: config.workerId,
        success: false,
        error: message,
        retryAfterSeconds: config.retrySeconds,
      }).catch(() => undefined);
      return { jobId: job.id, fileId: current.id, status: "infected-cleanup-error", error: message };
    }
  }

  let scanStarted = false;
  let resultApplied = false;
  try {
    const file = await startDropFileScan(job.file_id, config.workerId);
    scanStarted = true;
    const opened = await openDropS3Object({ storageKey: file.storage_key, bucket: file.storage_bucket });
    const source = opened.body as unknown as AsyncIterable<Uint8Array>;
    if (!source || typeof source[Symbol.asyncIterator] !== "function") {
      throw new DropScannerError("Az S3 objektum nem adott streamelhető adatfolyamot.", "DROP_SCANNER_STREAM_UNAVAILABLE");
    }
    if (opened.contentLength !== file.size_stored_bytes) {
      throw new DropScannerError("Az S3 objektum mérete eltér az adatbázisban rögzített mérettől.", "DROP_SCANNER_SIZE_MISMATCH");
    }
    const scan = await scanAsyncIterableWithClamd(source, opened.contentLength, config);
    const updated = await applyDropFileScanResult({
      fileId: file.id,
      workerId: config.workerId,
      result: scan.status,
      sha256: scan.sha256,
      engine: scan.version.engine,
      engineVersion: scan.version.engineVersion,
      signatureVersion: scan.version.signatureVersion,
      signatureName: scan.signatureName,
    });
    resultApplied = true;

    if (scan.status === "infected") {
      await deleteFileObjectDurably({
        packageId: updated.package_id,
        fileId: updated.id,
        storageProvider: updated.storage_provider,
        storageBucket: updated.storage_bucket,
        storageKey: updated.storage_key,
        reason: `Vírusveszély miatt törölve: ${scan.signatureName || "ismeretlen ClamAV találat"}`,
      });
    }
    await finishDropWorkerJob({ jobId: job.id, workerId: config.workerId, success: true });
    return {
      jobId: job.id,
      fileId: updated.id,
      status: scan.status,
      bytesScanned: scan.bytesScanned,
      sha256Stored: true,
      objectDeleted: scan.status === "infected",
    };
  } catch (error) {
    const message = errorMessage(error);
    if (scanStarted && !resultApplied) {
      await applyDropFileScanResult({
        fileId: job.file_id,
        workerId: config.workerId,
        result: "error",
        error: message,
        engine: "ClamAV",
      }).catch(() => undefined);
    }
    await finishDropWorkerJob({
      jobId: job.id,
      workerId: config.workerId,
      success: false,
      error: message,
      retryAfterSeconds: config.retrySeconds,
    }).catch(() => undefined);
    return { jobId: job.id, fileId: job.file_id, status: "error", error: message };
  }
}

async function processFinalReportJob(job: DropWorkerJob) {
  const config = getDropWorkerConfig();
  if (!job.package_id) {
    await finishDropWorkerJob({ jobId: job.id, workerId: config.workerId, success: true });
    return { jobId: job.id, status: "skipped", reason: "missing-package-id" };
  }
  try {
    const result = await processDropFinalReport(job.package_id);
    await finishDropWorkerJob({ jobId: job.id, workerId: config.workerId, success: true });
    return { jobId: job.id, ...result };
  } catch (error) {
    const message = errorMessage(error);
    const retryable = !(error && typeof error === "object" && "retryable" in error)
      || (error as { retryable?: boolean }).retryable !== false;
    await finishDropWorkerJob({
      jobId: job.id,
      workerId: config.workerId,
      success: false,
      error: message,
      retryAfterSeconds: retryable ? config.retrySeconds : 86_400,
    }).catch(() => undefined);
    return { jobId: job.id, packageId: job.package_id, status: "error", retryable, error: message };
  }
}

async function processDriveArchiveJob(job: DropWorkerJob) {
  const config = getDropWorkerConfig();
  if (!job.package_id || job.payload?.action !== "archive_to_drive") {
    await finishDropWorkerJob({ jobId: job.id, workerId: config.workerId, success: true });
    return { jobId: job.id, status: "skipped", reason: "not-a-drive-archive-job" };
  }
  try {
    const result = await processDropDriveArchive(job.package_id);
    await finishDropWorkerJob({ jobId: job.id, workerId: config.workerId, success: true });
    return { jobId: job.id, ...result };
  } catch (error) {
    const message = errorMessage(error);
    const retryable = !(error && typeof error === "object" && "retryable" in error)
      || (error as { retryable?: boolean }).retryable !== false;
    await finishDropWorkerJob({
      jobId: job.id,
      workerId: config.workerId,
      success: false,
      error: message,
      retryAfterSeconds: retryable ? config.retrySeconds : 86_400,
    }).catch(() => undefined);
    return { jobId: job.id, packageId: job.package_id, status: "error", retryable, error: message };
  }
}

async function processStaleUploadSessions(limit: number) {
  const sessions = await listDropStaleUploadSessions(limit);
  const results = [];
  for (const session of sessions) {
    const bundle = await getDropUploadBundle(session.id).catch(() => null);
    if (!bundle) continue;
    try {
      if (session.storage_provider === "s3-compatible" && session.storage_multipart_id) {
        try {
          await abortDropS3Multipart({ storageKey: session.storage_key || bundle.file.storage_key, uploadId: session.storage_multipart_id });
        } catch (error) {
          await queueDropObjectCleanup({
            packageId: session.package_id,
            fileId: session.file_id,
            sessionId: session.id,
            storageBucket: session.storage_bucket || bundle.file.storage_bucket,
            storageKey: session.storage_key || bundle.file.storage_key,
            storageMultipartId: session.storage_multipart_id,
            operation: "ABORT_MULTIPART",
            reason: `Lejárt multipart session abort újrapróbálása: ${errorMessage(error)}`,
          });
        }
      }
      await abortDropUpload({
        sessionId: session.id,
        failureCode: "DROP_UPLOAD_SESSION_EXPIRED",
        failureMessage: "A feltöltési munkamenet lejárt és a retention worker lezárta.",
      });
      results.push({ sessionId: session.id, success: true });
    } catch (error) {
      results.push({ sessionId: session.id, success: false, error: errorMessage(error) });
    }
  }
  return results;
}

async function ensureFinalReportJob(packageRow: Awaited<ReturnType<typeof listDropDuePackages>>[number]) {
  if (!getDropFeatureFlags().pdfReportEnabled) return false;
  const bundle = await loadDropFinalReportBundle(packageRow.id);
  const latest = await getLatestDropFinalReport(packageRow.id);
  if (latest && isDropReportFresh(latest, bundle) && ["sent", "completed"].includes(latest.status)) {
    return true;
  }
  await markDropPackageFinalReportQueued(packageRow.id);
  await queueDropWorkerJob({
    type: "generate_final_report",
    packageId: packageRow.id,
    jobKey: `generate_final_report:${packageRow.id}`,
    maxAttempts: 10,
    payload: {
      packageId: packageRow.id,
      requiredBeforeDeletion: true,
      sendToUploader: packageRow.send_final_report_to_uploader !== false,
      sendToInvitees: packageRow.send_final_report_to_invitees !== false,
    },
  });
  return false;
}

async function ensureDriveArchiveJob(packageRow: Awaited<ReturnType<typeof listDropDuePackages>>[number]) {
  const state = await getDropDriveArchiveState(packageRow.id);
  if (!state.required) return true;
  if (state.ready) return true;
  if (!getDropFeatureFlags().driveArchiveEnabled) return false;
  await queueDropWorkerJob({
    type: "advance_package_lifecycle",
    packageId: packageRow.id,
    jobKey: `archive_to_drive:${packageRow.id}`,
    maxAttempts: 10,
    payload: {
      action: "archive_to_drive",
      packageId: packageRow.id,
      projectId: packageRow.project_id,
      requiredBeforeDeletion: true,
    },
  });
  return false;
}

async function processDeletingPackage(packageRow: Awaited<ReturnType<typeof listDropDuePackages>>[number]) {
  const config = getDropWorkerConfig();
  const reportReady = config.reportDeletionGateEnabled ? await ensureFinalReportJob(packageRow) : true;
  if (!reportReady) {
    return { packageId: packageRow.id, status: "report-blocked", deletedFiles: 0 };
  }
  const driveArchiveReady = await ensureDriveArchiveJob(packageRow);
  if (!driveArchiveReady) {
    return { packageId: packageRow.id, status: "drive-archive-blocked", deletedFiles: 0 };
  }

  const files = await listDropPackageWorkerFiles(packageRow.id);
  let deletedFiles = 0;
  const errors: string[] = [];
  for (const file of files) {
    try {
      await deleteFileObjectDurably({
        packageId: file.package_id,
        fileId: file.id,
        storageProvider: file.storage_provider,
        storageBucket: file.storage_bucket,
        storageKey: file.storage_key,
        reason: "A DROP megőrzési idő és a kötelező végleges riport után automatikusan törölve.",
      });
      deletedFiles += 1;
    } catch (error) {
      errors.push(`${file.id}: ${errorMessage(error)}`);
    }
  }

  const remaining = await countDropPackageLiveFiles(packageRow.id);
  if (remaining === 0 && errors.length === 0 && packageRow.status === "deleting") {
    await transitionDropPackageStatus(supabaseDropAdminRepository, {
      packageId: packageRow.id,
      targetStatus: "deleted",
      actor: { userId: "drop-retention-worker", name: "DIMPRO DROP retention worker" },
      reason: "A kötelező riport után minden ideiglenes tárhelyobjektum törölve.",
    });
  }
  return { packageId: packageRow.id, status: errors.length ? "partial-error" : "processed", deletedFiles, remaining, errors };
}

async function processPackageLifecycle(limit: number) {
  const packages = await listDropDuePackages(limit);
  const results = [];
  for (const packageRow of packages) {
    try {
      if (packageRow.status === "deleting") {
        results.push(await processDeletingPackage(packageRow));
        continue;
      }

      if (packageRow.status === "upload_closed") {
        const reportReady = await ensureFinalReportJob(packageRow);
        const driveArchiveReady = reportReady ? await ensureDriveArchiveJob(packageRow) : false;
        results.push({ packageId: packageRow.id, status: "upload-closed-archive", reportReady, driveArchiveReady });
        continue;
      }

      if (packageRow.status === "expiring" || packageRow.status === "expired") {
        const reportReady = await ensureFinalReportJob(packageRow);
        const driveArchiveReady = reportReady ? await ensureDriveArchiveJob(packageRow) : false;
        if (new Date(packageRow.grace_expires_at).getTime() <= Date.now() && reportReady && driveArchiveReady) {
          const changed = await transitionDropPackageStatus(supabaseDropAdminRepository, {
            packageId: packageRow.id,
            targetStatus: "deleting",
            actor: { userId: "drop-retention-worker", name: "DIMPRO DROP retention worker" },
            reason: "A megőrzési türelmi idő lejárt, a végleges riport és a kötelező Drive archívum elkészült.",
          });
          results.push({ packageId: packageRow.id, status: changed.package.status, reportReady: true, driveArchiveReady: true });
        } else {
          results.push({ packageId: packageRow.id, status: "report-archive-or-grace-pending", reportReady, driveArchiveReady });
        }
        continue;
      }

      const target = getAutomatedDropStatusTarget(packageRow);
      if (target) {
        const changed = await transitionDropPackageStatus(supabaseDropAdminRepository, {
          packageId: packageRow.id,
          targetStatus: target,
          actor: { userId: "drop-retention-worker", name: "DIMPRO DROP retention worker" },
          reason: "Automatikus DROP megőrzési életciklus.",
        });
        if (target === "upload_closed" || target === "expiring") {
          const reportReady = await ensureFinalReportJob(changed.package);
          if (reportReady) await ensureDriveArchiveJob(changed.package);
        }
        results.push({ packageId: packageRow.id, status: changed.package.status });
      }
    } catch (error) {
      const message = errorMessage(error);
      await writeDropWorkerEvent({
        packageId: packageRow.id,
        eventType: "package.retention_error",
        severity: "error",
        payload: { error: message },
      }).catch(() => undefined);
      results.push({ packageId: packageRow.id, status: "error", error: message });
    }
  }
  return results;
}

async function finalizeCompletedCleanupTasks() {
  const result = await processDropObjectCleanup(100);
  for (const item of result.results) {
    if (item.success && item.task.file_id && item.task.operation === "DELETE_OBJECT") {
      await markDropFileObjectDeleted(item.task.file_id, item.task.reason || "Tartós DROP objektumtakarítás befejezve.").catch(() => undefined);
    }
  }
  return result;
}

export async function runDropWorkerCycle(input: { limit?: number; scanOnly?: boolean } = {}) {
  const config = getDropWorkerConfig();
  const schema = await getDropWorkerSchemaHealth();
  if (!schema.ready) {
    throw new DropScannerError("A DROP 0.5.0 worker adatbázissémája még nem aktív.", "DROP_WORKER_SCHEMA_NOT_READY", false, 503);
  }
  if (!config.enabled) {
    throw new DropScannerError("A DROP worker secret vagy a ClamAV mód nincs beállítva.", "DROP_WORKER_DISABLED", false, 503);
  }
  const scanner = await getClamdHealth(config);
  const limit = Math.max(1, Math.min(input.limit || config.claimLimit, 20));
  const queuedCandidates = await queueScanCandidates(200);
  const jobs = await claimDropWorkerJobs({
    workerId: config.workerId,
    types: ["scan_file"],
    limit,
    leaseSeconds: config.leaseSeconds,
  });
  const scanResults = await Promise.all(jobs.map((job) => processScanJob(job)));
  if (input.scanOnly) {
    return {
      ok: true as const,
      version: "DROP 1.2.13",
      mode: "scan-only" as const,
      workerId: config.workerId,
      scanner: {
        ping: scanner.ping,
        engine: scanner.version.engine,
        engineVersion: scanner.version.engineVersion,
        signatureVersion: scanner.version.signatureVersion,
        signatureDate: scanner.version.signatureDate,
      },
      queuedCandidates,
      claimedScanJobs: jobs.length,
      scanResults,
      scanConcurrency: Math.min(limit, 2),
      publicDownloadEnabled: getDropStorageSafeStatus().publicDownloadReady,
      secretsExposed: false,
      completedAt: new Date().toISOString(),
    };
  }
  const staleSessions = await processStaleUploadSessions(100);
  const publicFinalization = await processDropPublicFinalizationCandidates(20).catch((error) => ({
    candidates: 0,
    results: [{ status: "error", error: errorMessage(error) }],
  }));
  const lifecycle = await processPackageLifecycle(100);
  const reportJobs = getDropFeatureFlags().pdfReportEnabled
    ? await claimDropWorkerJobs({
        workerId: config.workerId,
        types: ["generate_final_report", "send_final_report"],
        limit: 1,
        leaseSeconds: Math.max(config.leaseSeconds, 3600),
      })
    : [];
  const reportResults = [];
  for (const job of reportJobs) reportResults.push(await processFinalReportJob(job));
  const archiveJobs = getDropFeatureFlags().driveArchiveEnabled
    ? await claimDropWorkerJobs({
        workerId: config.workerId,
        types: ["advance_package_lifecycle"],
        limit: 1,
        leaseSeconds: Math.max(config.leaseSeconds, 3600),
      })
    : [];
  const archiveResults = [];
  for (const job of archiveJobs) archiveResults.push(await processDriveArchiveJob(job));
  const cleanup = await finalizeCompletedCleanupTasks();
  const operationsMonitor = await runScheduledDropOperationsMonitor().catch((error) => ({
    executed: false as const,
    reason: "scheduled-error",
    error: errorMessage(error),
  }));

  return {
    ok: true as const,
    version: "DROP 1.2.13",
    mode: "full" as const,
    workerId: config.workerId,
    scanner: {
      ping: scanner.ping,
      engine: scanner.version.engine,
      engineVersion: scanner.version.engineVersion,
      signatureVersion: scanner.version.signatureVersion,
      signatureDate: scanner.version.signatureDate,
    },
    queuedCandidates,
    claimedScanJobs: jobs.length,
    scanResults,
    scanConcurrency: Math.min(limit, 2),
    staleSessions,
    publicFinalization,
    lifecycle,
    claimedReportJobs: reportJobs.length,
    reportResults,
    claimedArchiveJobs: archiveJobs.length,
    archiveResults,
    cleanup: {
      attempted: cleanup.attempted,
      completed: cleanup.completed,
      failed: cleanup.failed,
    },
    operationsMonitor,
    publicDownloadEnabled: getDropStorageSafeStatus().publicDownloadReady,
    secretsExposed: false,
    completedAt: new Date().toISOString(),
  };
}
