export type ProjectDriveLicenseStatus =
  | "NOT_CONFIGURED" | "NOT_ASSIGNED" | "DRAFT" | "PENDING_APPROVAL"
  | "ACTIVE" | "SUSPENDED" | "EXPIRED" | "CANCELLED";

/** An expired commercial contract never implies file deletion. */
export function projectLicenseStatus(
  status: string,
  expiresAt: Date | string | null,
  now: number,
): ProjectDriveLicenseStatus {
  if (status === "ACTIVE" && expiresAt && Date.parse(String(expiresAt)) < now) return "EXPIRED";
  if (status === "ACTIVE" || status === "DRAFT" || status === "PENDING_APPROVAL" ||
    status === "SUSPENDED" || status === "EXPIRED" || status === "CANCELLED") return status;
  return "NOT_ASSIGNED";
}
