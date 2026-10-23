/**
 * Pure, READ-ONLY triage of orphaned multipart sessions.
 * It never performs cleanup, releases quota, relabels CLEAN or retries an
 * ambiguous S3 completion. A privileged reconciler requires separate review.
 */
import type { PersonalMultipartStatus } from "./personalMultipartPolicy";

export type PersonalMultipartReconcileAction =
  | "NONE"
  | "CHECK_S3_PARTS"
  | "RETRY_S3_ABORT_WITH_REVIEW"
  | "VERIFY_WHOLE_OBJECT_AND_QUARANTINE"
  | "REVIEW_FULL_FILE_SCAN"
  | "REVIEW_SCAN_WORKER"
  | "MANUAL_SECURITY_REVIEW";

export type PersonalMultipartObservation = {
  status: PersonalMultipartStatus;
  sizeBytes: number;
  uploadedBytes: number;
  expiresAtMs: number;
  nowMs: number;
  s3MultipartExists: boolean | null;
  s3WholeObjectSizeBytes: number | null;
  completeFileSha256Verified: boolean;
  fullFileMalwareScanClean: boolean;
  hasContentRef: boolean;
};

export function planPersonalMultipartReconciliation(
  observation: PersonalMultipartObservation,
): {
  action: PersonalMultipartReconcileAction;
  canReleaseQuota: false;
  canMarkClean: false;
  requiresHumanReview: boolean;
  reason: string;
} {
  const blocked = (action: PersonalMultipartReconcileAction, reason: string) => ({
    action, reason,
    canReleaseQuota: false as const,
    canMarkClean: false as const,
    requiresHumanReview: action !== "NONE",
  });
  if (!Number.isSafeInteger(observation.sizeBytes) || observation.sizeBytes <= 0
      || !Number.isSafeInteger(observation.uploadedBytes)
      || observation.uploadedBytes < 0 || observation.uploadedBytes > observation.sizeBytes
      || !Number.isFinite(observation.nowMs)
      || !Number.isFinite(observation.expiresAtMs)) {
    return blocked("MANUAL_SECURITY_REVIEW", "CORRUPTED_MULTIPART_OBSERVATION");
  }
  switch (observation.status) {
    case "INITIATED":
    case "UPLOADING":
      return blocked(
        observation.nowMs >= observation.expiresAtMs
          ? "RETRY_S3_ABORT_WITH_REVIEW" : "CHECK_S3_PARTS",
        "UPLOADING_SESSION_NOT_RELEASED");
    case "ABORTING":
      return blocked("RETRY_S3_ABORT_WITH_REVIEW", "ABORT_PENDING_S3_CONFIRMATION");
    case "COMPLETING":
      return blocked(
        observation.s3WholeObjectSizeBytes === observation.sizeBytes
          ? "VERIFY_WHOLE_OBJECT_AND_QUARANTINE"
          : "MANUAL_SECURITY_REVIEW",
        "COMPLETE_S3_OUTCOME_UNKNOWN");
    case "QUARANTINED":
      return blocked("REVIEW_FULL_FILE_SCAN", "FILE_NOT_YET_CLEARED");
    case "SCANNING":
      return blocked("REVIEW_SCAN_WORKER", "SCAN_OUTCOME_NOT_COMMITTED");
    case "REJECTED":
    case "EXPIRED":
      return blocked("MANUAL_SECURITY_REVIEW", "CLEANUP_NOT_AUTOMATIC");
    case "ABORTED":
      return blocked(observation.s3MultipartExists === false && observation.s3WholeObjectSizeBytes === null
        ? "NONE" : "MANUAL_SECURITY_REVIEW", "VERIFY_ABORTED_ARTIFACTS");
    case "CLEAN":
      return blocked(observation.hasContentRef && observation.completeFileSha256Verified
        && observation.fullFileMalwareScanClean
        ? "NONE" : "MANUAL_SECURITY_REVIEW", "VERIFY_CLEAN_REF_AND_SCAN");
  }
}
