import type { DriveVersionStatus } from "./types";

export const DRIVE_BUSINESS_LIFECYCLE_STATUSES = [
  "BEJOVO",
  "ELLENORZES_ALATT",
  "ERVENYES",
  "KIADOTT",
  "ARCHIV",
] as const;

export type DriveBusinessLifecycleStatus = typeof DRIVE_BUSINESS_LIFECYCLE_STATUSES[number];

export const DRIVE_REVIEW_DECISIONS = ["PENDING", "APPROVED", "REJECTED"] as const;
export type DriveReviewDecision = typeof DRIVE_REVIEW_DECISIONS[number];

export const DRIVE_ISSUE_STATUSES = ["NOT_ISSUED", "ISSUED", "WITHDRAWN", "SUPERSEDED"] as const;
export type DriveIssueStatus = typeof DRIVE_ISSUE_STATUSES[number];

export const DRIVE_TECHNICAL_AVAILABILITY = ["BLOCKED", "INTERNAL", "DOWNLOADABLE"] as const;
export type DriveTechnicalAvailability = typeof DRIVE_TECHNICAL_AVAILABILITY[number];

export const DRIVE_BUSINESS_LIFECYCLE_TRANSITIONS: Readonly<
  Record<DriveBusinessLifecycleStatus, readonly DriveBusinessLifecycleStatus[]>
> = {
  BEJOVO: ["ELLENORZES_ALATT"],
  ELLENORZES_ALATT: ["ERVENYES"],
  ERVENYES: ["KIADOTT"],
  KIADOTT: ["ARCHIV"],
  ARCHIV: [],
};

export function canTransitionDriveBusinessLifecycle(
  from: DriveBusinessLifecycleStatus,
  to: DriveBusinessLifecycleStatus,
) {
  return DRIVE_BUSINESS_LIFECYCLE_TRANSITIONS[from].includes(to);
}

export type DriveLegacyLifecycleProjection = {
  technicalVersionStatus: DriveVersionStatus;
  businessStatus: DriveBusinessLifecycleStatus | null;
  reviewDecision: DriveReviewDecision | null;
  issueStatus: DriveIssueStatus;
  technicalAvailability: DriveTechnicalAvailability;
  requiresExplicitReviewRecord: boolean;
  requiresExplicitIssueRecord: boolean;
  reason: string;
};

/**
 * Compatibility projection for the existing DRIVE technical version status.
 *
 * IMPORTANT:
 * - This is not persistence and must not be used as an authoritative business state.
 * - AVAILABLE is deliberately NOT converted to KIADOTT.
 * - Formal issue requires an explicit issue record.
 * - Rejection remains a decision result and is not a business lifecycle state.
 */
export function projectLegacyDriveVersionStatus(
  status: DriveVersionStatus,
): DriveLegacyLifecycleProjection {
  switch (status) {
    case "METADATA_ONLY":
      return {
        technicalVersionStatus: status,
        businessStatus: "BEJOVO",
        reviewDecision: null,
        issueStatus: "NOT_ISSUED",
        technicalAvailability: "BLOCKED",
        requiresExplicitReviewRecord: true,
        requiresExplicitIssueRecord: true,
        reason: "A metaadat-rekord regisztrált, de nincs kiadható objektumverzió.",
      };
    case "STAGED":
      return {
        technicalVersionStatus: status,
        businessStatus: "BEJOVO",
        reviewDecision: null,
        issueStatus: "NOT_ISSUED",
        technicalAvailability: "BLOCKED",
        requiresExplicitReviewRecord: true,
        requiresExplicitIssueRecord: true,
        reason: "A technikai staging nem jelent szakmai ellenőrzést vagy kiadást.",
      };
    case "QUARANTINED":
      return {
        technicalVersionStatus: status,
        businessStatus: "ELLENORZES_ALATT",
        reviewDecision: "PENDING",
        issueStatus: "NOT_ISSUED",
        technicalAvailability: "BLOCKED",
        requiresExplicitReviewRecord: true,
        requiresExplicitIssueRecord: true,
        reason: "A karantén technikai ellenőrzési állapot; formális kiadás előtt review szükséges.",
      };
    case "AVAILABLE":
      return {
        technicalVersionStatus: status,
        businessStatus: null,
        reviewDecision: null,
        issueStatus: "NOT_ISSUED",
        technicalAvailability: "DOWNLOADABLE",
        requiresExplicitReviewRecord: true,
        requiresExplicitIssueRecord: true,
        reason: "Az AVAILABLE csak technikai elérhetőség; önmagában nem bizonyít ERVENYES vagy KIADOTT üzleti állapotot.",
      };
    case "REJECTED":
      return {
        technicalVersionStatus: status,
        businessStatus: null,
        reviewDecision: "REJECTED",
        issueStatus: "NOT_ISSUED",
        technicalAvailability: "BLOCKED",
        requiresExplicitReviewRecord: false,
        requiresExplicitIssueRecord: true,
        reason: "Az elutasítás döntési eredmény, nem önálló dokumentuméletciklus-státusz.",
      };
  }
}
