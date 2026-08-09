export type DropOperationsStatus = "ok" | "warning" | "error";

export type DropOperationsCheck = {
  id: string;
  label: string;
  status: DropOperationsStatus;
  value: string;
  detail: string;
  action?: string;
};

export type DropOperationsStorageAudit = {
  requested: boolean;
  provider: string;
  bucket: string;
  databaseObjectCount: number;
  scannedObjectCount: number;
  orphanObjectCount: number;
  missingObjectCount: number;
  sizeMismatchCount: number;
  truncated: boolean;
  orphanSamples: string[];
  missingSamples: string[];
  error: string | null;
};

export type DropOperationsSnapshot = {
  version: "DROP 1.2.11";
  source: "manual" | "worker" | "api";
  collectedAt: string;
  durationMs: number;
  status: DropOperationsStatus;
  label: string;
  deepStorageAudit: boolean;
  metrics: {
    packages: {
      total: number;
      active: number;
      created24h: number;
      created7d: number;
      bytesStored: number;
      pastGraceNotDeleted: number;
      statusCounts: Record<string, number>;
      workflow24h: Record<string, number>;
    };
    uploads: {
      active: number;
      stale: number;
      failed24h: number;
      completed24h: number;
      uploadedBytes24h: number;
    };
    security: {
      failedAccess24h: number;
      failedAccess7d: number;
      failedSendCode24h: number;
      topIpFailureCount24h: number;
      botBlocks24h: number;
      infectedFiles: number;
      scanErrors: number;
      staleScanQueue: number;
    };
    delivery: {
      emailsSent24h: number;
      emailsFailed24h: number;
      emailFailureRate24h: number;
      downloads24h: number;
      downloadedPackages24h: number;
      finalizationFailed: number;
    };
    worker: {
      queued: number;
      retry: number;
      failed: number;
      staleRunning: number;
    };
    cleanup: {
      pending: number;
      failed: number;
      stale: number;
    };
    publicWorkflows: {
      sendCodes: number;
      gates: number;
      sessions: number;
      workflows: number;
      usage: number;
    };
  };
  storageAudit: DropOperationsStorageAudit;
  checks: DropOperationsCheck[];
  alert: {
    fingerprint: string;
    required: boolean;
    notificationCreated: boolean;
    emailAttempted: boolean;
    emailSent: boolean;
    emailReason: string;
  };
};

export type DropOperationsHistoryItem = Pick<DropOperationsSnapshot,
  "version" | "source" | "collectedAt" | "durationMs" | "status" | "label" | "deepStorageAudit" | "metrics" | "storageAudit" | "checks"
>;
