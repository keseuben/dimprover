"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FolderKanban,
  History,
  LayoutGrid,
  Link2,
  Monitor,
  Moon,
  PanelRightOpen,
  Sun,
  UserCircle,
  X,
} from "lucide-react";
import { RightSidebarEventEditorHost, type RightSidebarCalendarEvent } from "./RightSidebarEventEditorHost";
import { RightBoardModuleSwitch } from "./DimproverModuleSwitch";
import NotificationBell from "@/components/notifications/NotificationBell";

type RightSidebarProps = {
  collapsed?: boolean;
  onOpen?: () => void;
};

type FloatingCardPosition = {
  x: number;
  y: number;
};

type FloatingCardDragState = {
  key: string;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  moved: boolean;
};

type CalendarApiEvent = RightSidebarCalendarEvent;

type CalendarDay = {
  date: Date | null;
  isoDate: string | null;
  label: string;
  isToday: boolean;
  eventCount: number;
  events: CalendarApiEvent[];
};

type CalendarWeek = {
  weekNumber: number;
  days: CalendarDay[];
  eventCount: number;
  events: CalendarApiEvent[];
};

type QuickRailItem = {
  key: string;
  title: string;
  description: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
  content: React.ReactNode;
};

const dayLabels = ["H", "K", "SZE", "CS", "P", "SZO", "V"];
const monthNames = [
  "Január",
  "Február",
  "Március",
  "Április",
  "Május",
  "Július",
  "Augusztus",
  "Szeptember",
  "Október",
  "November",
  "December",
];

const pinnedCollapsedCardsStorageKey = "dimprover:right-sidebar:pinned-cards";

function getIsoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function buildEventsByDate(events: CalendarApiEvent[]) {
  return events.reduce<Record<string, CalendarApiEvent[]>>((accumulator, event) => {
    const isoDate = event.start?.slice(0, 10);
    if (!isoDate) return accumulator;
    accumulator[isoDate] = [...(accumulator[isoDate] ?? []), event];
    return accumulator;
  }, {});
}

function buildMonthCalendar(year: number, month: number, today: Date, eventsByDate: Record<string, CalendarApiEvent[]>): CalendarWeek[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const cursor = new Date(year, month, 1 - mondayOffset);
  const weeks: CalendarWeek[] = [];

  while (cursor <= lastDay || weeks.length < 5) {
    const weekStart = new Date(cursor);
    const days: CalendarDay[] = [];

    for (let index = 0; index < 7; index += 1) {
      const current = new Date(cursor);
      const inCurrentMonth = current.getMonth() === month;
      const isoDate = inCurrentMonth ? toIsoDate(current) : null;
      const dayEvents = isoDate ? eventsByDate[isoDate] ?? [] : [];

      days.push({
        date: inCurrentMonth ? current : null,
        isoDate,
        label: inCurrentMonth ? String(current.getDate()) : "",
        isToday: inCurrentMonth && isSameDay(current, today),
        eventCount: dayEvents.length,
        events: dayEvents,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push({
      weekNumber: getIsoWeekNumber(weekStart),
      days,
      eventCount: days.reduce((sum, day) => sum + day.eventCount, 0),
      events: days.flatMap((day) => day.events),
    });

    if (cursor.getMonth() !== month && cursor > lastDay) break;
  }

  return weeks;
}

function formatEventTime(value: string) {
  if (!value) return "";
  const time = value.includes("T") ? value.slice(11, 16) : "";
  return time || "Egész nap";
}

function providerLabel(provider?: CalendarApiEvent["externalProvider"]) {
  if (provider === "google") return "Google";
  if (provider === "outlook") return "Outlook";
  return "DIMPROVER";
}

function providerBarClass(provider?: CalendarApiEvent["externalProvider"]) {
  if (provider === "google") return "bg-emerald-500";
  if (provider === "outlook") return "bg-blue-600";
  return "bg-cyan-500";
}

function providerCardClass(provider?: CalendarApiEvent["externalProvider"]) {
  if (provider === "google") return "border-l-4 border-l-emerald-500";
  if (provider === "outlook") return "border-l-4 border-l-blue-600";
  return "border-l-4 border-l-cyan-500";
}

function MiniEventBars({ events }: { events: CalendarApiEvent[] }) {
  if (events.length <= 0) return <span className="mt-1 block h-1" />;

  return (
    <span className="mt-1 flex h-1 items-center justify-center gap-0.5">
      {events.slice(0, 3).map((event) => (
        <span key={event.id} className={`h-1 w-3 rounded-full ${providerBarClass(event.externalProvider)}`} />
      ))}
    </span>
  );
}

function EventPreview({ events, label, onEditEvent }: { events: CalendarApiEvent[]; label: string; onEditEvent: (event: CalendarApiEvent) => void }) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);

  if (events.length === 0) return null;

  const visibleEvents = showAllEvents ? events : events.slice(0, 5);

  return (
    <div className="pointer-events-auto absolute left-1/2 top-full z-[12000] mt-1 hidden w-72 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-2xl ring-1 ring-slate-900/5 group-hover:block">
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={showAllEvents ? "max-h-72 space-y-1.5 overflow-y-auto pr-1" : "space-y-1.5"}>
        {visibleEvents.map((event) => {
          const isSelected = selectedEventId === event.id;
          return (
            <button
              key={event.id}
              type="button"
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                setSelectedEventId((current) => (current === event.id ? null : event.id));
              }}
              className={`w-full rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-left hover:border-cyan-200 hover:bg-cyan-50/70 ${providerCardClass(event.externalProvider)}`}
            >
              <div className="truncate text-[11px] font-black text-slate-900">{event.title}</div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-500">
                <span>{formatEventTime(event.start)}</span>
                <span>{providerLabel(event.externalProvider)}</span>
              </div>
              {isSelected && (
                <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-[10px] font-semibold leading-snug text-slate-600">
                  <div><span className="text-slate-400">Idő:</span> {formatEventTime(event.start)} - {formatEventTime(event.end)}</div>
                  {event.status && <div><span className="text-slate-400">Státusz:</span> {event.status}</div>}
                  {event.meetingType && <div><span className="text-slate-400">Típus:</span> {event.meetingType}</div>}
                  {event.person && <div><span className="text-slate-400">Kapcsolat:</span> {event.person}</div>}
                  {event.location && <div><span className="text-slate-400">Hely:</span> {event.location}</div>}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(detailClickEvent) => {
                      detailClickEvent.stopPropagation();
                      onEditEvent(event);
                    }}
                    onKeyDown={(detailKeyEvent) => {
                      if (detailKeyEvent.key === "Enter" || detailKeyEvent.key === " ") {
                        detailKeyEvent.preventDefault();
                        detailKeyEvent.stopPropagation();
                        onEditEvent(event);
                      }
                    }}
                    className="mt-2 block rounded-md bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-700 hover:bg-cyan-100"
                  >
                    Részletező megnyitása / szerkesztés
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
      {events.length > 5 && (
        <button
          type="button"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            setShowAllEvents((current) => !current);
          }}
          className="mt-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-left text-[10px] font-bold text-cyan-700 hover:bg-cyan-50"
        >
          {showAllEvents ? "Kevesebb esemény" : `+${events.length - 5} további esemény`}
        </button>
      )}
    </div>
  );
}

function CalendarHeader({ title, onPrevious, onNext }: { title: string; onPrevious: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onPrevious();
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
        title="Előző időszak"
      >
        <ChevronLeft size={15} />
      </button>
      <div className="text-center text-[11px] font-black uppercase tracking-[0.14em] text-slate-700">{title}</div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onNext();
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
        title="Következő időszak"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

function MiniMonthCalendar({ weeks, title, onPrevious, onNext, onEditEvent }: { weeks: CalendarWeek[]; title: string; onPrevious: () => void; onNext: () => void; onEditEvent: (event: CalendarApiEvent) => void }) {
  return (
    <div className="space-y-2">
      <CalendarHeader title={title} onPrevious={onPrevious} onNext={onNext} />
      <div className="grid grid-cols-8 gap-1 text-center text-[10px]">
        <div className="font-bold text-slate-600">Hét</div>
        {dayLabels.map((day) => <div key={day} className="font-bold text-slate-600">{day}</div>)}
        {weeks.map((row) => (
          <React.Fragment key={row.weekNumber}>
            <div className="group relative rounded-lg border border-slate-200 bg-slate-50 py-1 font-black text-slate-800 hover:border-cyan-300 hover:bg-cyan-50">
              {row.weekNumber}
              <MiniEventBars events={row.events} />
              <EventPreview events={row.events} label={`${row.weekNumber}. hét`} onEditEvent={onEditEvent} />
            </div>
            {row.days.map((day, index) => (
              <div
                key={`${row.weekNumber}-${index}`}
                title={day.eventCount ? `${day.eventCount} esemény` : undefined}
                className={`group relative rounded-lg py-1 font-semibold ${day.isToday ? "bg-slate-900 text-white" : day.label ? "bg-white text-slate-800 hover:bg-cyan-50" : "text-transparent"}`}
              >
                {day.label || "·"}
                <MiniEventBars events={day.events} />
                <EventPreview events={day.events} label={day.isoDate ?? ""} onEditEvent={onEditEvent} />
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function MiniYearCalendar({ yearlyWeeks, today, year, onPrevious, onNext, onEditEvent }: { yearlyWeeks: { month: string; weeks: CalendarWeek[] }[]; today: Date; year: number; onPrevious: () => void; onNext: () => void; onEditEvent: (event: CalendarApiEvent) => void }) {
  const currentWeek = getIsoWeekNumber(today);

  return (
    <div className="space-y-2">
      <CalendarHeader title={`${year}. év`} onPrevious={onPrevious} onNext={onNext} />
      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        {yearlyWeeks.map((item) => (
          <div key={item.month} className="grid grid-cols-[24px_1fr] items-center gap-1 rounded-lg border border-slate-100 bg-white px-1 py-1">
            <div className="font-black text-slate-800">{item.month}.</div>
            <div className="flex flex-wrap gap-0.5">
              {item.weeks.map((week) => (
                <span key={`${item.month}-${week.weekNumber}`} className={week.weekNumber === currentWeek ? "group relative rounded bg-slate-900 px-1 text-white" : "group relative rounded bg-slate-50 px-1 text-slate-700 hover:bg-cyan-50"}>
                  {week.weekNumber}
                  {week.eventCount > 0 && <span className={`mx-auto mt-0.5 block h-0.5 w-3 rounded-full ${providerBarClass(week.events[0]?.externalProvider)}`} />}
                  <EventPreview events={week.events} label={`${item.month}. hónap / ${week.weekNumber}. hét`} onEditEvent={onEditEvent} />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FullMonthCalendar({ title, weeks, onPrevious, onNext, onEditEvent }: { title: string; weeks: CalendarWeek[]; onPrevious: () => void; onNext: () => void; onEditEvent: (event: CalendarApiEvent) => void }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/82 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-slate-800">Havi naptár</h3>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-400">Hetek számozása és napi eseményjelölés.</p>
        </div>
        <Link href="/naptar" className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-800 hover:bg-cyan-100">
          Megnyitás
        </Link>
      </div>
      <MiniMonthCalendar title={title} weeks={weeks} onPrevious={onPrevious} onNext={onNext} onEditEvent={onEditEvent} />
    </section>
  );
}

function FullYearCalendar({ year, yearlyWeeks, today, open, onToggle, onPrevious, onNext, onEditEvent }: { year: number; yearlyWeeks: { month: string; weeks: CalendarWeek[] }[]; today: Date; open: boolean; onToggle: () => void; onPrevious: () => void; onNext: () => void; onEditEvent: (event: CalendarApiEvent) => void }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/82 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between text-left">
        <div>
          <h3 className="font-black text-slate-800">Éves naptár {year}</h3>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-400">Heti áttekintő eseményjelölő csíkokkal.</p>
        </div>
        <ChevronDown size={19} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-4"><MiniYearCalendar yearlyWeeks={yearlyWeeks} today={today} year={year} onPrevious={onPrevious} onNext={onNext} onEditEvent={onEditEvent} /></div>}
    </section>
  );
}

function SimpleInfoList({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
          <div className="mt-1 text-sm font-bold text-slate-800">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export default function RightSidebar({ collapsed = false, onOpen }: RightSidebarProps) {
  const today = useMemo(() => new Date(), []);
  const [activeCollapsedCard, setActiveCollapsedCard] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarApiEvent[]>([]);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [yearCalendarOpen, setYearCalendarOpen] = useState(true);
  const [editingEvent, setEditingEvent] = useState<CalendarApiEvent | null>(null);
  const [pinnedCollapsedCards, setPinnedCollapsedCards] = useState<Record<string, FloatingCardPosition>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const rawValue = window.localStorage.getItem(pinnedCollapsedCardsStorageKey);
      if (!rawValue) return {};
      const parsedValue = JSON.parse(rawValue) as Record<string, FloatingCardPosition>;
      return parsedValue && typeof parsedValue === "object" ? parsedValue : {};
    } catch {
      return {};
    }
  });
  const [draggingCollapsedCard, setDraggingCollapsedCard] = useState<FloatingCardDragState | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(pinnedCollapsedCardsStorageKey, JSON.stringify(pinnedCollapsedCards));
    } catch {
      // A felület működjön akkor is, ha a böngésző tárhely nem elérhető.
    }
  }, [pinnedCollapsedCards]);

  useEffect(() => {
    let mounted = true;

    async function loadCalendarEvents() {
      try {
        const response = await fetch("/api/calendar/events", { cache: "no-store" });
        const payload = (await response.json()) as { ok?: boolean; events?: CalendarApiEvent[] };
        if (mounted && response.ok && payload.ok && Array.isArray(payload.events)) {
          setCalendarEvents(payload.events);
        }
      } catch {
        if (mounted) setCalendarEvents([]);
      }
    }

    void loadCalendarEvents();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!draggingCollapsedCard) return;

    function handlePointerMove(event: MouseEvent) {
      setDraggingCollapsedCard((current) => {
        if (!current) return current;
        const deltaX = event.clientX - current.startX;
        const deltaY = event.clientY - current.startY;
        const nextX = Math.max(16, Math.min(window.innerWidth - 400, current.baseX + deltaX));
        const nextY = Math.max(16, Math.min(window.innerHeight - 180, current.baseY + deltaY));
        const moved = current.moved || Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4;

        if (moved) {
          setPinnedCollapsedCards((cards) => ({
            ...cards,
            [current.key]: { x: nextX, y: nextY },
          }));
        }

        return { ...current, moved };
      });
    }

    function handlePointerUp() {
      setDraggingCollapsedCard(null);
    }

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [draggingCollapsedCard]);

  const eventsByDate = useMemo(() => buildEventsByDate(calendarEvents), [calendarEvents]);
  const currentYear = visibleMonth.getFullYear();
  const currentMonth = visibleMonth.getMonth();
  const monthCalendar = useMemo(() => buildMonthCalendar(currentYear, currentMonth, today, eventsByDate), [currentYear, currentMonth, today, eventsByDate]);
  const yearlyWeeks = useMemo(() => Array.from({ length: 12 }).map((_, index) => ({ month: String(index + 1), weeks: buildMonthCalendar(currentYear, index, today, eventsByDate) })), [currentYear, today, eventsByDate]);

  function goPreviousMonth() {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  function goNextMonth() {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  function goPreviousYear() {
    setVisibleMonth((current) => new Date(current.getFullYear() - 1, current.getMonth(), 1));
  }

  function goNextYear() {
    setVisibleMonth((current) => new Date(current.getFullYear() + 1, current.getMonth(), 1));
  }

  function closeCollapsedCard(key: string) {
    setActiveCollapsedCard((current) => (current === key ? null : current));
    setPinnedCollapsedCards((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function startCollapsedCardDrag(key: string, event: React.MouseEvent<HTMLDivElement>) {
    const cardElement = event.currentTarget.closest("[data-floating-card]") as HTMLDivElement | null;
    if (!cardElement) return;
    const rect = cardElement.getBoundingClientRect();
    setPinnedCollapsedCards((current) => ({ ...current, [key]: { x: rect.left, y: rect.top } }));
    setDraggingCollapsedCard({
      key,
      startX: event.clientX,
      startY: event.clientY,
      baseX: rect.left,
      baseY: rect.top,
      moved: false,
    });
  }

  function handleEventSaved(event: CalendarApiEvent) {
    setCalendarEvents((current) => current.map((item) => (item.id === event.id ? event : item)));
  }

  function handleEventDeleted(eventId: string) {
    setCalendarEvents((current) => current.filter((item) => item.id !== eventId));
  }

  const editorHost = <RightSidebarEventEditorHost event={editingEvent} onClose={() => setEditingEvent(null)} onSaved={handleEventSaved} onDeleted={handleEventDeleted} />;

  const quickCards: QuickRailItem[] = [
    {
      key: "profile",
      title: "Felhasználó",
      description: "Belépett felhasználó és munkakör.",
      Icon: UserCircle,
      content: <SimpleInfoList items={[{ label: "Felhasználó", value: "Keserű Benjámin" }, { label: "Szerepkör", value: "Projektvezető" }]} />,
    },
    {
      key: "modules",
      title: "Főmodulváltó",
      description: "Munkatér, Projektkapu, Építéshely és további főmodulok.",
      Icon: LayoutGrid,
      content: <RightBoardModuleSwitch />,
    },
    {
      key: "project",
      title: "Projektválasztó",
      description: "Aktuális projekt és gyors projektkapcsolás.",
      Icon: Building2,
      content: <SimpleInfoList items={[{ label: "Aktuális projekt", value: "Duna Part Lakópark" }, { label: "Állapot", value: "Projektválasztó motor előkészítve" }]} />,
    },
    {
      key: "notifications",
      title: "Értesítések",
      description: "Friss rendszer- és projektértesítések.",
      Icon: Bell,
      content: (
        <div className="space-y-3">
          <NotificationBell showLabel dropdownAlign="left" />
          <SimpleInfoList items={[{ label: "Állapot", value: "Szerveres értesítési API bekötve" }, { label: "Közös logika", value: "Web és desktop readAt mező" }]} />
        </div>
      ),
    },
    {
      key: "month-calendar",
      title: "Havi naptár",
      description: "Havi naptár heti számozással.",
      Icon: CalendarDays,
      content: (
        <div className="space-y-3">
          <MiniMonthCalendar title={`${monthNames[currentMonth]} ${currentYear}`} weeks={monthCalendar} onPrevious={goPreviousMonth} onNext={goNextMonth} onEditEvent={setEditingEvent} />
          <Link href="/naptar" className="flex items-center justify-between rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-cyan-800 hover:bg-cyan-100">
            Teljes naptár megnyitása <ExternalLink size={13} />
          </Link>
        </div>
      ),
    },
    {
      key: "year-calendar",
      title: "Éves naptár",
      description: "Éves, heti bontású áttekintés.",
      Icon: CalendarClock,
      content: <MiniYearCalendar yearlyWeeks={yearlyWeeks} today={today} year={currentYear} onPrevious={goPreviousYear} onNext={goNextYear} onEditEvent={setEditingEvent} />,
    },
    {
      key: "links",
      title: "Kapcsolatok",
      description: "Dokumentumok, feladatok és határidős kapcsolatok.",
      Icon: Link2,
      content: <SimpleInfoList items={[{ label: "Dokumentumok", value: "Kapcsolódó projektfájlok" }, { label: "Feladatok", value: "Kapcsolódó hibák és teendők" }, { label: "Határidők", value: "Projektidőpontok és emlékeztetők" }]} />,
    },
    {
      key: "deadlines",
      title: "Határidők",
      description: "Aktív és közelgő határidők.",
      Icon: Clock,
      content: <SimpleInfoList items={[{ label: "Aktív határidő", value: "3 nyitott" }, { label: "Mai fókusz", value: "Határidős figyelő bekötése" }]} />,
    },
    {
      key: "tasks",
      title: "Feladatok",
      description: "Nyitott feladatok és hibajegyek.",
      Icon: CheckSquare,
      content: <SimpleInfoList items={[{ label: "Nyitott feladat", value: "7 tétel" }, { label: "Hibajegy", value: "Hibajegyzék kapcsolás előkészítve" }]} />,
    },
    {
      key: "history",
      title: "Előzmények",
      description: "Legutóbbi projekt- és rendszeraktivitások.",
      Icon: History,
      content: <SimpleInfoList items={[{ label: "Friss esemény", value: "12 rögzített aktivitás" }, { label: "Naplózás", value: "Audit napló motorhoz kapcsolható" }]} />,
    },
  ];

  if (collapsed) {
    return (
      <>
        <aside className="relative z-[9998] h-full w-[72px] overflow-visible px-2 py-4 text-slate-400/75">
          <div className="sticky top-4 flex flex-col items-center gap-2 rounded-2xl border border-cyan-200/20 bg-[#073847]/94 p-2 shadow-[0_18px_42px_rgba(8,47,73,0.18)] ring-1 ring-white/10 backdrop-blur-xl">
            <button
              type="button"
              onClick={onOpen}
              className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200/20 bg-white/10 text-cyan-100 hover:bg-cyan-300/20 hover:text-white"
              title="Jobb oldali board fix megnyitása"
            >
              <PanelRightOpen size={18} />
            </button>
            <div className="h-px w-9 bg-cyan-100/15" />
            {quickCards.map((item) => {
              const Icon = item.Icon;
              const pinnedPosition = pinnedCollapsedCards[item.key];
              const isPinned = Boolean(pinnedPosition);
              const isOpen = activeCollapsedCard === item.key || isPinned;
              return (
                <div key={item.key} className="relative overflow-visible">
                  <button
                    type="button"
                    title={item.title}
                    aria-label={item.title}
                    aria-expanded={isOpen}
                    onClick={() => {
                      if (isPinned) return;
                      setActiveCollapsedCard((current) => (current === item.key ? null : item.key));
                    }}
                    className={`relative z-[9999] flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${isOpen ? "border-cyan-200 bg-cyan-300/24 text-white shadow-[0_0_18px_rgba(34,211,238,0.40)]" : "border-white/10 bg-white/[0.04] text-cyan-100/75 hover:border-cyan-200/45 hover:bg-cyan-300/16 hover:text-white"}`}
                  >
                    <Icon size={18} />
                    {item.badge && <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white">{item.badge}</span>}
                  </button>
                  {isOpen && (
                    <div
                      data-floating-card
                      style={isPinned ? { left: pinnedPosition?.x ?? 0, top: pinnedPosition?.y ?? 0 } : undefined}
                      className={`${isPinned ? "fixed rounded-2xl" : "absolute right-[52px] top-0 rounded-2xl"} z-[10080] w-[390px] border border-slate-200 bg-[#f8fbff]/96 p-3 text-left text-slate-950 shadow-[-14px_16px_34px_rgba(15,23,42,0.24)] ring-1 ring-slate-900/5 backdrop-blur-xl`}
                    >
                      <div
                        onMouseDown={(event) => startCollapsedCardDrag(item.key, event)}
                        className="mb-3 flex cursor-move select-none items-start justify-between gap-3 border-b border-slate-200 px-2 pb-3"
                        title="Húzd el a kártyát rögzített lebegő kártyának"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Gyorsindító</div>
                          <div className="mt-1 truncate text-base font-black text-slate-950">{item.title}</div>
                          <div className="mt-0.5 text-xs font-semibold leading-relaxed text-slate-500">{item.description}</div>
                          {isPinned && <div className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-700">Rögzített lebegő kártya</div>}
                        </div>
                        <button
                          type="button"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={() => closeCollapsedCard(item.key)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-950"
                          title="Kártya bezárása"
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white/92 p-3 text-sm font-semibold leading-relaxed text-slate-800">
                        {item.content}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={onOpen}
                          className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-800 hover:bg-cyan-100"
                        >
                          Panel fix megnyitása
                        </button>
                        <button
                          type="button"
                          onClick={() => closeCollapsedCard(item.key)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 hover:bg-slate-50"
                        >
                          Bezárás
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
        {editorHost}
      </>
    );
  }

  return (
    <>
      <aside className="h-full w-[300px] overflow-y-auto bg-transparent px-4 py-5 text-slate-600">
        <div className="space-y-4">
          <RightBoardModuleSwitch />
          <div className="rounded-2xl border border-slate-200 bg-white/86 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.045)] backdrop-blur">
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-black text-white">K</div>
              <div className="min-w-0 flex-1 text-xs leading-tight">
                <div className="truncate font-black text-slate-800">Keserű Benjámin</div>
                <div className="truncate font-semibold text-slate-400">Projektvezető</div>
              </div>
              <ChevronDown size={14} className="text-slate-400" />
            </div>
            <button className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-bold text-slate-600 hover:bg-cyan-50" type="button">
              <span className="flex items-center gap-2"><FolderKanban size={16} />Projekt választása</span>
              <ChevronDown size={14} />
            </button>
            <div className="mt-3 flex items-center justify-between gap-3">
              <NotificationBell />
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700" type="button" title="Világos nézet"><Sun size={16} /></button>
                <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700" type="button" title="Sötét nézet"><Moon size={16} /></button>
                <button className="rounded-lg bg-slate-950 p-2 text-white shadow-sm" type="button" title="Monitor nézet"><Monitor size={16} /></button>
              </div>
            </div>
          </div>
          <FullMonthCalendar title={`${monthNames[currentMonth]} ${currentYear}`} weeks={monthCalendar} onPrevious={goPreviousMonth} onNext={goNextMonth} onEditEvent={setEditingEvent} />
          <FullYearCalendar year={currentYear} yearlyWeeks={yearlyWeeks} today={today} open={yearCalendarOpen} onToggle={() => setYearCalendarOpen((current) => !current)} onPrevious={goPreviousYear} onNext={goNextYear} onEditEvent={setEditingEvent} />
          <section className="rounded-2xl border border-slate-200 bg-white/82 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Kontextuspanel</div>
                <h3 className="mt-1 font-black text-slate-800">Függőségek és kapcsolatok</h3>
              </div>
              <Link2 size={18} className="text-slate-400" />
            </div>
            <div className="space-y-2 text-sm">
              {["Kapcsolódó dokumentumok", "Kapcsolódó feladatok", "Határidős ügyek"].map((item) => (
                <button key={item} type="button" className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-slate-600 hover:bg-cyan-50">
                  <span>{item}</span>
                  <ChevronRight size={15} className="text-slate-400" />
                </button>
              ))}
            </div>
          </section>
          <section className="grid gap-3">
            {[
              { icon: Clock, label: "Határidők", value: "3 aktív" },
              { icon: CheckSquare, label: "Feladatok", value: "7 nyitott" },
              { icon: History, label: "Előzmények", value: "12 esemény" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.label} type="button" className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/82 p-4 text-left text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.035)] hover:bg-cyan-50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500"><Icon size={17} /></div>
                    <span className="text-sm font-bold">{item.label}</span>
                  </div>
                  <span className="text-xs font-black text-slate-700">{item.value}</span>
                </button>
              );
            })}
          </section>
        </div>
      </aside>
      {editorHost}
    </>
  );
}
