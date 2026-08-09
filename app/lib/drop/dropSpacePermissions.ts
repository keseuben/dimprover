import type {
  DropSpace,
  DropSpaceAccessWindow,
  DropSpaceMembership,
  DropSpaceMembershipRole,
  DropSpacePermission,
  DropSpaceRuntimeMode,
} from "./dropSpaceTypes";

const ROLE_PERMISSIONS: Record<DropSpaceMembershipRole, DropSpacePermission[]> = {
  owner: [
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
  ],
  space_admin: [
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
  ],
  contributor: [
    "space.read",
    "package.create",
    "package.read_shared",
    "package.update_own",
    "package.share_own",
    "package.close_own",
    "file.upload",
    "file.download",
    "comment.write",
  ],
  uploader: [
    "space.read",
    "package.read_shared",
    "file.upload",
    "file.download",
    "comment.write",
  ],
  viewer: [
    "space.read",
    "package.read_shared",
    "file.download",
  ],
};

function toTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function earliestDate(candidates: Array<{ value: string | null | undefined; source: "license" | "project" | "fixed" }>) {
  const valid = candidates
    .map((candidate) => ({ ...candidate, timestamp: toTimestamp(candidate.value) }))
    .filter((candidate): candidate is typeof candidate & { timestamp: number; value: string } => candidate.timestamp !== null)
    .sort((left, right) => left.timestamp - right.timestamp);
  return valid[0] || null;
}

export function permissionsForDropSpaceRole(role: DropSpaceMembershipRole) {
  return [...ROLE_PERMISSIONS[role]];
}

export function resolveDropSpaceAccessWindow(space: DropSpace, now = new Date()): DropSpaceAccessWindow {
  const candidates: Array<{ value: string | null | undefined; source: "license" | "project" | "fixed" }> = [
    { value: space.licenseEndsAt, source: "license" },
  ];

  if (space.accessExpiryMode === "project") {
    candidates.push({ value: space.projectEndsAt, source: "project" });
  } else if (space.accessExpiryMode === "fixed") {
    candidates.push({ value: space.accessEndsAt, source: "fixed" });
  } else if (space.accessExpiryMode === "none") {
    // A fizető licenc lejárata ebben a módban is felső korlát marad.
  }

  const earliest = earliestDate(candidates);
  if (!earliest) throw new Error("DROP_SPACE_ACCESS_END_MISSING");

  const nowTimestamp = now.getTime();
  const graceTimestamp = toTimestamp(space.graceEndsAt);
  let runtimeMode: DropSpaceRuntimeMode = "writable";

  if (["deleted", "deletion_scheduled", "suspended"].includes(space.status)) {
    runtimeMode = "blocked";
  } else if (["read_only", "expired", "archived"].includes(space.status)) {
    runtimeMode = "read_only";
  } else if (nowTimestamp > earliest.timestamp) {
    runtimeMode = graceTimestamp !== null && nowTimestamp > graceTimestamp ? "blocked" : "read_only";
  } else if (space.status !== "active") {
    runtimeMode = "blocked";
  }

  return {
    effectiveEndsAt: earliest.value,
    source: earliest.source,
    runtimeMode,
    graceEndsAt: space.graceEndsAt,
  };
}

export function resolveMembershipAccessEnd(space: DropSpace, membership: DropSpaceMembership) {
  const spaceWindow = resolveDropSpaceAccessWindow(space);
  const membershipEnd = toTimestamp(membership.accessEndsAt);
  const spaceEnd = toTimestamp(spaceWindow.effectiveEndsAt);
  if (spaceEnd === null) throw new Error("DROP_SPACE_ACCESS_END_INVALID");
  if (membershipEnd === null || membershipEnd >= spaceEnd) return spaceWindow.effectiveEndsAt;
  return membership.accessEndsAt as string;
}

export function dropSpaceMembershipHasPermission(
  space: DropSpace,
  membership: DropSpaceMembership,
  permission: DropSpacePermission,
  now = new Date(),
) {
  if (membership.spaceId !== space.id || membership.status !== "active") return false;
  const membershipAccessEnd = toTimestamp(resolveMembershipAccessEnd(space, membership));
  if (membershipAccessEnd === null || now.getTime() > membershipAccessEnd) return false;
  const window = resolveDropSpaceAccessWindow(space, now);
  if (window.runtimeMode === "blocked") return false;
  if (window.runtimeMode === "read_only" && !["space.read", "package.read_all", "package.read_shared", "file.download", "space.audit.read"].includes(permission)) {
    return false;
  }
  if (permission === "package.create" && membership.isGuest && !space.allowGuestPackageCreation) return false;
  if (permission === "space.manage_members" && membership.isGuest && !space.allowGuestInvites) return false;
  return ROLE_PERMISSIONS[membership.role].includes(permission);
}

export function canCreatePackageInDropSpace(space: DropSpace, membership: DropSpaceMembership, now = new Date()) {
  return dropSpaceMembershipHasPermission(space, membership, "package.create", now);
}

export function canLinkProjectToDropSpace(space: DropSpace, membership: DropSpaceMembership, now = new Date()) {
  return dropSpaceMembershipHasPermission(space, membership, "space.manage_projects", now);
}
