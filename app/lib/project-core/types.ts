export type ProjectLifecycleStatus =
  | "DRAFT"
  | "ACTIVE"
  | "CLOSING"
  | "READ_ONLY"
  | "ARCHIVED"
  | "DELETION_SCHEDULED"
  | "DELETED";

export type ProjectMembershipRole =
  | "OWNER"
  | "PROJECT_MANAGER"
  | "CONTRIBUTOR"
  | "REVIEWER"
  | "VIEWER";

export type ProjectMembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REVOKED";

export type ProjectPermission =
  | "project.read"
  | "project.update"
  | "project.manage_members"
  | "project.manage_lifecycle"
  | "document.read"
  | "document.write"
  | "document.approve"
  | "issue.read"
  | "issue.write"
  | "calendar.read"
  | "calendar.write"
  | "dialog.read"
  | "dialog.write"
  | "approval.read"
  | "approval.write"
  | "approval.respond"
  | "diary.read"
  | "diary.write"
  | "diary.close"
  | "audit.read"
  | "export.create";

export type Project = {
  id: string;
  organizationId: string | null;
  code: string;
  name: string;
  description: string;
  status: ProjectLifecycleStatus;
  progressPercent: number;
  currentPhase: string;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMembership = {
  id: string;
  projectId: string;
  userId: string;
  email?: string;
  displayName: string;
  organizationName?: string;
  role: ProjectMembershipRole;
  status: ProjectMembershipStatus;
  invitedAt: string;
  acceptedAt: string | null;
  updatedAt: string;
};

export type ProjectAuditEntityType =
  | "project"
  | "membership"
  | "lifecycle"
  | "folder"
  | "document"
  | "document_version"
  | "sync"
  | "calendar_event"
  | "dialog_thread"
  | "dialog_message"
  | "decide_request"
  | "decide_approver"
  | "decide_note"
  | "diary_entry"
  | "diary_event"
  | "metadata"
  | "note"
  | "qr"
  | "box"
  | "box_item"
  | "saved_view"
  | "compare_job"
  | "compare_finding"
  | "issue"
  | "ai_job";

export type ProjectAuditEvent = {
  id: string;
  projectId: string;
  actorUserId: string;
  eventType: string;
  entityType: ProjectAuditEntityType;
  entityId: string;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type ProjectCoreState = {
  schemaVersion: 1;
  projects: Project[];
  memberships: ProjectMembership[];
  auditEvents: ProjectAuditEvent[];
  updatedAt: string;
};

export type ProjectAccessContext = {
  project: Project;
  membership: ProjectMembership;
  permissions: ProjectPermission[];
};

export type ProjectListItem = Project & {
  membership: ProjectMembership;
  permissions: ProjectPermission[];
  activeMemberCount: number;
};
