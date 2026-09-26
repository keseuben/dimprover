import type {
  ProjectMembership,
  ProjectMembershipRole,
  ProjectPermission,
} from "./types";

export const PROJECT_ROLE_LABELS: Record<ProjectMembershipRole, string> = {
  OWNER: "Beruházási projektvezető",
  PROJECT_MANAGER: "Projektvezető",
  REVIEWER: "Ellenőrző",
  CONTRIBUTOR: "Közreműködő",
  VIEWER: "Megtekintő",
};

export function projectRoleLabel(role: ProjectMembershipRole | string | null | undefined) {
  if (!role) return "Projekt résztvevő";
  return PROJECT_ROLE_LABELS[role as ProjectMembershipRole] || "Projekt résztvevő";
}

const ROLE_PERMISSIONS: Record<ProjectMembershipRole, ProjectPermission[]> = {
  OWNER: [
    "project.read",
    "calendar.read",
    "calendar.write",
    "project.update",
    "project.manage_members",
    "project.manage_lifecycle",
    "document.read",
    "document.comment",
    "document.write",
    "document.approve",
    "document.issue",
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
    "document.comment",
    "document.write",
    "document.approve",
    "document.issue",
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
    "document.comment",
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
    "document.comment",
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
