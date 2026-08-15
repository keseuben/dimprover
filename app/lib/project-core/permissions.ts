import type {
  ProjectMembership,
  ProjectMembershipRole,
  ProjectPermission,
} from "./types";

const ROLE_PERMISSIONS: Record<ProjectMembershipRole, ProjectPermission[]> = {
  OWNER: [
    "project.read",
    "calendar.read",
    "calendar.write",
    "project.update",
    "project.manage_members",
    "project.manage_lifecycle",
    "document.read",
    "document.write",
    "document.approve",
    "issue.read",
    "issue.write",
    "dialog.read",
    "dialog.write",
    "approval.read",
    "approval.write",
    "approval.respond",
    "diary.read",
    "diary.write",
    "diary.close",
    "audit.read",
    "export.create",
  ],
  PROJECT_MANAGER: [
    "project.read",
    "calendar.read",
    "calendar.write",
    "project.update",
    "project.manage_members",
    "project.manage_lifecycle",
    "document.read",
    "document.write",
    "document.approve",
    "issue.read",
    "issue.write",
    "dialog.read",
    "dialog.write",
    "approval.read",
    "approval.write",
    "approval.respond",
    "diary.read",
    "diary.write",
    "diary.close",
    "audit.read",
    "export.create",
  ],
  CONTRIBUTOR: [
    "project.read",
    "calendar.read",
    "calendar.write",
    "document.read",
    "document.write",
    "issue.read",
    "issue.write",
    "dialog.read",
    "dialog.write",
    "approval.read",
    "approval.write",
    "diary.read",
    "diary.write",
  ],
  REVIEWER: [
    "project.read",
    "calendar.read",
    "document.read",
    "document.approve",
    "issue.read",
    "dialog.read",
    "dialog.write",
    "approval.read",
    "approval.respond",
    "diary.read",
    "audit.read",
  ],
  VIEWER: [
    "project.read",
    "calendar.read",
    "document.read",
    "issue.read",
    "dialog.read",
    "approval.read",
    "diary.read",
  ],
};

export function permissionsForRole(role: ProjectMembershipRole) {
  return [...ROLE_PERMISSIONS[role]];
}

export function membershipHasPermission(
  membership: ProjectMembership,
  permission: ProjectPermission,
) {
  if (membership.status !== "ACTIVE") return false;
  return ROLE_PERMISSIONS[membership.role].includes(permission);
}
