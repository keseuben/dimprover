export type ProjectCalendarEventType =
  | "MEETING"
  | "DEADLINE"
  | "TASK"
  | "INSPECTION"
  | "MILESTONE"
  | "REMINDER";

export type ProjectCalendarSourceModule =
  | "DOCK"
  | "DIALOG"
  | "DECIDE"
  | "DIARY"
  | "DRIVE"
  | "SYSTEM";

export type ProjectCalendarEventStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type ProjectCalendarPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ProjectCalendarEvent = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  eventType: ProjectCalendarEventType;
  sourceModule: ProjectCalendarSourceModule;
  status: ProjectCalendarEventStatus;
  priority: ProjectCalendarPriority;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string;
  ownerUserId: string | null;
  ownerName: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type ProjectCalendarSummary = {
  total: number;
  overdue: number;
  today: number;
  upcoming7Days: number;
  completed: number;
  byType: Record<ProjectCalendarEventType, number>;
};
