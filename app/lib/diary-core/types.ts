export type DiaryEntryStatus = "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
export type DiaryWeatherCondition =
  | "CLEAR"
  | "PARTLY_CLOUDY"
  | "CLOUDY"
  | "RAIN"
  | "SNOW"
  | "STORM"
  | "FOG"
  | "OTHER";

export type DiaryEventType =
  | "WORK_PROGRESS"
  | "OBSTACLE"
  | "INCIDENT"
  | "INSPECTION"
  | "DELIVERY"
  | "SAFETY"
  | "WEATHER"
  | "NOTE";

export type DiaryEventStatus = "OPEN" | "RESOLVED" | "CANCELLED";
export type DiarySeverity = "INFO" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DiaryEntry = {
  id: string;
  projectId: string;
  code: string;
  diaryDate: string;
  title: string;
  status: DiaryEntryStatus;
  weatherCondition: DiaryWeatherCondition;
  weatherNote: string;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  workforceTotal: number;
  workforceBreakdown: string[];
  workSummary: string;
  blockerSummary: string;
  safetySummary: string;
  inspectionSummary: string;
  relatedDocumentIds: string[];
  nextEventNumber: number;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closingNote: string;
};

export type DiaryEvent = {
  id: string;
  projectId: string;
  entryId: string;
  sequenceNumber: number;
  code: string;
  eventType: DiaryEventType;
  title: string;
  description: string;
  status: DiaryEventStatus;
  severity: DiarySeverity;
  occurredAt: string;
  responsibleUserId: string | null;
  responsibleName: string;
  dueAt: string | null;
  calendarEventId: string | null;
  relatedDocumentIds: string[];
  dialogThreadId: string | null;
  decideRequestId: string | null;
  resolution: string;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type DiaryEntryBundle = {
  entry: DiaryEntry;
  events: DiaryEvent[];
};

export type DiarySummary = {
  total: number;
  draft: number;
  open: number;
  closed: number;
  today: number;
  unresolvedEvents: number;
  criticalEvents: number;
};
