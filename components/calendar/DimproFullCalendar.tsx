"use client";

import React from "react";
import type { CalendarEvent } from "@/app/lib/calendar/types";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
} from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import {
  addDays,
  addHours,
  endOfMonth,
  format,
  getISOWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { hu } from "date-fns/locale";
import {
  backgroundEvents,
  buildMonthRows,
  eventTone,
  expandCalendarEvents,
  monthDayHeaders,
  normalizeCalendarEventForDisplay,
  outlookDayHeader,
  renderEventContent,
  toInputDateTime,
} from "./calendarDisplay";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  MailPlus,
  RefreshCw,
} from "lucide-react";
import { initialCalendarEvents } from "./calendarInitialEvents";
import {
  EventEditorModal,
  type CalendarFormState,
  type CalendarModalState,
} from "./EventEditorModal";

const viewButtons = [
  { label: "Nap", view: "timeGridDay", workWeek: false },
  { label: "Munkahét", view: "timeGridWeek", workWeek: true },
  { label: "Hét", view: "timeGridWeek", workWeek: false },
  { label: "Hónap", view: "dayGridMonth", workWeek: false },
  { label: "Ütemezés", view: "listWeek", workWeek: false },
] as const;

type CalendarSourceKey = "api" | "google" | "outlook";

const sourceButtons: Array<{
  key: CalendarSourceKey;
  label: string;
  dotClass: string;
}> = [
  { key: "api", label: "Saját API", dotClass: "bg-blue-600" },
  { key: "google", label: "Google", dotClass: "bg-emerald-600" },
];

function viewLabel(viewType: string) {
  return viewButtons.find((item) => item.view === viewType)?.label ?? "Hét";
}

function getEventSource(event: CalendarEvent): CalendarSourceKey {
  if (event.externalProvider === "google") return "google";
  if (event.externalProvider === "outlook") return "outlook";
  return "api";
}

export default function DimproFullCalendar() {
  const calendarRef = React.useRef<FullCalendar | null>(null);
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [activeView, setActiveView] = React.useState("timeGridWeek");
  const [isWorkWeek, setIsWorkWeek] = React.useState(false);
  const [focusTime, setFocusTime] = React.useState(false);
  const [events, setEvents] = React.useState<CalendarEvent[]>(
    initialCalendarEvents,
  );
  const [calendarVisibility, setCalendarVisibility] = React.useState<
    Record<CalendarSourceKey, boolean>
  >({ api: true, google: true, outlook: true });
  const [modal, setModal] = React.useState<CalendarModalState>(null);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    let isActive = true;

    async function loadEvents() {
      try {
        const response = await fetch("/api/calendar/events", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          ok?: boolean;
          events?: CalendarEvent[];
          error?: string;
        };
        if (!response.ok || !data.ok || !Array.isArray(data.events)) {
          throw new Error(
            data.error || "A naptáresemények betöltése sikertelen.",
          );
        }
        if (isActive) {
          setEvents(data.events);
          setApiError(null);
        }
      } catch (error) {
        if (isActive)
          setApiError(
            error instanceof Error
              ? error.message
              : "A naptáresemények betöltése sikertelen.",
          );
      }
    }

    void loadEvents();
    return () => {
      isActive = false;
    };
  }, []);

  const calendarApi = () => calendarRef.current?.getApi();
  const isMonthView = activeView === "dayGridMonth";
  const fullCalendarInitialView =
    activeView === "listWeek"
      ? "listWeek"
      : activeView === "timeGridDay"
        ? "timeGridDay"
        : "timeGridWeek";
  const eventSourceCounts = React.useMemo(
    () =>
      events.reduce(
        (counts, event) => {
          counts[getEventSource(event)] += 1;
          return counts;
        },
        { api: 0, google: 0, outlook: 0 } as Record<CalendarSourceKey, number>,
      ),
    [events],
  );
  const visibleEvents = React.useMemo(
    () => events.filter((event) => calendarVisibility[getEventSource(event)]),
    [events, calendarVisibility],
  );
  const displayEvents = React.useMemo(
    () => expandCalendarEvents(visibleEvents),
    [visibleEvents],
  );
  const monthRows = React.useMemo(
    () => buildMonthRows(currentDate, displayEvents),
    [currentDate, displayEvents],
  );
  const calendarEvents = React.useMemo(
    () => [
      ...displayEvents.map((event) => normalizeCalendarEventForDisplay(event)),
      ...backgroundEvents,
    ],
    [displayEvents],
  );

  function toggleCalendarSource(source: CalendarSourceKey) {
    setCalendarVisibility((current) => ({
      ...current,
      [source]: !current[source],
    }));
  }

  function changeView(view: string, workWeek = false) {
    setIsWorkWeek(workWeek);
    setActiveView(view);
    calendarApi()?.changeView(view);
  }
  function goPrev() {
    if (isMonthView) setCurrentDate((date) => addDays(startOfMonth(date), -1));
    else calendarApi()?.prev();
  }
  function goToday() {
    const today = new Date();
    setCurrentDate(today);
    if (!isMonthView) calendarApi()?.today();
  }
  function goNext() {
    if (isMonthView) setCurrentDate((date) => addDays(endOfMonth(date), 1));
    else calendarApi()?.next();
  }
  function handleDatesSet(arg: DatesSetArg) {
    if (!isMonthView) setCurrentDate(arg.view.currentStart);
    setActiveView(arg.view.type);
    if (arg.view.type !== "timeGridWeek") setIsWorkWeek(false);
  }

  function openCreateModal(start: Date, end?: Date) {
    setModal({
      mode: "create",
      form: {
        title: "Új esemény",
        start: toInputDateTime(start),
        end: toInputDateTime(
          end && end.getTime() > start.getTime() ? end : addHours(start, 1),
        ),
        className: "dimpro-event-blue",
        meetingType: "Microsoft Teams-értekezlet",
        person: "DIMPROVER esemény",
        location: "Online",
        description: "",
        status: "Tervezett",
        recurrence: "none",
        externalProvider: "none",
        externalEventId: "",
        syncStatus: "none",
        lastSyncedAt: null,
      },
    });
  }

  function handleSelect(arg: DateSelectArg) {
    openCreateModal(arg.start, arg.end);
    calendarApi()?.unselect();
  }

  function handleEventClick(arg: EventClickArg) {
    const sourceEventId = String(
      arg.event.extendedProps.sourceEventId || arg.event.id,
    );
    const event = events.find((item) => item.id === sourceEventId);
    if (!event) return;
    setModal({
      mode: "edit",
      eventId: event.id,
      form: {
        title: event.title,
        start: event.start,
        end: event.end,
        className: event.className,
        meetingType: event.meetingType,
        person: event.person,
        location: event.location,
        description: event.description,
        status: event.status,
        recurrence: event.recurrence,
        externalProvider: event.externalProvider,
        externalEventId: event.externalEventId,
        syncStatus: event.syncStatus,
        lastSyncedAt: event.lastSyncedAt,
      },
    });
  }

  function handleMonthCellDoubleClick(date: Date) {
    openCreateModal(date, addHours(date, 1));
  }

  async function saveModal(form: CalendarFormState) {
    if (!form.title.trim()) return;

    setIsSaving(true);
    setApiError(null);
    try {
      const isEdit = modal?.mode === "edit" && modal.eventId;
      const response = await fetch("/api/calendar/events", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(isEdit ? { ...form, id: modal.eventId } : form),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        event?: CalendarEvent;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.event) {
        throw new Error(data.error || "Az esemény mentése sikertelen.");
      }

      if (isEdit) {
        setEvents((current) =>
          current.map((event) =>
            event.id === data.event?.id ? data.event : event,
          ),
        );
      } else {
        setEvents((current) => [data.event as CalendarEvent, ...current]);
      }
      setModal(null);
    } catch (error) {
      setApiError(
        error instanceof Error
          ? error.message
          : "Az esemény mentése sikertelen.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteModalEvent() {
    if (modal?.mode !== "edit" || !modal.eventId) {
      setModal(null);
      return;
    }

    setIsSaving(true);
    setApiError(null);
    try {
      const response = await fetch(
        `/api/calendar/events?id=${encodeURIComponent(modal.eventId)}`,
        { method: "DELETE" },
      );
      const data = (await response.json()) as {
        ok?: boolean;
        id?: string;
        error?: string;
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Az esemény törlése sikertelen.");
      }
      setEvents((current) =>
        current.filter((event) => event.id !== modal.eventId),
      );
      setModal(null);
    } catch (error) {
      setApiError(
        error instanceof Error
          ? error.message
          : "Az esemény törlése sikertelen.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function persistEventTiming(
    sourceEventId: string,
    start: Date,
    end: Date | null,
  ) {
    const sourceEvent = events.find((event) => event.id === sourceEventId);
    if (!sourceEvent) throw new Error("Az esemény nem található.");

    const updatedInput: CalendarFormState = {
      title: sourceEvent.title,
      start: toInputDateTime(start),
      end: toInputDateTime(
        end && end.getTime() > start.getTime() ? end : addHours(start, 1),
      ),
      className: sourceEvent.className,
      meetingType: sourceEvent.meetingType,
      person: sourceEvent.person,
      location: sourceEvent.location,
      description: sourceEvent.description,
      status: sourceEvent.status,
      recurrence: sourceEvent.recurrence,
      externalProvider: sourceEvent.externalProvider,
      externalEventId: sourceEvent.externalEventId,
      syncStatus:
        sourceEvent.externalProvider === "none"
          ? sourceEvent.syncStatus
          : "pending",
      lastSyncedAt: sourceEvent.lastSyncedAt,
    };

    const response = await fetch("/api/calendar/events", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...updatedInput, id: sourceEventId }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      event?: CalendarEvent;
      error?: string;
    };
    if (!response.ok || !data.ok || !data.event) {
      throw new Error(
        data.error || "Az esemény időpontjának mentése sikertelen.",
      );
    }

    setEvents((current) =>
      current.map((event) =>
        event.id === data.event?.id ? data.event : event,
      ),
    );
  }

  async function handleEventDrop(arg: EventDropArg) {
    const sourceEventId = String(
      arg.event.extendedProps.sourceEventId || arg.event.id,
    );
    if (!arg.event.start) {
      arg.revert();
      return;
    }

    setApiError(null);
    try {
      await persistEventTiming(sourceEventId, arg.event.start, arg.event.end);
    } catch (error) {
      arg.revert();
      setApiError(
        error instanceof Error
          ? error.message
          : "Az esemény mozgatásának mentése sikertelen.",
      );
    }
  }

  async function handleEventResize(arg: EventResizeDoneArg) {
    const sourceEventId = String(
      arg.event.extendedProps.sourceEventId || arg.event.id,
    );
    if (!arg.event.start) {
      arg.revert();
      return;
    }

    setApiError(null);
    try {
      await persistEventTiming(sourceEventId, arg.event.start, arg.event.end);
    } catch (error) {
      arg.revert();
      setApiError(
        error instanceof Error
          ? error.message
          : "Az esemény átméretezésének mentése sikertelen.",
      );
    }
  }

  const year = format(currentDate, "yyyy", { locale: hu });
  const month = format(currentDate, "LLLL", { locale: hu });
  const week = getISOWeek(currentDate);
  const periodTitle = isMonthView
    ? `${year}. ${month}`
    : `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy. MMMM d.", { locale: hu })} - ${format(addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), isWorkWeek ? 4 : 6), "d.", { locale: hu })}`;

  return (
    <div className="space-y-5">
      {apiError && (
        <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          {apiError}
        </div>
      )}
      <div className="grid gap-3 xl:grid-cols-[260px_1fr] xl:items-start">
        <div className="grid gap-3">
          <div className="border border-blue-100/90 bg-white/75 px-4 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Hét
            </div>
            <div className="mt-1 text-sm font-black text-slate-900">
              {week}. hét · {viewLabel(activeView)}
            </div>
          </div>
        </div>
        <div className="border border-slate-200 bg-white px-3 py-3 shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={goToday}
                className="rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Ma
              </button>
              <button
                type="button"
                onClick={goPrev}
                className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                <ChevronRight size={16} />
              </button>
              <div className="ml-2 text-lg font-black capitalize tracking-tight text-slate-800">
                {periodTitle}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!isMonthView && (
                <button
                  type="button"
                  onClick={() => setFocusTime((value) => !value)}
                  className="inline-flex items-center gap-2 rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Clock3 size={14} />
                  {focusTime
                    ? "Teljes nap 00:00-24:00"
                    : "Összecsukás 06:00-20:00"}
                </button>
              )}
              {viewButtons.map((item) => (
                <button
                  key={`${item.label}-${item.workWeek ? "work" : "default"}`}
                  type="button"
                  onClick={() => changeView(item.view, Boolean(item.workWeek))}
                  className={`rounded-sm border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] transition ${activeView === item.view && isWorkWeek === Boolean(item.workWeek) ? "border-sky-500 bg-sky-100 text-slate-950 shadow-sm" : "border-slate-300 bg-white text-slate-700 hover:border-sky-400 hover:bg-sky-50"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[260px_1fr] xl:items-start">
        <div className="hidden xl:block" />
        <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1 shadow-[0_4px_14px_rgba(15,23,42,0.03)]">
          {sourceButtons.map((item) => {
            const active = calendarVisibility[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleCalendarSource(item.key)}
                className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.04em] transition ${active ? "border-slate-300 bg-white text-slate-900 shadow-sm" : "border-transparent bg-transparent text-slate-400 line-through"}`}
                aria-pressed={active}
              >
                <span className={`h-2 w-2 rounded-full ${item.dotClass}`} />
                {item.label}
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {eventSourceCounts[item.key]}
                </span>
              </button>
            );
          })}
          <a
            href="/api/calendar/integrations/outlook/start"
            className="inline-flex items-center gap-1.5 rounded-sm border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.04em] text-blue-700 hover:bg-blue-100"
          >
            <MailPlus size={13} /> Outlook csatlakozás
          </a>
        </div>
      </div>

      {isMonthView ? (
        <div className="dimpro-outlook-month overflow-hidden border border-blue-100/90 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
          <div className="grid grid-cols-[74px_repeat(7,minmax(0,1fr))] border-b border-blue-100/90 bg-sky-50/75 text-center text-xs font-black uppercase text-slate-700">
            <div className="border-r border-blue-100/90 px-2 py-2" />
            {monthDayHeaders.map((name) => (
              <div
                key={name}
                className="border-r border-blue-100/90 px-2 py-2 last:border-r-0"
              >
                {name}
              </div>
            ))}
          </div>
          {monthRows.map((row) => (
            <div
              key={row[0].date.toISOString()}
              className="grid min-h-[118px] grid-cols-[74px_repeat(7,minmax(0,1fr))] border-b border-blue-100/90 last:border-b-0"
            >
              <div className="flex items-start justify-center border-r border-blue-100/90 bg-sky-50/45 pt-3">
                <div className="text-xl font-black leading-none text-slate-950">
                  {getISOWeek(row[0].date)}
                </div>
              </div>
              {row.map((cell, index) => (
                <button
                  type="button"
                  onDoubleClick={() => handleMonthCellDoubleClick(cell.date)}
                  key={cell.date.toISOString()}
                  className={`relative min-h-[118px] border-r border-blue-100/90 p-2 text-left last:border-r-0 ${index >= 5 ? "bg-red-50/55" : "bg-white"}`}
                >
                  <div
                    className={`text-right text-base font-medium ${cell.inMonth ? "text-slate-950" : "text-slate-300"}`}
                  >
                    {format(cell.date, "d")}
                  </div>
                  <div className="mt-5 space-y-1">
                    {cell.events.map((event) => (
                      <div
                        key={event.id}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          setModal({
                            mode: "edit",
                            eventId: event.id,
                            form: {
                              title: event.title,
                              start: event.start,
                              end: event.end,
                              className: event.className,
                              meetingType: event.meetingType,
                              person: event.person,
                              location: event.location,
                              description: event.description,
                              status: event.status,
                              recurrence: event.recurrence,
                              externalProvider: event.externalProvider,
                              externalEventId: event.externalEventId,
                              syncStatus: event.syncStatus,
                              lastSyncedAt: event.lastSyncedAt,
                            },
                          });
                        }}
                        className={`${eventTone(event.className)} ${event.externalProvider === "google" ? "dimpro-month-google-card" : ""}`}
                      >
                        <div className="flex items-center gap-1 truncate text-[9px] font-black uppercase tracking-[0.08em] opacity-75">
                          {event.externalProvider === "google" ? "Google" : "Saját API"}
                        </div>
                        <div className="truncate font-black">{event.title}</div>
                        <div className="truncate font-semibold">
                          {event.meetingType}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">
                            {format(new Date(event.start), "HH:mm")}
                          </span>
                          {event.recurrence === "weekly" && (
                            <RefreshCw size={10} aria-hidden="true" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="relative overflow-hidden border border-blue-100/90 bg-white/75 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
          {activeView !== "listWeek" && (
            <div
              className="dimpro-week-corner-badge"
              aria-label={`A hét száma: ${week}`}
            >
              {week}
            </div>
          )}
          <div className="dimpro-calendar-shell overflow-hidden">
            <FullCalendar
              key={fullCalendarInitialView}
              ref={calendarRef}
              plugins={[
                dayGridPlugin,
                timeGridPlugin,
                listPlugin,
                interactionPlugin,
              ]}
              initialView={fullCalendarInitialView}
              locale="hu"
              firstDay={1}
              height="auto"
              headerToolbar={false}
              allDaySlot={true}
              allDayText="Egész nap"
              nowIndicator={true}
              editable={true}
              eventResizableFromStart={true}
              eventDurationEditable={true}
              eventStartEditable={true}
              forceEventDuration={true}
              defaultTimedEventDuration="01:00:00"
              selectable={true}
              selectMirror={true}
              weekends={!isWorkWeek}
              slotMinTime={focusTime ? "06:00:00" : "00:00:00"}
              slotMaxTime={focusTime ? "20:00:00" : "24:00:00"}
              slotDuration="00:30:00"
              slotLabelInterval="01:00:00"
              slotLabelFormat={{
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }}
              eventTimeFormat={{
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }}
              businessHours={{
                daysOfWeek: [1, 2, 3, 4, 5],
                startTime: "04:00",
                endTime: "18:00",
              }}
              events={calendarEvents}
              datesSet={handleDatesSet}
              select={handleSelect}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              views={{ listWeek: { buttonText: "Ütemezés" } }}
              dayHeaderContent={(arg) => outlookDayHeader(arg.date)}
              eventContent={renderEventContent}
            />
          </div>
        </div>
      )}

      <EventEditorModal
        modal={modal}
        onClose={() => setModal(null)}
        onSave={saveModal}
        onDelete={deleteModalEvent}
        onChange={(form) =>
          setModal((current) => (current ? { ...current, form } : current))
        }
        isSaving={isSaving}
      />
    </div>
  );
}