export type DriveAuthGrantValidity = {
  valid_from: Date | string;
  valid_until: Date | string | null;
  revoked_at: Date | string | null;
};

/** Access-grant dates are not paid subscription expiry dates. */
export function classifyDriveAccessGrant(
  grant: DriveAuthGrantValidity,
  now: number,
): "ACTIVE" | "PENDING" | "EXPIRED" | "REVOKED" {
  if (grant.revoked_at) return "REVOKED";
  if (Date.parse(String(grant.valid_from)) > now) return "PENDING";
  if (grant.valid_until && Date.parse(String(grant.valid_until)) < now) return "EXPIRED";
  return "ACTIVE";
}
