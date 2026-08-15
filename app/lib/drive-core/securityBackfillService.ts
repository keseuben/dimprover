import { DriveCoreRepositoryError } from "./errors";
import {
  listDriveLegacySecurityBackfillPlan,
  requarantineDriveLegacyVersion,
  type DriveSecurityBackfillCandidate,
} from "./securityBackfillRepository";
import { scanDriveQuarantinedVersion } from "./securityScanService";

function boundedExecutionLimit(value: number | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(10, Math.floor(parsed)));
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 25);
}

export async function getDriveSecurityBackfillPlan(input: {
  projectId?: string | null;
  versionIds?: string[];
  limit?: number;
} = {}) {
  return listDriveLegacySecurityBackfillPlan({
    projectId: input.projectId,
    versionIds: input.versionIds,
    limit: input.limit,
  });
}

export async function executeDriveSecurityBackfill(input: {
  projectId?: string | null;
  versionIds?: string[];
  limit?: number;
  actorUserId: string;
}) {
  const projectId = input.projectId?.trim() || null;
  const versionIds = unique(input.versionIds || []);
  if (!projectId && !versionIds.length) {
    throw new DriveCoreRepositoryError(
      "Legacy security backfill végrehajtásához projectId vagy explicit versionIds szükséges.",
      "DRIVE_SECURITY_BACKFILL_SCOPE_REQUIRED",
      400,
    );
  }

  const limit = boundedExecutionLimit(input.limit);
  const before = await listDriveLegacySecurityBackfillPlan({
    projectId,
    versionIds,
    limit: Math.max(limit * 3, 20),
  });
  const executable = before.candidates
    .filter((candidate) => candidate.canScan && candidate.state !== "CLEAN_AWAITING_APPROVAL")
    .slice(0, limit);

  const results: Array<{
    projectId: string;
    documentId: string;
    versionId: string;
    versionNumber: number;
    previousState: DriveSecurityBackfillCandidate["state"];
    outcome: "CLEAN_AWAITING_APPROVAL" | "INFECTED_REJECTED" | "ERROR";
    scanStatus: string;
    autoRejected: boolean;
    errorCode: string | null;
    error: string | null;
  }> = [];

  for (const candidate of executable) {
    try {
      await requarantineDriveLegacyVersion({
        projectId: candidate.projectId,
        documentId: candidate.documentId,
        versionId: candidate.versionId,
        actorUserId: input.actorUserId,
      });
      const scan = await scanDriveQuarantinedVersion({
        projectId: candidate.projectId,
        documentId: candidate.documentId,
        versionId: candidate.versionId,
        actorUserId: input.actorUserId,
      });
      const infected = scan.scan.status === "INFECTED" || scan.autoRejected;
      results.push({
        projectId: candidate.projectId,
        documentId: candidate.documentId,
        versionId: candidate.versionId,
        versionNumber: candidate.versionNumber,
        previousState: candidate.state,
        outcome: infected ? "INFECTED_REJECTED" : "CLEAN_AWAITING_APPROVAL",
        scanStatus: scan.scan.status,
        autoRejected: scan.autoRejected,
        errorCode: null,
        error: null,
      });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code || "DRIVE_SECURITY_BACKFILL_FAILED")
        : "DRIVE_SECURITY_BACKFILL_FAILED";
      results.push({
        projectId: candidate.projectId,
        documentId: candidate.documentId,
        versionId: candidate.versionId,
        versionNumber: candidate.versionNumber,
        previousState: candidate.state,
        outcome: "ERROR",
        scanStatus: "ERROR",
        autoRejected: false,
        errorCode: code,
        error: error instanceof Error ? error.message.slice(0, 1000) : "A legacy security backfill ismeretlen hibával leállt.",
      });
    }
  }

  const after = await listDriveLegacySecurityBackfillPlan({
    projectId,
    versionIds,
    limit: Math.max(limit * 4, 30),
  });
  const clean = results.filter((result) => result.outcome === "CLEAN_AWAITING_APPROVAL").length;
  const infected = results.filter((result) => result.outcome === "INFECTED_REJECTED").length;
  const failed = results.filter((result) => result.outcome === "ERROR").length;

  return {
    ok: failed === 0,
    version: "0.5.1",
    processed: results.length,
    cleanAwaitingApproval: clean,
    infectedRejected: infected,
    failed,
    results,
    before: before.summary,
    after: after.summary,
    safety: {
      autoApproval: false,
      cleanRequiresHumanApproval: true,
      infectedAutoReject: true,
      failClosed: true,
    },
  };
}
