import {
  calendarEventRecurrenceValues,
  calendarEventToneValues,
  calendarExternalProviderValues,
  calendarSyncStatusValues,
  type CalendarEventInput,
} from "./types";

function isIsoDateTime(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length >= 16 &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function validateCalendarEventInput(
  payload: unknown,
): CalendarEventInput | null {
  if (!payload || typeof payload !== "object") return null;
  const source = payload as Partial<CalendarEventInput>;
  const title = cleanText(source.title);
  const start = cleanText(source.start);
  const end = cleanText(source.end);
  const className = source.className;
  const recurrence = source.recurrence;
  const externalProvider = source.externalProvider ?? "none";
  const syncStatus = source.syncStatus ?? "none";

  if (!title || !isIsoDateTime(start) || !isIsoDateTime(end)) return null;
  if (new Date(end).getTime() <= new Date(start).getTime()) return null;
  if (!calendarEventToneValues.includes(className as never)) return null;
  if (!calendarEventRecurrenceValues.includes(recurrence as never)) return null;
  if (!calendarExternalProviderValues.includes(externalProvider as never))
    return null;
  if (!calendarSyncStatusValues.includes(syncStatus as never)) return null;

  return {
    title,
    start,
    end,
    className: className as CalendarEventInput["className"],
    meetingType: cleanText(source.meetingType, "Microsoft Teams-értekezlet"),
    person: cleanText(source.person, "DIMPROVER esemény"),
    location: cleanText(source.location, "Online"),
    description: cleanText(source.description),
    status: cleanText(source.status, "Tervezett"),
    recurrence: recurrence as CalendarEventInput["recurrence"],
    externalProvider:
      externalProvider as CalendarEventInput["externalProvider"],
    externalEventId: cleanText(source.externalEventId),
    syncStatus: syncStatus as CalendarEventInput["syncStatus"],
    lastSyncedAt: source.lastSyncedAt ?? null,
  };
}
