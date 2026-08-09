import { hostname } from "node:os";

function env(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function clampNumber(value: string, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

export type DropWorkerConfig = {
  enabled: boolean;
  workerId: string;
  secret: string;
  scannerMode: "clamd-instream" | "disabled";
  clamdSocket: string;
  scanTimeoutMs: number;
  maxScanBytes: number;
  claimLimit: number;
  leaseSeconds: number;
  retrySeconds: number;
  signedDownloadTtlSeconds: number;
  reportDeletionGateEnabled: boolean;
};

export function getDropWorkerConfig(): DropWorkerConfig {
  const secret = env("DROP_WORKER_SECRET");
  const scannerCommand = env("DIMPRO_DROP_VIRUS_SCANNER_COMMAND", env("DROP_VIRUS_SCANNER_COMMAND")).toLowerCase();
  const scannerMode = scannerCommand === "clamd-instream" ? "clamd-instream" : "disabled";
  const workerSuffix = env("DIMPRO_DROP_WORKER_ID", `${hostname()}-${process.pid}`)
    .replace(/[^a-zA-Z0-9._:-]+/g, "-")
    .slice(0, 120);
  return {
    enabled: secret.length >= 32 && scannerMode === "clamd-instream",
    workerId: `drop-v050:${workerSuffix}`,
    secret,
    scannerMode,
    clamdSocket: env("DIMPRO_DROP_CLAMD_SOCKET", "/var/run/clamav/clamd.ctl"),
    scanTimeoutMs: clampNumber(env("DIMPRO_DROP_SCAN_TIMEOUT_SECONDS", "900"), 900, 30, 3600) * 1000,
    maxScanBytes: clampNumber(env("DIMPRO_DROP_MAX_SCAN_MB", "550"), 550, 1, 600) * 1024 * 1024,
    claimLimit: clampNumber(env("DIMPRO_DROP_WORKER_CLAIM_LIMIT", "4"), 4, 1, 20),
    leaseSeconds: clampNumber(env("DIMPRO_DROP_WORKER_LEASE_SECONDS", "1200"), 1200, 60, 3600),
    retrySeconds: clampNumber(env("DIMPRO_DROP_WORKER_RETRY_SECONDS", "300"), 300, 30, 86400),
    signedDownloadTtlSeconds: clampNumber(env("DIMPRO_DROP_DOWNLOAD_URL_TTL_SECONDS", "180"), 180, 60, 900),
    reportDeletionGateEnabled: env("DIMPRO_DROP_RETENTION_REPORT_GATE", "true").toLowerCase() !== "false",
  };
}

export function getDropWorkerSafeStatus(config = getDropWorkerConfig()) {
  return {
    enabled: config.enabled,
    workerSecretConfigured: config.secret.length >= 32,
    scannerMode: config.scannerMode,
    clamdSocketConfigured: config.clamdSocket.startsWith("/"),
    scanTimeoutSeconds: Math.round(config.scanTimeoutMs / 1000),
    maxScanMb: Math.round(config.maxScanBytes / 1024 / 1024),
    claimLimit: config.claimLimit,
    leaseSeconds: config.leaseSeconds,
    retrySeconds: config.retrySeconds,
    signedDownloadTtlSeconds: config.signedDownloadTtlSeconds,
    reportDeletionGateEnabled: config.reportDeletionGateEnabled,
    secretsExposed: false,
  };
}
