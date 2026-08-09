import type { CalendarEvent } from "./types";

export type CalendarSyncProvider = "google" | "outlook";

export type CalendarSyncResult = {
  externalEventId: string;
  lastSyncedAt: string;
};

export type CalendarSyncAdapter = {
  provider: CalendarSyncProvider;
  createEvent: (event: CalendarEvent) => Promise<CalendarSyncResult>;
  updateEvent: (event: CalendarEvent) => Promise<CalendarSyncResult>;
  deleteEvent: (event: CalendarEvent) => Promise<void>;
};

export function toExternalCalendarPayload(event: CalendarEvent) {
  return {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: { dateTime: event.start },
    end: { dateTime: event.end },
    recurrence: event.recurrence === "weekly" ? ["RRULE:FREQ=WEEKLY"] : [],
    extendedProperties: {
      private: {
        dimproverEventId: event.id,
        dimproverStatus: event.status,
        dimproverColor: event.className,
      },
    },
  };
}

export const calendarSyncAdapters: Partial<
  Record<CalendarSyncProvider, CalendarSyncAdapter>
> = {};
