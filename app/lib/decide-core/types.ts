export type DecideRequestType =
  | "PLAN_APPROVAL"
  | "PRODUCT_SUBSTITUTION"
  | "COST_IMPACT"
  | "SCHEDULE_IMPACT"
  | "TECHNICAL_DECISION";

export type DecideRequestStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED"
  | "CANCELLED";

export type DecidePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type DecideStageMode = "ALL" | "ANY";
export type DecideApproverStatus =
  | "WAITING"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED"
  | "SKIPPED";
export type DecideResponse = "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
export type DecideNoteType = "COMMENT" | "STATUS_NOTE";

export type DecideRequest = {
  id: string;
  projectId: string;
  code: string;
  requestType: DecideRequestType;
  title: string;
  description: string;
  status: DecideRequestStatus;
  priority: DecidePriority;
  requesterUserId: string;
  requesterName: string;
  ownerUserId: string | null;
  ownerName: string;
  dueAt: string | null;
  costImpactMinor: number | null;
  currency: string;
  scheduleImpactDays: number | null;
  relatedDocumentIds: string[];
  dialogThreadId: string | null;
  calendarEventId: string | null;
  currentStage: number;
  stageCount: number;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  resolvedAt: string | null;
};

export type DecideApprover = {
  id: string;
  projectId: string;
  requestId: string;
  stageNumber: number;
  stageMode: DecideStageMode;
  approverUserId: string;
  approverName: string;
  approverRole: string;
  status: DecideApproverStatus;
  responseComment: string;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DecideNote = {
  id: string;
  projectId: string;
  requestId: string;
  noteType: DecideNoteType;
  body: string;
  authorUserId: string;
  authorName: string;
  createdAt: string;
};

export type DecideRequestBundle = {
  request: DecideRequest;
  approvers: DecideApprover[];
  notes: DecideNote[];
};

export type DecideSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  changesRequested: number;
  overdue: number;
  critical: number;
};
