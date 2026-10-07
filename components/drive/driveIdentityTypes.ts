export type DriveUserIdentityType = "PERSONAL" | "WORK";
export type DriveUserIdentityStatus = "PENDING" | "VERIFIED" | "DISABLED";

export type DriveUserIdentity = {
  id: string;
  userId: string;
  identityType: DriveUserIdentityType;
  email: string;
  displayName: string | null;
  organizationName: string | null;
  status: DriveUserIdentityStatus;
  isPrimary: boolean;
  verifiedAt: string | null;
  createdAt: string;
};

export type DriveUserIdentitiesPayload = {
  ok?: boolean;
  error?: string;
  message?: string;
  identities?: DriveUserIdentity[];
  identity?: DriveUserIdentity;
};

export function driveIdentityLabel(identity: DriveUserIdentity) {
  const name = identity.displayName?.trim() || identity.email;
  const context = identity.identityType === "WORK"
    ? identity.organizationName?.trim() || "Munkahelyi identitás"
    : identity.isPrimary ? "Személyes · elsődleges" : "Személyes";
  return `${name} · ${context} · ${identity.email}`;
}
