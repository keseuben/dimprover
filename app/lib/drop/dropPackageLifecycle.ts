import type { DropPackageRecord, DropPackageStatus } from "./dropTypes";

export class DropLifecycleError extends Error {
  code: string;
  status: number;
  from: DropPackageStatus;
  to: DropPackageStatus;

  constructor(from: DropPackageStatus, to: DropPackageStatus) {
    super(`A Drop csomag állapota nem módosítható ${from} állapotról ${to} állapotra.`);
    this.name = "DropLifecycleError";
    this.code = "DROP_INVALID_STATUS_TRANSITION";
    this.status = 409;
    this.from = from;
    this.to = to;
  }
}

const DROP_STATUS_TRANSITIONS: Record<DropPackageStatus, readonly DropPackageStatus[]> = {
  draft: ["preparing", "active", "deleting", "deleted"],
  preparing: ["active", "failed", "deleting"],
  active: ["upload_closed", "expiring", "reporting", "deleting", "failed"],
  upload_closed: ["expiring", "reporting", "deleting", "failed"],
  expiring: ["reporting", "deleting", "expired", "failed"],
  reporting: ["deleting", "expired", "failed"],
  deleting: ["deleted", "failed"],
  expired: ["deleting", "deleted"],
  deleted: [],
  failed: ["preparing", "deleting", "deleted"],
};

export function getAllowedDropStatusTransitions(status: DropPackageStatus) {
  return [...DROP_STATUS_TRANSITIONS[status]];
}

export function canTransitionDropPackageStatus(from: DropPackageStatus, to: DropPackageStatus) {
  return from === to || DROP_STATUS_TRANSITIONS[from].includes(to);
}

export function assertDropPackageStatusTransition(from: DropPackageStatus, to: DropPackageStatus) {
  if (!canTransitionDropPackageStatus(from, to)) {
    throw new DropLifecycleError(from, to);
  }
}

export function isDropPackageTerminal(status: DropPackageStatus) {
  return status === "deleted";
}

export function isDropPackagePubliclyAccessible(status: DropPackageStatus) {
  return status === "active" || status === "upload_closed";
}

export function isDropPackageUploadWindowOpen(
  packageRow: Pick<DropPackageRecord, "status" | "upload_opens_at" | "upload_closes_at" | "expires_at">,
  now = new Date(),
) {
  if (packageRow.status !== "active") return false;
  const timestamp = now.getTime();
  const opensAt = packageRow.upload_opens_at ? new Date(packageRow.upload_opens_at).getTime() : Number.NEGATIVE_INFINITY;
  const closesAt = packageRow.upload_closes_at ? new Date(packageRow.upload_closes_at).getTime() : new Date(packageRow.expires_at).getTime();
  return timestamp >= opensAt && timestamp < closesAt && timestamp < new Date(packageRow.expires_at).getTime();
}

export function getAutomatedDropStatusTarget(
  packageRow: Pick<DropPackageRecord, "status" | "upload_closes_at" | "expires_at" | "grace_expires_at">,
  now = new Date(),
): DropPackageStatus | null {
  const timestamp = now.getTime();
  const expiresAt = new Date(packageRow.expires_at).getTime();
  const graceExpiresAt = new Date(packageRow.grace_expires_at).getTime();
  const uploadClosesAt = packageRow.upload_closes_at
    ? new Date(packageRow.upload_closes_at).getTime()
    : expiresAt;

  if (packageRow.status === "active") {
    if (timestamp >= expiresAt) return "expiring";
    if (timestamp >= uploadClosesAt) return "upload_closed";
  }
  if (packageRow.status === "upload_closed" && timestamp >= expiresAt) {
    return "expiring";
  }
  if ((packageRow.status === "expiring" || packageRow.status === "expired") && timestamp >= graceExpiresAt) {
    return "deleting";
  }
  return null;
}
