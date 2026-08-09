export const DROP_SPACE_STATUSES = [
  "draft",
  "active",
  "read_only",
  "suspended",
  "expired",
  "archived",
  "deletion_scheduled",
  "deleted",
] as const;
export type DropSpaceStatus = (typeof DROP_SPACE_STATUSES)[number];

export const DROP_SPACE_MEMBERSHIP_ROLES = [
  "owner",
  "space_admin",
  "contributor",
  "uploader",
  "viewer",
] as const;
export type DropSpaceMembershipRole = (typeof DROP_SPACE_MEMBERSHIP_ROLES)[number];

export const DROP_SPACE_MEMBERSHIP_STATUSES = [
  "invited",
  "active",
  "suspended",
  "revoked",
  "expired",
] as const;
export type DropSpaceMembershipStatus = (typeof DROP_SPACE_MEMBERSHIP_STATUSES)[number];

export const DROP_SPACE_ACCESS_EXPIRY_MODES = ["license", "project", "fixed", "none"] as const;
export type DropSpaceAccessExpiryMode = (typeof DROP_SPACE_ACCESS_EXPIRY_MODES)[number];

export const DROP_SPACE_PACKAGE_VISIBILITIES = [
  "space_members",
  "selected_members",
  "project_members",
  "private",
] as const;
export type DropSpacePackageVisibility = (typeof DROP_SPACE_PACKAGE_VISIBILITIES)[number];

export const DROP_SPACE_PERMISSIONS = [
  "space.read",
  "space.update",
  "space.manage_members",
  "space.manage_projects",
  "space.manage_retention",
  "space.audit.read",
  "package.create",
  "package.read_all",
  "package.read_shared",
  "package.update_own",
  "package.share_own",
  "package.close_own",
  "package.manage_all",
  "file.upload",
  "file.download",
  "comment.write",
  "dock.publish",
  "drive.archive",
] as const;
export type DropSpacePermission = (typeof DROP_SPACE_PERMISSIONS)[number];

export type DropSpaceRuntimeMode = "writable" | "read_only" | "blocked";

export type DropSpace = {
  id: string;
  publicCode: string;
  name: string;
  description: string;
  organizationId: string | null;
  ownerLicenseId: string;
  ownerUserId: string | null;
  status: DropSpaceStatus;
  accessExpiryMode: DropSpaceAccessExpiryMode;
  accessEndsAt: string | null;
  licenseEndsAt: string;
  projectEndsAt: string | null;
  graceEndsAt: string | null;
  maxMembers: number;
  maxPackages: number;
  storageQuotaBytes: number;
  currentStorageBytes: number;
  allowGuestPackageCreation: boolean;
  allowGuestInvites: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
};

export type DropSpaceMembership = {
  id: string;
  spaceId: string;
  userId: string | null;
  email: string;
  displayName: string;
  organizationName: string | null;
  role: DropSpaceMembershipRole;
  status: DropSpaceMembershipStatus;
  isGuest: boolean;
  invitedByMembershipId: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  accessEndsAt: string | null;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DropSpaceProjectLink = {
  id: string;
  spaceId: string;
  projectId: string;
  projectNameSnapshot: string;
  syncToDock: boolean;
  allowDockPackageCreation: boolean;
  archiveToDrive: boolean;
  driveTargetFolderId: string | null;
  addedByMembershipId: string;
  createdAt: string;
  updatedAt: string;
};

export type DropSpacePackageContext = {
  spaceId: string;
  projectId: string | null;
  createdByMembershipId: string;
  visibility: DropSpacePackageVisibility;
  selectedMembershipIds: string[];
};

export type DropCreateSpaceInput = {
  name: string;
  description?: string;
  organizationId?: string;
  ownerLicenseId: string;
  ownerUserId?: string;
  licenseEndsAt: string;
  accessExpiryMode?: DropSpaceAccessExpiryMode;
  accessEndsAt?: string;
  projectEndsAt?: string;
  graceEndsAt?: string;
  maxMembers?: number;
  maxPackages?: number;
  storageQuotaBytes?: number;
  allowGuestPackageCreation?: boolean;
  allowGuestInvites?: boolean;
};

export type DropSpaceAccessWindow = {
  effectiveEndsAt: string;
  source: "license" | "project" | "fixed";
  runtimeMode: DropSpaceRuntimeMode;
  graceEndsAt: string | null;
};
