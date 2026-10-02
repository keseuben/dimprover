import type { ProjectAccessContext, ProjectMembershipRole } from "@/app/lib/project-core/types";
import { DriveCoreRepositoryError } from "./errors";
import {
  getDriveDocumentFolderAccessRecord,
  listDriveFolderAccessRows,
  listDriveFolderAclEntries,
  listDriveTree,
} from "./databaseRepository";
import {
  listDriveFolderPasswordRecords,
  type DriveFolderPasswordRecord,
} from "./folderPasswordRepository";
import { getCurrentDriveFolderUnlockGrants } from "./folderPasswordSession";
import type { DriveTree } from "./types";

export type DriveFolderAclPermission = "folder.view";
export type DriveFolderAclPrincipalType = "USER" | "ROLE";
export type DriveFolderAclEffect = "ALLOW" | "DENY";

export type DriveFolderSecurityState = "NORMAL" | "RESTRICTED" | "CUSTOM" | "PASSWORD";

export type DriveFolderAccessRow = {
  id: string;
  projectId: string;
  parentId: string | null;
  aclInherit: boolean;
  status: "ACTIVE" | "ARCHIVED";
};

export type DriveFolderAclEntry = {
  id: string;
  projectId: string;
  folderId: string;
  principalType: DriveFolderAclPrincipalType;
  membershipId: string | null;
  role: ProjectMembershipRole | null;
  permission: DriveFolderAclPermission;
  effect: DriveFolderAclEffect;
};

export type DriveFolderPasswordGateStatus = {
  folderId: string;
  passwordProtected: boolean;
  passwordUnlocked: boolean;
  unlockExpiresAt: number | null;
  unlockTtlMinutes: number | null;
  locked: boolean;
  gateFolderId: string | null;
  inheritedLock: boolean;
};

const PROJECT_ROLES = new Set<ProjectMembershipRole>([
  "OWNER",
  "PROJECT_MANAGER",
  "CONTRIBUTOR",
  "REVIEWER",
  "VIEWER",
]);

function notFoundFolder(): never {
  throw new DriveCoreRepositoryError(
    "A DRIVE mappa nem található.",
    "DRIVE_FOLDER_NOT_FOUND",
    404,
  );
}

function notFoundDocument(): never {
  throw new DriveCoreRepositoryError(
    "A DRIVE dokumentum nem található.",
    "DRIVE_DOCUMENT_NOT_FOUND",
    404,
  );
}

function passwordRequired(folderId: string): never {
  throw new DriveCoreRepositoryError(
    "A mappa jelszóval védett. A tartalom megnyitásához feloldás szükséges.",
    "DRIVE_FOLDER_PASSWORD_REQUIRED",
    423,
    { folderId },
  );
}

function hasProjectReadAccess(projectId: string, access: ProjectAccessContext) {
  return access.project.id === projectId
    && access.membership.projectId === projectId
    && access.membership.status === "ACTIVE"
    && access.permissions.includes("document.read");
}

function isValidFolderRow(projectId: string, row: DriveFolderAccessRow) {
  return row.projectId === projectId
    && row.status === "ACTIVE"
    && Boolean(row.id);
}

function normalizeAclEntries(
  projectId: string,
  folders: Map<string, DriveFolderAccessRow>,
  entries: DriveFolderAclEntry[],
) {
  const byFolder = new Map<string, DriveFolderAclEntry[]>();
  const invalidFolders = new Set<string>();

  for (const entry of entries) {
    const folder = folders.get(entry.folderId);
    if (!folder || entry.projectId !== projectId || folder.projectId !== projectId) {
      if (entry.folderId) invalidFolders.add(entry.folderId);
      continue;
    }

    const validCommon = entry.permission === "folder.view"
      && (entry.effect === "ALLOW" || entry.effect === "DENY")
      && (entry.principalType === "USER" || entry.principalType === "ROLE");

    const validPrincipal = entry.principalType === "USER"
      ? Boolean(entry.membershipId) && entry.role === null
      : entry.membershipId === null && Boolean(entry.role) && PROJECT_ROLES.has(entry.role as ProjectMembershipRole);

    if (!validCommon || !validPrincipal) {
      invalidFolders.add(entry.folderId);
      continue;
    }

    const bucket = byFolder.get(entry.folderId) || [];
    bucket.push(entry);
    byFolder.set(entry.folderId, bucket);
  }

  return { byFolder, invalidFolders };
}

function localOverrideAllows(
  folderId: string,
  access: ProjectAccessContext,
  byFolder: Map<string, DriveFolderAclEntry[]>,
  invalidFolders: Set<string>,
) {
  if (invalidFolders.has(folderId)) return false;

  const matching = (byFolder.get(folderId) || []).filter((entry) => (
    entry.permission === "folder.view"
    && (
      (entry.principalType === "USER" && entry.membershipId === access.membership.id)
      || (entry.principalType === "ROLE" && entry.role === access.membership.role)
    )
  ));

  if (matching.some((entry) => entry.effect === "DENY")) return false;
  return matching.some((entry) => entry.effect === "ALLOW");
}

export async function resolveAccessibleDriveFolderIds(
  projectId: string,
  access: ProjectAccessContext,
): Promise<Set<string>> {
  if (!hasProjectReadAccess(projectId, access)) return new Set<string>();

  const [folderRows, aclEntries] = await Promise.all([
    listDriveFolderAccessRows(projectId),
    listDriveFolderAclEntries(projectId),
  ]);

  const folders = new Map<string, DriveFolderAccessRow>();
  for (const row of folderRows) {
    if (isValidFolderRow(projectId, row)) folders.set(row.id, row);
  }

  const { byFolder, invalidFolders } = normalizeAclEntries(projectId, folders, aclEntries);
  const memo = new Map<string, boolean>();

  const evaluate = (folderId: string, visiting = new Set<string>()): boolean => {
    const cached = memo.get(folderId);
    if (cached !== undefined) return cached;

    const folder = folders.get(folderId);
    if (!folder || visiting.has(folderId)) {
      memo.set(folderId, false);
      return false;
    }

    visiting.add(folderId);

    let parentVisible = true;
    if (folder.parentId) {
      const parent = folders.get(folder.parentId);
      if (!parent || parent.projectId !== projectId) {
        visiting.delete(folderId);
        memo.set(folderId, false);
        return false;
      }
      parentVisible = evaluate(parent.id, visiting);
    }

    if (!parentVisible) {
      visiting.delete(folderId);
      memo.set(folderId, false);
      return false;
    }

    const visible = folder.aclInherit
      ? true
      : localOverrideAllows(folder.id, access, byFolder, invalidFolders);

    visiting.delete(folderId);
    memo.set(folderId, visible);
    return visible;
  };

  const accessible = new Set<string>();
  for (const folderId of folders.keys()) {
    if (evaluate(folderId)) accessible.add(folderId);
  }
  return accessible;
}

function grantMatches(
  password: DriveFolderPasswordRecord,
  grant: { passwordVersion: number; expiresAt: number } | undefined,
) {
  return Boolean(
    grant
    && grant.passwordVersion === password.passwordVersion
    && grant.expiresAt > Date.now(),
  );
}

async function resolvePasswordVisibility(
  projectId: string,
  accessibleFolderIds: ReadonlySet<string>,
) {
  const [folderRows, passwordRows, grants] = await Promise.all([
    listDriveFolderAccessRows(projectId),
    listDriveFolderPasswordRecords(projectId),
    getCurrentDriveFolderUnlockGrants(projectId),
  ]);

  const folders = new Map<string, DriveFolderAccessRow>();
  for (const row of folderRows) {
    if (isValidFolderRow(projectId, row)) folders.set(row.id, row);
  }
  const passwords = new Map(
    passwordRows
      .filter((row) => folders.has(row.folderId))
      .map((row) => [row.folderId, row] as const),
  );

  const lockedGate = (folderId: string, includeSelf: boolean) => {
    let currentId: string | null = includeSelf ? folderId : folders.get(folderId)?.parentId || null;
    const visiting = new Set<string>();

    while (currentId) {
      if (visiting.has(currentId)) return currentId;
      visiting.add(currentId);

      const folder = folders.get(currentId);
      if (!folder) return currentId;

      const password = passwords.get(currentId);
      if (password && !grantMatches(password, grants.get(currentId))) return currentId;
      currentId = folder.parentId;
    }
    return null;
  };

  const visibleFolderIds = new Set<string>();
  const contentAccessibleFolderIds = new Set<string>();
  const unlockedPasswordFolderIds = new Set<string>();

  for (const folderId of accessibleFolderIds) {
    if (!folders.has(folderId)) continue;
    if (!lockedGate(folderId, false)) visibleFolderIds.add(folderId);
    if (!lockedGate(folderId, true)) contentAccessibleFolderIds.add(folderId);

    const password = passwords.get(folderId);
    if (password && grantMatches(password, grants.get(folderId))) {
      unlockedPasswordFolderIds.add(folderId);
    }
  }

  return {
    folders,
    passwords,
    grants,
    visibleFolderIds,
    contentAccessibleFolderIds,
    unlockedPasswordFolderIds,
    lockedGate,
  };
}

export async function resolveDriveFolderSecurityStates(
  projectId: string,
): Promise<Map<string, DriveFolderSecurityState>> {
  const [folderRows, aclEntries, passwordRows] = await Promise.all([
    listDriveFolderAccessRows(projectId),
    listDriveFolderAclEntries(projectId),
    listDriveFolderPasswordRecords(projectId),
  ]);

  const entriesByFolder = new Map<string, DriveFolderAclEntry[]>();
  for (const entry of aclEntries) {
    if (entry.projectId !== projectId) continue;
    const bucket = entriesByFolder.get(entry.folderId) || [];
    bucket.push(entry);
    entriesByFolder.set(entry.folderId, bucket);
  }
  const passwordFolderIds = new Set(passwordRows.map((row) => row.folderId));

  const states = new Map<string, DriveFolderSecurityState>();
  for (const folder of folderRows) {
    if (folder.projectId !== projectId || folder.status !== "ACTIVE") continue;
    if (passwordFolderIds.has(folder.id)) {
      states.set(folder.id, "PASSWORD");
      continue;
    }
    if (folder.aclInherit) {
      states.set(folder.id, "NORMAL");
      continue;
    }
    const entries = entriesByFolder.get(folder.id) || [];
    states.set(folder.id, entries.some((entry) => entry.principalType === "USER") ? "CUSTOM" : "RESTRICTED");
  }
  return states;
}

export async function getDriveFolderPasswordGateStatus(
  projectId: string,
  folderId: string,
): Promise<DriveFolderPasswordGateStatus> {
  const [folderRows, passwordRows, grants] = await Promise.all([
    listDriveFolderAccessRows(projectId),
    listDriveFolderPasswordRecords(projectId),
    getCurrentDriveFolderUnlockGrants(projectId),
  ]);

  const folders = new Map<string, DriveFolderAccessRow>();
  for (const row of folderRows) {
    if (isValidFolderRow(projectId, row)) folders.set(row.id, row);
  }
  if (!folders.has(folderId)) notFoundFolder();

  const passwords = new Map(passwordRows.map((row) => [row.folderId, row] as const));
  const chain: string[] = [];
  let currentId: string | null = folderId;
  const visiting = new Set<string>();

  while (currentId) {
    if (visiting.has(currentId)) notFoundFolder();
    visiting.add(currentId);
    const folder = folders.get(currentId);
    if (!folder) notFoundFolder();
    chain.push(currentId);
    currentId = folder.parentId;
  }
  chain.reverse();

  let gateFolderId: string | null = null;
  for (const id of chain) {
    const password = passwords.get(id);
    if (password && !grantMatches(password, grants.get(id))) {
      gateFolderId = id;
      break;
    }
  }

  const directPassword = passwords.get(folderId) || null;
  const directGrant = directPassword ? grants.get(folderId) : undefined;
  const passwordUnlocked = Boolean(directPassword && grantMatches(directPassword, directGrant));

  return {
    folderId,
    passwordProtected: Boolean(directPassword),
    passwordUnlocked,
    unlockExpiresAt: passwordUnlocked ? directGrant?.expiresAt || null : null,
    unlockTtlMinutes: directPassword?.unlockTtlMinutes || null,
    locked: Boolean(gateFolderId),
    gateFolderId,
    inheritedLock: Boolean(gateFolderId && gateFolderId !== folderId),
  };
}

export async function canAccessDriveFolder(
  projectId: string,
  folderId: string,
  access: ProjectAccessContext,
  permission: DriveFolderAclPermission = "folder.view",
) {
  if (permission !== "folder.view") return false;
  const accessible = await resolveAccessibleDriveFolderIds(projectId, access);
  if (!accessible.has(folderId)) return false;
  const passwordState = await resolvePasswordVisibility(projectId, accessible);
  return passwordState.contentAccessibleFolderIds.has(folderId);
}

export async function requireDriveFolderAclAccess(
  projectId: string,
  folderId: string,
  access: ProjectAccessContext,
  permission: DriveFolderAclPermission = "folder.view",
) {
  if (permission !== "folder.view") notFoundFolder();
  const accessible = await resolveAccessibleDriveFolderIds(projectId, access);
  if (!accessible.has(folderId)) notFoundFolder();
  return { folderId, permission } as const;
}

export async function requireDriveFolderAccess(
  projectId: string,
  folderId: string,
  access: ProjectAccessContext,
  permission: DriveFolderAclPermission = "folder.view",
) {
  await requireDriveFolderAclAccess(projectId, folderId, access, permission);
  const status = await getDriveFolderPasswordGateStatus(projectId, folderId);
  if (status.locked) passwordRequired(status.gateFolderId || folderId);
  return { folderId, permission } as const;
}

export async function requireDriveDocumentAccess(
  projectId: string,
  documentId: string,
  access: ProjectAccessContext,
  permission: DriveFolderAclPermission = "folder.view",
) {
  if (permission !== "folder.view" || !hasProjectReadAccess(projectId, access)) {
    notFoundDocument();
  }

  const document = await getDriveDocumentFolderAccessRecord(projectId, documentId);
  if (!document) notFoundDocument();

  const accessible = await resolveAccessibleDriveFolderIds(projectId, access);
  if (!accessible.has(document.folderId)) notFoundDocument();

  const status = await getDriveFolderPasswordGateStatus(projectId, document.folderId);
  if (status.locked) passwordRequired(status.gateFolderId || document.folderId);

  return document;
}

export async function listDriveTreeForAccess(
  projectId: string,
  access: ProjectAccessContext,
): Promise<DriveTree> {
  const accessibleFolderIds = await resolveAccessibleDriveFolderIds(projectId, access);
  const [folderSecurityStates, passwordVisibility] = await Promise.all([
    resolveDriveFolderSecurityStates(projectId),
    resolvePasswordVisibility(projectId, accessibleFolderIds),
  ]);

  return listDriveTree(
    projectId,
    passwordVisibility.visibleFolderIds,
    folderSecurityStates,
    passwordVisibility.contentAccessibleFolderIds,
    passwordVisibility.unlockedPasswordFolderIds,
  );
}
