import type { CalendarEvent } from "@/app/lib/calendar/types";
import type { EventContentArg } from "@fullcalendar/core";
import {
  addDays,
  addHours,
  addWeeks,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { hu } from "date-fns/locale";
import { RefreshCw } from "lucide-react";
import React from "react";

export const monthDayHeaders = ["H", "K", "SZE", "CS", "P", "SZO", "V"];

export const eventToneOptions = [
  { label: "Kék", value: "dimpro-event-blue" },
  { label: "Cián", value: "dimpro-event-cyan" },
  { label: "Égkék", value: "dimpro-event-sky" },
  { label: "Indigó", value: "dimpro-event-indigo" },
  { label: "Zöld", value: "dimpro-event-green" },
  { label: "Lime", value: "dimpro-event-lime" },
  { label: "Sárga", value: "dimpro-event-yellow" },
  { label: "Narancs", value: "dimpro-event-orange" },
  { label: "Piros", value: "dimpro-event-red" },
  { label: "Lila", value: "dimpro-event-purple" },
] as const;

export type BackgroundEvent = {
  title: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  display: "background";
  className: string;
};

export type CalendarDisplayEvent = CalendarEvent & {
  sourceEventId: string;
  isRecurringOccurrence: boolean;
};

export type MonthCell = {
  date: Date;
  inMonth: boolean;
  events: CalendarDisplayEvent[];
};

export const backgroundEvents: BackgroundEvent[] = [
  {
    title: "Munkaidőn kívül",
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: "00:00",
    endTime: "04:00",
    display: "background",
    className: "dimpro-bg-offhours",
  },
  {
    title: "Munkaidőn kívül",
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: "18:00",
    endTime: "24:00",
    display: "background",
    className: "dimpro-bg-offhours",
  },
];

export function toInputDateTime(value: string | Date) {
  return format(new Date(value), "yyyy-MM-dd'T'HH:mm");
}

function sameDay(date: Date, isoDate: string) {
  return format(date, "yyyy-MM-dd") === isoDate.slice(0, 10);
}

function shiftIsoDateTime(value: string, weeks: number) {
  return format(addWeeks(new Date(value), weeks), "yyyy-MM-dd'T'HH:mm");
}

export function expandCalendarEvents(
  events: CalendarEvent[],
  weekCount = 26,
): CalendarDisplayEvent[] {
  const expanded: CalendarDisplayEvent[] = [];

  for (const event of events) {
    if (event.recurrence !== "weekly") {
      expanded.push({
        ...event,
        sourceEventId: event.id,
        isRecurringOccurrence: false,
      });
      continue;
    }

    for (let index = 0; index < weekCount; index += 1) {
      expanded.push({
        ...event,
        id: `${event.id}__weekly-${index}`,
        sourceEventId: event.id,
        start: shiftIsoDateTime(event.start, index),
        end: shiftIsoDateTime(event.end, index),
        isRecurringOccurrence: true,
      });
    }
  }

  return expanded;
}

export function normalizeCalendarEventForDisplay(
  event: CalendarDisplayEvent,
): CalendarDisplayEvent {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const safeEnd = end.getTime() > start.getTime() ? end : addHours(start, 1);

  return {
    ...event,
    start: format(start, "yyyy-MM-dd'T'HH:mm:ss"),
    end: format(safeEnd, "yyyy-MM-dd'T'HH:mm:ss"),
  };
}

export function buildMonthRows(date: Date, events: CalendarDisplayEvent[]) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  let cursor = startOfWeek(monthStart, { weekStartsOn: 1 });
  const rows: MonthCell[][] = [];

  for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
    const row: MonthCell[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const cellDate = cursor;
      row.push({
        date: cellDate,
        inMonth: isSameMonth(cellDate, monthStart),
        events: events.filter((event) => sameDay(cellDate, event.start)),
      });
      cursor = addDays(cursor, 1);
    }
    rows.push(row);
  }

  if (rows[5]?.every((cell) => cell.date > monthEnd && !cell.inMonth))
    rows.pop();
  return rows;
}

export function eventTone(className?: string) {
  const tone =
    eventToneOptions
      .find((option) =>
        className?.includes(option.value.replace("dimpro-event-", "")),
      )
      ?.value.replace("dimpro-event-", "") ?? "blue";
  return `dimpro-month-event dimpro-month-event-${tone}`;
}

export function renderEventContent(arg: EventContentArg) {
  const meetingType = String(
    arg.event.extendedProps.meetingType || "Microsoft Teams-értekezlet",
  );
  const person = String(arg.event.extendedProps.person || "DIMPROVER esemény");
  const isRecurring = Boolean(
    arg.event.extendedProps.isRecurringOccurrence ||
    arg.event.extendedProps.recurrence === "weekly",
  );

  return (
    <div className="dimpro-event-card-content">
      <div className="dimpro-event-title">{arg.event.title}</div>
      <div className="dimpro-event-meta">{meetingType}</div>
      <div className="dimpro-event-person">{person}</div>
      {isRecurring && (
        <RefreshCw
          className="dimpro-event-sync-icon"
          size={11}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export function outlookDayHeader(date: Date) {
  const isToday = isSameDay(date, new Date());
  return (
    <div className="dimpro-outlook-day-header">
      <div className="dimpro-outlook-day-name">
        {format(date, "EEEE", { locale: hu })}
      </div>
      <div
        className={
          isToday
            ? "dimpro-outlook-day-number dimpro-outlook-today-number"
            : "dimpro-outlook-day-number"
        }
      >
        {format(date, "d", { locale: hu })}
      </div>
    </div>
  );
}
