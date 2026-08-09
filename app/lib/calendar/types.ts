export const calendarEventToneValues = [
  "dimpro-event-blue",
  "dimpro-event-cyan",
  "dimpro-event-sky",
  "dimpro-event-indigo",
  "dimpro-event-green",
  "dimpro-event-lime",
  "dimpro-event-yellow",
  "dimpro-event-orange",
  "dimpro-event-red",
  "dimpro-event-purple",
] as const;

export const calendarEventRecurrenceValues = ["none", "weekly"] as const;
export const calendarExternalProviderValues = [
  "none",
  "google",
  "outlook",
] as const;
export const calendarSyncStatusValues = [
  "none",
  "pending",
  "synced",
  "failed",
] as const;

export type CalendarEventTone = (typeof calendarEventToneValues)[number];
export type CalendarEventRecurrence =
  (typeof calendarEventRecurrenceValues)[number];
export type CalendarExternalProvider =
  (typeof calendarExternalProviderValues)[number];
export type CalendarSyncStatus = (typeof calendarSyncStatusValues)[number];

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  className: CalendarEventTone;
  meetingType: string;
  person: string;
  location: string;
  description: string;
  status: string;
  recurrence: CalendarEventRecurrence;
  externalProvider: CalendarExternalProvider;
  externalEventId: string;
  syncStatus: CalendarSyncStatus;
  lastSyncedAt: string | null;
};

export type CalendarEventInput = Omit<CalendarEvent, "id">;
