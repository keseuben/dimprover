export type DialogThreadType =
  | "RFI"
  | "DATA_REQUEST"
  | "DESIGN_COMMENT"
  | "COORDINATION"
  | "DECISION_LOG";

export type DialogThreadStatus =
  | "OPEN"
  | "WAITING_RESPONSE"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED"
  | "CANCELLED";

export type DialogPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type DialogMessageType = "COMMENT" | "QUESTION" | "ANSWER" | "STATUS_NOTE";

export type DialogThread = {
  id: string;
  projectId: string;
  code: string;
  threadType: DialogThreadType;
  title: string;
  description: string;
  discipline: string;
  status: DialogThreadStatus;
  priority: DialogPriority;
  ownerUserId: string | null;
  ownerName: string;
  participantNames: string[];
  relatedDocumentIds: string[];
  dueAt: string | null;
  calendarEventId: string | null;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
};

export type DialogMessage = {
  id: string;
  projectId: string;
  threadId: string;
  messageType: DialogMessageType;
  body: string;
  authorUserId: string;
  authorName: string;
  createdAt: string;
};

export type DialogThreadBundle = {
  thread: DialogThread;
  messages: DialogMessage[];
};

export type DialogSummary = {
  total: number;
  open: number;
  waitingResponse: number;
  overdue: number;
  resolved: number;
  critical: number;
};
