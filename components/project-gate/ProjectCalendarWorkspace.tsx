"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Flag,
  Loader2,
  MapPin,
  Milestone,
  Plus,
  RefreshCw,
  RotateCcw,
  Users,
  X,
} from "lucide-react";
import styles from "./ProjectCalendarWorkspace.module.css";

type EventType = "MEETING" | "DEADLINE" | "TASK" | "INSPECTION" | "MILESTONE" | "REMINDER";
type SourceModule = "DOCK" | "DIALOG" | "DECIDE" | "DIARY" | "DRIVE" | "SYSTEM";
type EventStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type CalendarEvent = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  eventType: EventType;
  sourceModule: SourceModule;
  status: EventStatus;
  priority: Priority;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string;
  ownerUserId: string | null;
  ownerName: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  version: number;
  completedAt: string | null;
};

type CalendarSummary = {
  total: number;
  overdue: number;
  today: number;
  upcoming7Days: number;
  completed: number;
  byType: Record<EventType, number>;
};

type CalendarHealth = {
  ok: boolean;
  ready: boolean;
  version: string;
  database: {
    ready: boolean;
    expectedSchemaVersion: string;
    actualSchemaVersion: string | null;
    tables: Record<string, boolean>;
  };
  permissions?: string[];
};

type EventsPayload = {
  ok: boolean;
  events: CalendarEvent[];
  summary: CalendarSummary;
  permissions?: string[];
  error?: string;
};

const EVENT_LABELS: Record<EventType, string> = {
  MEETING: "Értekezlet",
  DEADLINE: "Határidő",
  TASK: "Feladat",
  INSPECTION: "Ellenőrzés",
  MILESTONE: "Mérföldkő",
  REMINDER: "Emlékeztető",
};

const SOURCE_LABELS: Record<SourceModule, string> = {
  DOCK: "DOCK · ProjektTér",
  DIALOG: "DIALOG · Egyeztetés",
  DECIDE: "DECIDE · Jóváhagyás",
  DIARY: "DIARY · Projektnapló",
  DRIVE: "DRIVE · Dokumentumtár",
  SYSTEM: "Rendszer",
};

const STATUS_LABELS: Record<EventStatus, string> = {
  PLANNED: "Tervezett",
  IN_PROGRESS: "Folyamatban",
  COMPLETED: "Teljesítve",
  CANCELLED: "Visszavonva",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Alacsony",
  MEDIUM: "Közepes",
  HIGH: "Magas",
  CRITICAL: "Kritikus",
};

const EVENT_TYPES = Object.keys(EVENT_LABELS) as EventType[];
const SOURCE_MODULES = Object.keys(SOURCE_LABELS) as SourceModule[];

function startOfWeek(value: Date) {
  const date = new Date(value);
  const day = date.getDay() || 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function toLocalInput(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultFormDates() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

function sameCalendarDay(a: string, b: Date) {
  const date = new Date(a);
  return date.getFullYear() === b.getFullYear()
    && date.getMonth() === b.getMonth()
    && date.getDate() === b.getDate();
}

function getIsoWeekInfo(value: Date) {
  const utcDate = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const weekYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week, weekYear };
}

function formatWeekRange(start: Date, end: Date) {
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const startText = new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(start);
  const endText = new Intl.DateTimeFormat("hu-HU", {
    year: startYear === endYear ? undefined : "numeric",
    month: "long",
    day: "2-digit",
  }).format(end);
  return `${startText} – ${endText}`;
}

function formatTime(event: CalendarEvent) {
  if (event.allDay) return "Egész nap";
  return new Intl.DateTimeFormat("hu-HU", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.startsAt));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("hu-HU", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isOverdue(event: CalendarEvent, referenceNow: number) {
  return !["COMPLETED", "CANCELLED"].includes(event.status) && new Date(event.endsAt).getTime() < referenceNow;
}

export default function ProjectCalendarWorkspace({
  projectId,
  permissions = [],
}: {
  projectId: string;
  permissions?: string[];
}) {
  const [health, setHealth] = useState<CalendarHealth | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [summary, setSummary] = useState<CalendarSummary | null>(null);
  const [apiPermissions, setApiPermissions] = useState<string[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [eventType, setEventType] = useState<"ALL" | EventType>("ALL");
  const [sourceModule, setSourceModule] = useState<"ALL" | SourceModule>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [formDates, setFormDates] = useState(defaultFormDates);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [referenceNow, setReferenceNow] = useState(() => new Date().getTime());

  const effectivePermissions = useMemo(
    () => [...new Set([...permissions, ...apiPermissions])],
    [permissions, apiPermissions],
  );
  const canWrite = effectivePermissions.includes("calendar.write");

  const range = useMemo(() => {
    const endsAfter = addDays(weekStart, -30);
    const startsBefore = addDays(weekStart, 120);
    startsBefore.setHours(23, 59, 59, 999);
    return { endsAfter, startsBefore };
  }, [weekStart]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setReferenceNow(new Date().getTime());
    setError("");
    try {
      const healthResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/calendar/health`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const healthPayload = await healthResponse.json() as CalendarHealth & { error?: string };
      if (!healthResponse.ok || !healthPayload.ok) throw new Error(healthPayload.error || "A projekt-naptár állapota nem tölthető be.");
      setHealth(healthPayload);
      setApiPermissions(healthPayload.permissions || []);
      if (!healthPayload.ready) {
        setEvents([]);
        setSummary(null);
        return;
      }

      const params = new URLSearchParams({
        endsAfter: range.endsAfter.toISOString(),
        startsBefore: range.startsBefore.toISOString(),
      });
      if (eventType !== "ALL") params.set("eventType", eventType);
      if (sourceModule !== "ALL") params.set("sourceModule", sourceModule);
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/calendar/events?${params}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload = await response.json() as EventsPayload;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A projektnaptár eseményei nem tölthetők be.");
      setEvents(payload.events || []);
      setSummary(payload.summary);
      setApiPermissions(payload.permissions || healthPayload.permissions || []);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "A projekt-naptár betöltése sikertelen.");
    } finally {
      setLoading(false);
    }
  }, [projectId, range, eventType, sourceModule]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const isoWeek = useMemo(() => getIsoWeekInfo(weekStart), [weekStart]);
  const weeklyEvents = useMemo(
    () => events.filter((event) => {
      const end = addDays(weekStart, 7).getTime();
      return new Date(event.startsAt).getTime() < end && new Date(event.endsAt).getTime() >= weekStart.getTime();
    }),
    [events, weekStart],
  );
  const upcoming = useMemo(
    () => events
      .filter((event) => !["COMPLETED", "CANCELLED"].includes(event.status) && new Date(event.endsAt).getTime() >= referenceNow)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 8),
    [events, referenceNow],
  );

  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/calendar/events`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description"),
          eventType: form.get("eventType"),
          sourceModule: form.get("sourceModule"),
          priority: form.get("priority"),
          startsAt: new Date(String(form.get("startsAt"))).toISOString(),
          endsAt: new Date(String(form.get("endsAt"))).toISOString(),
          allDay: form.get("allDay") === "on",
          ownerName: form.get("ownerName"),
          location: form.get("location"),
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Az esemény mentése sikertelen.");
      event.currentTarget.reset();
      setFormDates(defaultFormDates());
      setShowForm(false);
      setNotice("A projektnaptár-esemény létrejött és bekerült az auditnaplóba.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az esemény mentése sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(event: CalendarEvent, status: Exclude<EventStatus, "CANCELLED">) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/calendar/events/${encodeURIComponent(event.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: event.version, status }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Az esemény állapotának módosítása sikertelen.");
      setNotice(status === "COMPLETED" ? "Az esemény teljesített állapotba került." : "Az esemény folyamatban állapotba került.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az esemény módosítása sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelEvent(event: CalendarEvent) {
    const reason = window.prompt("A visszavonás indoka:", "Az esemény már nem aktuális.");
    if (reason === null) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/calendar/events/${encodeURIComponent(event.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: event.version, reason }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Az esemény visszavonása sikertelen.");
      setNotice("Az esemény visszavonva és auditálva.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az esemény visszavonása sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !health) {
    return <section className={styles.statePanel}><Loader2 className={styles.spin} size={28} /><strong>Projekt-naptár betöltése</strong><span>Jogosultságok és eseményadatok ellenőrzése…</span></section>;
  }

  if (health && !health.ready) {
    const tableCount = Object.values(health.database.tables || {}).filter(Boolean).length;
    const totalTables = Object.keys(health.database.tables || {}).length || 2;
    return (
      <section className={styles.setupPanel}>
        <div className={styles.setupIcon}><CalendarDays size={31} /></div>
        <div>
          <span>PROJECT CALENDAR CORE 0.5.0 · ADATBÁZIS ELŐKÉSZÍTÉS</span>
          <h2>Közös projekt-naptár és határidőmotor</h2>
          <p>A DOCK felülete már elő van készítve. Az események mentése biztonságosan tiltott, amíg a Project Calendar Core PostgreSQL-sémája nincs alkalmazva.</p>
          <div className={styles.setupChecks}>
            <b><CheckCircle2 size={14} />Project Core jogosultság</b>
            <b><CheckCircle2 size={14} />Központi projekt-audit</b>
            <b><CheckCircle2 size={14} />DIALOG / DECIDE / DIARY forrás</b>
          </div>
          <div className={styles.sqlName}>
            <code>DIMPRO_PROJEKTKAPU_PROJECT_CALENDAR_CORE_V050_BOOTSTRAP.sql</code>
            <small>{tableCount}/{totalTables} tábla elérhető</small>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div>
          <span>DOCK · KÖZÖS PROJEKT-NAPTÁR 0.5.0</span>
          <h2>Heti projektkép és közelgő határidők</h2>
          <p>A DIALOG, DECIDE, DIARY és DRIVE későbbi eseményei ugyanebben a projekt-naptárban jelennek meg.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" disabled={busy} onClick={() => void load()} title="Naptár frissítése"><RefreshCw size={15} />Frissítés</button>
          <button type="button" className={styles.primaryButton} disabled={busy || !canWrite} onClick={() => setShowForm((current) => !current)} title={canWrite ? "Új projektesemény" : "Nincs naptárírási jogosultság"}><Plus size={15} />Új esemény</button>
        </div>
      </header>

      <div className={styles.metrics}>
        <article><CalendarDays size={18} /><div><strong>{summary?.total ?? 0}</strong><span>Esemény a nézetben</span></div></article>
        <article><AlertTriangle size={18} /><div><strong>{summary?.overdue ?? 0}</strong><span>Lejárt</span></div></article>
        <article><Clock3 size={18} /><div><strong>{summary?.today ?? 0}</strong><span>Mai esemény</span></div></article>
        <article><CalendarClock size={18} /><div><strong>{summary?.upcoming7Days ?? 0}</strong><span>Következő 7 nap</span></div></article>
        <article><CheckCircle2 size={18} /><div><strong>{summary?.completed ?? 0}</strong><span>Teljesített</span></div></article>
      </div>

      {(error || notice) && <div className={error ? styles.errorNotice : styles.successNotice}>{error || notice}</div>}

      {showForm && canWrite && (
        <form className={styles.eventForm} onSubmit={submitEvent}>
          <header><Plus size={17} /><strong>Új projektesemény</strong><button type="button" onClick={() => setShowForm(false)} aria-label="Űrlap bezárása"><X size={16} /></button></header>
          <label className={styles.formWide}>Esemény címe<input name="title" required maxLength={240} placeholder="Például: Gépészeti tervcsomag leadási határideje" /></label>
          <label>Típus<select name="eventType" defaultValue="DEADLINE">{EVENT_TYPES.map((type) => <option key={type} value={type}>{EVENT_LABELS[type]}</option>)}</select></label>
          <label>Forrásmodul<select name="sourceModule" defaultValue="DOCK">{SOURCE_MODULES.filter((module) => module !== "SYSTEM").map((module) => <option key={module} value={module}>{SOURCE_LABELS[module]}</option>)}</select></label>
          <label>Prioritás<select name="priority" defaultValue="MEDIUM"><option value="LOW">Alacsony</option><option value="MEDIUM">Közepes</option><option value="HIGH">Magas</option><option value="CRITICAL">Kritikus</option></select></label>
          <label>Felelős<input name="ownerName" maxLength={240} placeholder="Személy vagy szervezet" /></label>
          <label>Kezdés<input name="startsAt" type="datetime-local" required value={formDates.start} onChange={(event) => setFormDates((current) => ({ ...current, start: event.target.value }))} /></label>
          <label>Befejezés<input name="endsAt" type="datetime-local" required value={formDates.end} onChange={(event) => setFormDates((current) => ({ ...current, end: event.target.value }))} /></label>
          <label className={styles.formWide}>Helyszín<input name="location" maxLength={500} placeholder="Tárgyaló, építési terület vagy online kapcsolat" /></label>
          <label className={styles.formWide}>Leírás<textarea name="description" rows={3} maxLength={4000} placeholder="Rövid feladat- vagy eseményleírás" /></label>
          <label className={styles.checkboxLabel}><input name="allDay" type="checkbox" />Egész napos esemény</label>
          <footer><button type="button" onClick={() => setShowForm(false)}>Mégse</button><button type="submit" disabled={busy}>{busy ? <Loader2 className={styles.spin} size={15} /> : <CalendarDays size={15} />}Mentés</button></footer>
        </form>
      )}

      <div className={styles.toolbar}>
        <div className={styles.weekNav}>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Előző hét"><ChevronLeft size={17} /></button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))}>Mai hét</button>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Következő hét"><ChevronRight size={17} /></button>
          <div className={styles.weekIdentity} aria-label={`${isoWeek.week}. hét, ${formatWeekRange(weekStart, addDays(weekStart, 6))}`}>
            <b>{isoWeek.week}. hét</b>
            <span aria-hidden="true">|</span>
            <strong>{formatWeekRange(weekStart, addDays(weekStart, 6))}</strong>
          </div>
        </div>
        <div className={styles.filters}>
          <label>Típus<select value={eventType} onChange={(event) => setEventType(event.target.value as "ALL" | EventType)}><option value="ALL">Minden típus</option>{EVENT_TYPES.map((type) => <option key={type} value={type}>{EVENT_LABELS[type]}</option>)}</select></label>
          <label>Forrás<select value={sourceModule} onChange={(event) => setSourceModule(event.target.value as "ALL" | SourceModule)}><option value="ALL">Minden modul</option>{SOURCE_MODULES.map((module) => <option key={module} value={module}>{SOURCE_LABELS[module]}</option>)}</select></label>
        </div>
      </div>

      <div className={styles.calendarLayout}>
        <div className={styles.weekGrid}>
          {weekDays.map((day) => {
            const dayEvents = weeklyEvents.filter((event) => sameCalendarDay(event.startsAt, day));
            const today = sameCalendarDay(new Date().toISOString(), day);
            return (
              <section key={day.toISOString()} className={`${styles.dayColumn} ${today ? styles.todayColumn : ""}`}>
                <header><span>{new Intl.DateTimeFormat("hu-HU", { weekday: "short" }).format(day)}</span><strong>{day.getDate()}</strong></header>
                <div>
                  {dayEvents.length === 0 && <small className={styles.noEvent}>Nincs esemény</small>}
                  {dayEvents.map((event) => (
                    <article key={event.id} className={`${styles.eventCard} ${styles[`priority${event.priority}`]}`}>
                      <div className={styles.eventTop}><span>{EVENT_LABELS[event.eventType]}</span><b>{formatTime(event)}</b></div>
                      <strong>{event.title}</strong>
                      <small>{SOURCE_LABELS[event.sourceModule]}</small>
                      {event.ownerName && <small><Users size={12} />{event.ownerName}</small>}
                      {event.location && <small><MapPin size={12} />{event.location}</small>}
                      <div className={styles.eventFoot}>
                        <span>{isOverdue(event, referenceNow) ? "Lejárt" : STATUS_LABELS[event.status]}</span>
                        {canWrite && event.status !== "COMPLETED" && <div>
                          {event.status === "PLANNED" && <button type="button" disabled={busy} onClick={() => void updateStatus(event, "IN_PROGRESS")} title="Folyamatban"><CircleDot size={13} /></button>}
                          <button type="button" disabled={busy} onClick={() => void updateStatus(event, "COMPLETED")} title="Teljesítve"><CheckCircle2 size={13} /></button>
                          <button type="button" disabled={busy} onClick={() => void cancelEvent(event)} title="Visszavonás"><X size={13} /></button>
                        </div>}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <aside className={styles.upcomingPanel}>
          <header><Milestone size={17} /><div><strong>Közelgő határidők</strong><span>Legfeljebb 90 napos előretekintés</span></div></header>
          <div>
            {upcoming.length === 0 && <div className={styles.upcomingEmpty}><CalendarClock size={24} /><strong>Nincs közelgő tétel</strong><span>Az új határidők itt jelennek meg.</span></div>}
            {upcoming.map((event) => (
              <article key={event.id}>
                <span className={`${styles.upcomingFlag} ${styles[`priority${event.priority}`]}`}><Flag size={14} /></span>
                <div><strong>{event.title}</strong><small>{formatDateTime(event.startsAt)} · {EVENT_LABELS[event.eventType]}</small><small>{event.ownerName || SOURCE_LABELS[event.sourceModule]}</small></div>
                <b>{PRIORITY_LABELS[event.priority]}</b>
              </article>
            ))}
          </div>
          <footer><RotateCcw size={14} />A visszavont események az auditnaplóban megmaradnak.</footer>
        </aside>
      </div>
    </section>
  );
}
