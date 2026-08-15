import { DriveCoreRepositoryError } from "./errors";
import { getDriveObjectStream } from "./s3ObjectStorage";
import {
  beginDriveVersionSecurityScan,
  completeDriveVersionSecurityScan,
  getDriveVersionSecurityContext,
} from "./securityScanRepository";
import { reviewDriveQuarantinedVersion } from "./reviewService";
import type { DropWorkerConfig } from "@/app/lib/drop/worker/dropWorkerConfig";
import { DropScannerError, getClamdHealth, scanAsyncIterableWithClamd } from "@/app/lib/drop/worker/clamdInstream";

function env(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function clampNumber(value: string, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function getDriveScannerConfig(): DropWorkerConfig {
  const scannerCommand = env(
    "DIMPRO_DRIVE_VIRUS_SCANNER_COMMAND",
    env("DIMPRO_DROP_VIRUS_SCANNER_COMMAND", env("DROP_VIRUS_SCANNER_COMMAND", "clamd-instream")),
  ).toLowerCase();
  const scannerMode = scannerCommand === "clamd-instream" ? "clamd-instream" : "disabled";
  return {
    enabled: scannerMode === "clamd-instream",
    workerId: `drive-security:${process.pid}`,
    secret: "drive-security-local-scanner",
    scannerMode,
    clamdSocket: env("DIMPRO_DRIVE_CLAMD_SOCKET", env("DIMPRO_DROP_CLAMD_SOCKET", "/var/run/clamav/clamd.ctl")),
    scanTimeoutMs: clampNumber(env("DIMPRO_DRIVE_SCAN_TIMEOUT_SECONDS", env("DIMPRO_DROP_SCAN_TIMEOUT_SECONDS", "900")), 900, 30, 3600) * 1000,
    maxScanBytes: clampNumber(env("DIMPRO_DRIVE_MAX_SCAN_MB", env("DIMPRO_DROP_MAX_SCAN_MB", "550")), 550, 1, 600) * 1024 * 1024,
    claimLimit: 1,
    leaseSeconds: 1200,
    retrySeconds: 300,
    signedDownloadTtlSeconds: 180,
    reportDeletionGateEnabled: true,
  };
}

function scannerError(error: unknown) {
  if (error instanceof DropScannerError) {
    return {
      code: error.code.replace(/^DROP_/, "DRIVE_"),
      message: error.message.replace(/DROP/g, "DRIVE"),
      status: error.status,
      retryable: error.retryable,
    };
  }
  return {
    code: "DRIVE_SECURITY_SCANNER_FAILED",
    message: error instanceof Error ? error.message : "A DRIVE vírusvizsgálat ismeretlen hibával leállt.",
    status: 502,
    retryable: true,
  };
}

export async function getDriveSecurityScannerHealth() {
  const config = getDriveScannerConfig();
  if (!config.enabled || config.scannerMode !== "clamd-instream") {
    return {
      ready: false,
      scannerSource: "shared-drop-clamd" as const,
      mode: config.scannerMode,
      socketConfigured: config.clamdSocket.startsWith("/"),
      maxScanMb: Math.round(config.maxScanBytes / 1024 / 1024),
      ping: null,
      engine: null,
      engineVersion: null,
      signatureVersion: null,
      signatureDate: null,
      errorCode: "DRIVE_SECURITY_SCANNER_DISABLED",
    };
  }
  try {
    const health = await getClamdHealth(config);
    return {
      ready: health.ping === "PONG",
      scannerSource: "shared-drop-clamd" as const,
      mode: config.scannerMode,
      socketConfigured: config.clamdSocket.startsWith("/"),
      maxScanMb: Math.round(config.maxScanBytes / 1024 / 1024),
      ping: health.ping,
      engine: health.version.engine,
      engineVersion: health.version.engineVersion,
      signatureVersion: health.version.signatureVersion,
      signatureDate: health.version.signatureDate,
      errorCode: null,
    };
  } catch (error) {
    const normalized = scannerError(error);
    return {
      ready: false,
      scannerSource: "shared-drop-clamd" as const,
      mode: config.scannerMode,
      socketConfigured: config.clamdSocket.startsWith("/"),
      maxScanMb: Math.round(config.maxScanBytes / 1024 / 1024),
      ping: null,
      engine: null,
      engineVersion: null,
      signatureVersion: null,
      signatureDate: null,
      errorCode: normalized.code,
    };
  }
}

export async function scanDriveQuarantinedVersion(input: {
  projectId: string;
  documentId: string;
  versionId: string;
  actorUserId: string;
}) {
  const started = await beginDriveVersionSecurityScan(input);
  const config = getDriveScannerConfig();
  const attempt = started.scan.attempt;
  const startedAt = started.scan.startedAt;

  try {
    if (!config.enabled || config.scannerMode !== "clamd-instream") {
      throw new DropScannerError(
        "A megosztott DROP/DRIVE ClamAV scanner ezen a környezeten nincs aktiválva.",
        "DROP_SCANNER_DISABLED",
        false,
        503,
      );
    }
    const object = await getDriveObjectStream({
      storageKey: started.version.storageKey!,
      bucket: started.version.storageBucket,
    });
    if (object.contentLength !== started.version.sizeBytes) {
      throw new DriveCoreRepositoryError(
        "A vírusvizsgálatra megnyitott objektum mérete eltér a dokumentumverzió hitelesített méretétől.",
        "DRIVE_SECURITY_SIZE_MISMATCH",
        409,
      );
    }

    const result = await scanAsyncIterableWithClamd(object.body, started.version.sizeBytes, config);
    if (!started.version.sha256 || result.sha256.toLowerCase() !== started.version.sha256.toLowerCase()) {
      throw new DriveCoreRepositoryError(
        "A ClamAV-vizsgálat közben számított SHA-256 lenyomat eltér a feltöltéskor hitelesített lenyomattól.",
        "DRIVE_SECURITY_HASH_MISMATCH",
        409,
      );
    }

    const completedAt = new Date().toISOString();
    const scan = await completeDriveVersionSecurityScan({
      ...input,
      scan: {
        status: result.status === "clean" ? "CLEAN" : "INFECTED",
        attempt,
        startedAt,
        completedAt,
        engine: result.version.engine,
        engineVersion: result.version.engineVersion,
        signatureVersion: result.version.signatureVersion,
        signatureName: result.signatureName,
        sha256: result.sha256,
        bytesScanned: result.bytesScanned,
        errorCode: null,
        errorMessage: null,
        scannerSource: "shared-drop-clamd",
      },
    });

    if (scan.status === "INFECTED") {
      const rejection = await reviewDriveQuarantinedVersion({
        projectId: input.projectId,
        documentId: input.documentId,
        versionId: input.versionId,
        body: {
          action: "REJECT",
          note: `ClamAV vírusveszély: ${scan.signatureName || "ismeretlen találat"}. Automatikus biztonsági elutasítás.`,
        },
        actorUserId: input.actorUserId,
      });
      return { ok: true as const, scan, autoRejected: true, rejection };
    }

    return { ok: true as const, scan, autoRejected: false, rejection: null };
  } catch (error) {
    const normalized = error instanceof DriveCoreRepositoryError
      ? { code: error.code, message: error.message, status: error.status, retryable: false }
      : scannerError(error);
    await completeDriveVersionSecurityScan({
      ...input,
      scan: {
        status: "ERROR",
        attempt,
        startedAt,
        completedAt: new Date().toISOString(),
        engine: null,
        engineVersion: null,
        signatureVersion: null,
        signatureName: null,
        sha256: null,
        bytesScanned: null,
        errorCode: normalized.code,
        errorMessage: normalized.message.slice(0, 1000),
        scannerSource: "shared-drop-clamd",
      },
    }).catch(() => undefined);
    throw new DriveCoreRepositoryError(
      normalized.message,
      normalized.code,
      normalized.status,
      { retryable: normalized.retryable },
    );
  }
}

export async function getDriveVersionSecurityStatus(input: {
  projectId: string;
  documentId: string;
  versionId: string;
}) {
  const context = await getDriveVersionSecurityContext(input);
  return {
    ok: true as const,
    versionId: input.versionId,
    status: context.scan?.status || "PENDING",
    scan: context.scan,
  };
}
