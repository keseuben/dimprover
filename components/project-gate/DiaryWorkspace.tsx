"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  CloudSun,
  Edit3,
  Filter,
  Hammer,
  Link2,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Thermometer,
  Users,
  X,
} from "lucide-react";
import styles from "./DiaryWorkspace.module.css";

type EntryStatus = "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
type WeatherCondition = "CLEAR" | "PARTLY_CLOUDY" | "CLOUDY" | "RAIN" | "SNOW" | "STORM" | "FOG" | "OTHER";
type EventType = "WORK_PROGRESS" | "OBSTACLE" | "INCIDENT" | "INSPECTION" | "DELIVERY" | "SAFETY" | "WEATHER" | "NOTE";
type EventStatus = "OPEN" | "RESOLVED" | "CANCELLED";
type Severity = "INFO" | "MEDIUM" | "HIGH" | "CRITICAL";

type DiaryEntry = {
  id: string;
  code: string;
  diaryDate: string;
  title: string;
  status: EntryStatus;
  weatherCondition: WeatherCondition;
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
  version: number;
  closedAt: string | null;
  closingNote: string;
};

type DiaryEvent = {
  id: string;
  code: string;
  eventType: EventType;
  title: string;
  description: string;
  status: EventStatus;
  severity: Severity;
  occurredAt: string;
  responsibleName: string;
  dueAt: string | null;
  calendarEventId: string | null;
  relatedDocumentIds: string[];
  dialogThreadId: string | null;
  decideRequestId: string | null;
  resolution: string;
  version: number;
};

type DiarySummary = {
  total: number;
  draft: number;
  open: number;
  closed: number;
  today: number;
  unresolvedEvents: number;
  criticalEvents: number;
};

type Health = {
  ok: boolean;
  ready: boolean;
  version: string;
  permissions: string[];
  disclaimer: string;
  database: {
    expectedSchemaVersion: string;
    actualSchemaVersion: string | null;
    tables: Record<string, boolean>;
  };
};

const STATUS_LABELS: Record<EntryStatus, string> = {
  DRAFT: "Tervezet",
  OPEN: "Nyitott",
  CLOSED: "Lezárt",
  CANCELLED: "Visszavont",
};

const WEATHER_LABELS: Record<WeatherCondition, string> = {
  CLEAR: "Derült",
  PARTLY_CLOUDY: "Részben felhős",
  CLOUDY: "Felhős",
  RAIN: "Eső",
  SNOW: "Havazás",
  STORM: "Vihar",
  FOG: "Köd",
  OTHER: "Egyéb",
};

const EVENT_LABELS: Record<EventType, string> = {
  WORK_PROGRESS: "Munkafolyamat",
  OBSTACLE: "Akadály",
  INCIDENT: "Rendkívüli esemény",
  INSPECTION: "Ellenőrzés",
  DELIVERY: "Szállítás",
  SAFETY: "Munkavédelem",
  WEATHER: "Időjárási esemény",
  NOTE: "Megjegyzés",
};

const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  OPEN: "Nyitott",
  RESOLVED: "Megoldva",
  CANCELLED: "Visszavonva",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  INFO: "Tájékoztató",
  MEDIUM: "Közepes",
  HIGH: "Magas",
  CRITICAL: "Kritikus",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "2-digit" }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string | null) {
  if (!value) return "Nincs megadva";
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function localDate() {
  return new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(16, 0, 0, 0);
  return toLocalInput(date);
}

export default function DiaryWorkspace({ projectId, permissions = [] }: { projectId: string; permissions?: string[] }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [summary, setSummary] = useState<DiarySummary | null>(null);
  const [apiPermissions, setApiPermissions] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null);
  const [events, setEvents] = useState<DiaryEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [referenceNow, setReferenceNow] = useState(() => Date.now());

  const effectivePermissions = useMemo(
    () => [...new Set([...permissions, ...apiPermissions])],
    [permissions, apiPermissions],
  );
  const canWrite = effectivePermissions.includes("diary.write");
  const canClose = effectivePermissions.includes("diary.close");

  const loadEntries = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setReferenceNow(Date.now());
    setError("");
    try {
      const healthResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/diary/health`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const healthPayload = await healthResponse.json() as Health & { error?: string };
      if (!healthResponse.ok || !healthPayload.ok) throw new Error(healthPayload.error || "A DIARY állapota nem tölthető be.");
      setHealth(healthPayload);
      setApiPermissions(healthPayload.permissions || []);
      if (!healthPayload.ready) {
        setEntries([]);
        setSummary(null);
        setSelectedId("");
        return;
      }

      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (query.trim()) params.set("query", query.trim());
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/diary/entries?${params}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        entries?: DiaryEntry[];
        summary?: DiarySummary;
        permissions?: string[];
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A DIARY bejegyzések nem tölthetők be.");
      const nextEntries = payload.entries || [];
      setEntries(nextEntries);
      setSummary(payload.summary || null);
      setApiPermissions(payload.permissions || healthPayload.permissions || []);
      setSelectedId((current) => nextEntries.some((entry) => entry.id === current) ? current : nextEntries[0]?.id || "");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "A DIARY betöltése sikertelen.");
    } finally {
      setLoading(false);
    }
  }, [projectId, query, statusFilter]);

  const loadDetail = useCallback(async (entryId: string, signal?: AbortSignal) => {
    if (!entryId || !health?.ready) {
      setSelectedEntry(null);
      setEvents([]);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/diary/entries/${encodeURIComponent(entryId)}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        entry?: DiaryEntry;
        events?: DiaryEvent[];
        permissions?: string[];
      };
      if (!response.ok || !payload.ok || !payload.entry) throw new Error(payload.error || "A naplóbejegyzés nem tölthető be.");
      setSelectedEntry(payload.entry);
      setEvents(payload.events || []);
      setApiPermissions(payload.permissions || []);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "A naplóbejegyzés nem tölthető be.");
    } finally {
      setDetailLoading(false);
    }
  }, [health?.ready, projectId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadEntries(controller.signal), query ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadEntries, query]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDetail(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadDetail, selectedId]);

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/diary/entries`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          diaryDate: form.get("diaryDate"),
          title: form.get("title"),
          status: form.get("status"),
          weatherCondition: form.get("weatherCondition"),
          weatherNote: form.get("weatherNote"),
          temperatureMinC: form.get("temperatureMinC"),
          temperatureMaxC: form.get("temperatureMaxC"),
          workforceTotal: form.get("workforceTotal"),
          workforceBreakdown: form.get("workforceBreakdown"),
          workSummary: form.get("workSummary"),
          blockerSummary: form.get("blockerSummary"),
          safetySummary: form.get("safetySummary"),
          inspectionSummary: form.get("inspectionSummary"),
          relatedDocumentIds: form.get("relatedDocumentIds"),
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; entry?: DiaryEntry };
      if (!response.ok || !payload.ok || !payload.entry) throw new Error(payload.error || "A naplóbejegyzés mentése sikertelen.");
      event.currentTarget.reset();
      setShowEntryForm(false);
      setSelectedId(payload.entry.id);
      setNotice(`${payload.entry.code} napi napló létrejött.`);
      await loadEntries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A naplóbejegyzés mentése sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEntryEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEntry) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/diary/entries/${encodeURIComponent(selectedEntry.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: selectedEntry.version,
          title: form.get("title"),
          status: form.get("status"),
          weatherCondition: form.get("weatherCondition"),
          weatherNote: form.get("weatherNote"),
          temperatureMinC: form.get("temperatureMinC"),
          temperatureMaxC: form.get("temperatureMaxC"),
          workforceTotal: form.get("workforceTotal"),
          workforceBreakdown: form.get("workforceBreakdown"),
          workSummary: form.get("workSummary"),
          blockerSummary: form.get("blockerSummary"),
          safetySummary: form.get("safetySummary"),
          inspectionSummary: form.get("inspectionSummary"),
          relatedDocumentIds: form.get("relatedDocumentIds"),
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; entry?: DiaryEntry };
      if (!response.ok || !payload.ok || !payload.entry) throw new Error(payload.error || "A naplóbejegyzés módosítása sikertelen.");
      setShowEditForm(false);
      setNotice("A napi napló adatai frissítve és auditálva.");
      await loadEntries();
      await loadDetail(payload.entry.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A naplóbejegyzés módosítása sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function closeEntry() {
    if (!selectedEntry) return;
    const closingNote = window.prompt("Lezárási megjegyzés (opcionális):", "A napi bejegyzés ellenőrizve és lezárva.");
    if (closingNote == null) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/diary/entries/${encodeURIComponent(selectedEntry.id)}/close`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: selectedEntry.version, closingNote }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; entry?: DiaryEntry };
      if (!response.ok || !payload.ok || !payload.entry) throw new Error(payload.error || "A napló lezárása sikertelen.");
      setNotice(`${payload.entry.code} lezárva.`);
      await loadEntries();
      await loadDetail(payload.entry.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A napló lezárása sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelEntry() {
    if (!selectedEntry || !window.confirm("Biztosan visszavonod ezt a napi naplóbejegyzést?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/diary/entries/${encodeURIComponent(selectedEntry.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: selectedEntry.version, status: "CANCELLED" }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; entry?: DiaryEntry };
      if (!response.ok || !payload.ok || !payload.entry) throw new Error(payload.error || "A napló visszavonása sikertelen.");
      setNotice(`${payload.entry.code} visszavonva.`);
      await loadEntries();
      setSelectedId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A napló visszavonása sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEntry) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const dueAt = form.get("dueAt");
      const occurredAt = form.get("occurredAt");
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/diary/entries/${encodeURIComponent(selectedEntry.id)}/events`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventType: form.get("eventType"),
          title: form.get("title"),
          description: form.get("description"),
          severity: form.get("severity"),
          occurredAt: occurredAt ? new Date(String(occurredAt)).toISOString() : null,
          responsibleName: form.get("responsibleName"),
          dueAt: dueAt ? new Date(String(dueAt)).toISOString() : null,
          relatedDocumentIds: form.get("relatedDocumentIds"),
          dialogThreadId: form.get("dialogThreadId"),
          decideRequestId: form.get("decideRequestId"),
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; event?: DiaryEvent; entry?: DiaryEntry };
      if (!response.ok || !payload.ok || !payload.event) throw new Error(payload.error || "Az esemény mentése sikertelen.");
      event.currentTarget.reset();
      setShowEventForm(false);
      setNotice(`${payload.event.code} esemény rögzítve${payload.event.calendarEventId ? ", naptárhoz kapcsolva" : ""}.`);
      await loadEntries();
      await loadDetail(selectedEntry.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az esemény mentése sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function resolveEvent(item: DiaryEvent) {
    const resolution = window.prompt("Megoldás / lezárási leírás:", "A feladat elvégezve és ellenőrizve.");
    if (!resolution?.trim()) return;
    await patchEvent(item, { status: "RESOLVED", resolution });
  }

  async function cancelEvent(item: DiaryEvent) {
    if (!window.confirm("Biztosan visszavonod ezt az eseményt?")) return;
    await patchEvent(item, { status: "CANCELLED", resolution: "Az esemény visszavonva." });
  }

  async function patchEvent(item: DiaryEvent, patch: Record<string, unknown>) {
    if (!selectedEntry) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/diary/entries/${encodeURIComponent(selectedEntry.id)}/events/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: item.version, ...patch }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; event?: DiaryEvent };
      if (!response.ok || !payload.ok || !payload.event) throw new Error(payload.error || "Az esemény módosítása sikertelen.");
      setNotice(`${payload.event.code}: ${EVENT_STATUS_LABELS[payload.event.status]}.`);
      await loadEntries();
      await loadDetail(selectedEntry.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az esemény módosítása sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !health) {
    return <section className={styles.statePanel}><Loader2 className={styles.spin} size={28} /><strong>DIARY betöltése</strong><span>Jogosultságok és projektnapló-adatok ellenőrzése…</span></section>;
  }

  if (health && !health.ready) {
    const tableCount = Object.values(health.database.tables || {}).filter(Boolean).length;
    const totalTables = Object.keys(health.database.tables || {}).length || 4;
    return (
      <section className={styles.setupPanel}>
        <div className={styles.setupIcon}><BookOpenCheck size={31} /></div>
        <div>
          <span>DIARY PROJECT LOG CORE 0.8.0 · ADATBÁZIS ELŐKÉSZÍTÉS</span>
          <h2>Napi projektnapló és eseménykezelés</h2>
          <p>A DIARY munkatér elkészült, de a mentés biztonságosan tiltott, amíg a 0.8.0 PostgreSQL-séma nincs alkalmazva.</p>
          <p>A DIMPRO DIARY projekt-előkészítő és nyomon követő napló; nem helyettesíti a hivatalos e-építési naplót.</p>
          <div className={styles.setupChecks}>
            <b><ShieldCheck size={14} />Project Core jogosultság</b>
            <b><CloudSun size={14} />Időjárás és létszám</b>
            <b><CalendarClock size={14} />Project Calendar esemény</b>
            <b><BookOpenCheck size={14} />Auditált naplóworkflow</b>
          </div>
          <div className={styles.sqlName}><code>DIMPRO_PROJEKTKAPU_DIARY_CORE_V080_BOOTSTRAP.sql</code><small>{tableCount}/{totalTables} tábla elérhető</small></div>
        </div>
      </section>
    );
  }

  const selectedTerminal = !selectedEntry || ["CLOSED", "CANCELLED"].includes(selectedEntry.status);
  const selectedOpenEvents = events.filter((item) => item.status === "OPEN");

  return (
    <section className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div>
          <span>DIMPRO DIARY · PROJEKTNAPLÓ 0.8.0</span>
          <h2>Napi projekt- és kivitelezési események</h2>
          <p>Időjárás, létszám, munkafolyamatok, akadályok, ellenőrzések és kapcsolódó határidők egy auditált munkatérben.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" disabled={busy} onClick={() => void loadEntries()}><RefreshCw size={15} />Frissítés</button>
          <button type="button" className={styles.primaryButton} disabled={busy || !canWrite} onClick={() => setShowEntryForm((current) => !current)}><Plus size={15} />Új napi napló</button>
        </div>
      </header>

      <div className={styles.disclaimer}><AlertTriangle size={16} /><span>{health?.disclaimer || "A DIMPRO DIARY nem helyettesíti a hivatalos e-építési naplót."}</span></div>

      <div className={styles.metrics}>
        <article><BookOpenCheck size={18} /><div><strong>{summary?.total ?? 0}</strong><span>Összes napló</span></div></article>
        <article><CalendarClock size={18} /><div><strong>{summary?.today ?? 0}</strong><span>Mai bejegyzés</span></div></article>
        <article><CircleDot size={18} /><div><strong>{summary?.open ?? 0}</strong><span>Nyitott napló</span></div></article>
        <article><CheckCircle2 size={18} /><div><strong>{summary?.closed ?? 0}</strong><span>Lezárt napló</span></div></article>
        <article><AlertTriangle size={18} /><div><strong>{summary?.unresolvedEvents ?? 0}</strong><span>Nyitott esemény</span></div></article>
        <article><ShieldCheck size={18} /><div><strong>{summary?.criticalEvents ?? 0}</strong><span>Kritikus esemény</span></div></article>
      </div>

      {(error || notice) && <div className={error ? styles.errorNotice : styles.successNotice}>{error || notice}</div>}

      {showEntryForm && canWrite && (
        <form className={styles.createForm} onSubmit={submitEntry}>
          <header><Plus size={17} /><strong>Új napi projektnapló</strong><button type="button" onClick={() => setShowEntryForm(false)} aria-label="Űrlap bezárása"><X size={16} /></button></header>
          <label>Dátum<input name="diaryDate" type="date" required defaultValue={localDate()} /></label>
          <label>Állapot<select name="status" defaultValue="OPEN"><option value="OPEN">Nyitott</option><option value="DRAFT">Tervezet</option></select></label>
          <label className={styles.formWide}>Megnevezés<input name="title" maxLength={240} placeholder="Napi projektnapló megnevezése" /></label>
          <label>Időjárás<select name="weatherCondition" defaultValue="OTHER">{Object.entries(WEATHER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Minimum °C<input name="temperatureMinC" type="number" min="-60" max="70" step="0.1" /></label>
          <label>Maximum °C<input name="temperatureMaxC" type="number" min="-60" max="70" step="0.1" /></label>
          <label>Létszám<input name="workforceTotal" type="number" min="0" max="100000" defaultValue="0" /></label>
          <label className={styles.formWide}>Időjárási megjegyzés<input name="weatherNote" maxLength={1000} placeholder="Csapadék, szél, munkavégzést befolyásoló körülmény" /></label>
          <label className={styles.formWide}>Létszámbontás<input name="workforceBreakdown" placeholder="Kivitelező 12 fő; gépészet 4 fő; villamos 3 fő" /></label>
          <label className={styles.formWide}>Elvégzett munkák<textarea name="workSummary" rows={4} maxLength={6000} /></label>
          <label className={styles.formWide}>Akadályok és késedelmek<textarea name="blockerSummary" rows={4} maxLength={4000} /></label>
          <label className={styles.formWide}>Munkavédelem<textarea name="safetySummary" rows={3} maxLength={4000} /></label>
          <label className={styles.formWide}>Ellenőrzések<textarea name="inspectionSummary" rows={3} maxLength={4000} /></label>
          <label className={styles.formWide}>Kapcsolódó dokumentumazonosítók<input name="relatedDocumentIds" placeholder="Dokumentum ID-k vesszővel elválasztva" /></label>
          <footer><button type="button" onClick={() => setShowEntryForm(false)}>Mégse</button><button type="submit" disabled={busy}><Save size={15} />Napló létrehozása</button></footer>
        </form>
      )}

      <div className={styles.toolbar}>
        <label className={styles.searchBox}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés kód, dátum, munkafolyamat vagy akadály alapján…" /></label>
        <div className={styles.filters}><Filter size={15} /><select aria-label="DIARY státuszszűrő" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">Minden aktív állapot</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      </div>

      <div className={styles.dialogLayout}>
        <aside className={styles.threadList}>
          <header><strong>Napi naplók</strong><span>{entries.length}</span></header>
          <div>
            {entries.length === 0 && <div className={styles.emptyList}><BookOpenCheck size={28} /><strong>Nincs napi napló</strong><span>Az új projekt- és kivitelezési bejegyzések itt jelennek meg.</span></div>}
            {entries.map((entry) => (
              <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)} className={selectedId === entry.id ? styles.threadActive : ""}>
                <span className={`${styles.priorityBar} ${entry.status === "CLOSED" ? styles.priorityLOW : entry.status === "OPEN" ? styles.priorityMEDIUM : styles.priorityHIGH}`} />
                <div><small>{entry.code} · {formatDate(entry.diaryDate)}</small><strong>{entry.title}</strong><p>{WEATHER_LABELS[entry.weatherCondition]} · {entry.workforceTotal} fő</p></div>
                <b>{STATUS_LABELS[entry.status]}</b>
              </button>
            ))}
          </div>
        </aside>

        <main className={styles.threadDetail}>
          {detailLoading && <div className={styles.detailState}><Loader2 className={styles.spin} size={25} /><span>Naplóbejegyzés betöltése…</span></div>}
          {!detailLoading && !selectedEntry && <div className={styles.detailState}><BookOpenCheck size={32} /><strong>Válassz napi naplót</strong><span>A részletes projektadatok és események itt jelennek meg.</span></div>}
          {!detailLoading && selectedEntry && <>
            <header className={styles.detailHeader}>
              <div><span>{selectedEntry.code} · {formatDate(selectedEntry.diaryDate)}</span><h3>{selectedEntry.title}</h3><p>{selectedEntry.workSummary || "Nincs rögzített munkafolyamat-összefoglaló."}</p></div>
              <div className={styles.detailBadges}><b>{WEATHER_LABELS[selectedEntry.weatherCondition]}</b><strong className={`${styles.entryStatus} ${styles[`status${selectedEntry.status}`]}`}>{STATUS_LABELS[selectedEntry.status]}</strong></div>
            </header>

            <section className={styles.metaGrid}>
              <article><small>Időjárás</small><strong>{WEATHER_LABELS[selectedEntry.weatherCondition]}{selectedEntry.weatherNote ? ` · ${selectedEntry.weatherNote}` : ""}</strong></article>
              <article><small>Hőmérséklet</small><strong><Thermometer size={13} /> {selectedEntry.temperatureMinC ?? "–"} / {selectedEntry.temperatureMaxC ?? "–"} °C</strong></article>
              <article><small>Összlétszám</small><strong><Users size={13} /> {selectedEntry.workforceTotal} fő</strong></article>
              <article><small>Létszámbontás</small><strong>{selectedEntry.workforceBreakdown.length ? selectedEntry.workforceBreakdown.join(", ") : "Nincs megadva"}</strong></article>
              <article><small>Dokumentumkapcsolat</small><strong><Link2 size={13} /> {selectedEntry.relatedDocumentIds.length ? `${selectedEntry.relatedDocumentIds.length} dokumentum` : "Nincs megadva"}</strong></article>
              <article><small>Nyitott esemény</small><strong>{selectedOpenEvents.length}</strong></article>
            </section>

            <section className={styles.summaryGrid}>
              <article><small>Akadályok és késedelmek</small><p>{selectedEntry.blockerSummary || "Nincs rögzített akadály."}</p></article>
              <article><small>Munkavédelem</small><p>{selectedEntry.safetySummary || "Nincs külön munkavédelmi bejegyzés."}</p></article>
              <article><small>Ellenőrzések</small><p>{selectedEntry.inspectionSummary || "Nincs külön ellenőrzési bejegyzés."}</p></article>
              <article><small>Lezárás</small><p>{selectedEntry.closedAt ? `${formatDateTime(selectedEntry.closedAt)} · ${selectedEntry.closingNote || "Lezárva."}` : "A napi napló még nincs lezárva."}</p></article>
            </section>

            {!selectedTerminal && <div className={styles.statusActions}>
              <span>Naplóműveletek</span>
              {canWrite && <button type="button" disabled={busy} onClick={() => setShowEditForm((current) => !current)}><Edit3 size={14} />Adatok módosítása</button>}
              {canClose && <button type="button" disabled={busy} onClick={() => void closeEntry()}><ClipboardCheck size={14} />Napló lezárása</button>}
              {canWrite && <button type="button" disabled={busy} className={styles.dangerButton} onClick={() => void cancelEntry()}><Ban size={14} />Visszavonás</button>}
            </div>}

            {showEditForm && canWrite && !selectedTerminal && <form key={selectedEntry.id} className={styles.inlineForm} onSubmit={submitEntryEdit}>
              <label className={styles.inlineWide}>Megnevezés<input name="title" required maxLength={240} defaultValue={selectedEntry.title} /></label>
              <label>Állapot<select name="status" defaultValue={selectedEntry.status}><option value="OPEN">Nyitott</option><option value="DRAFT">Tervezet</option></select></label>
              <label>Időjárás<select name="weatherCondition" defaultValue={selectedEntry.weatherCondition}>{Object.entries(WEATHER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Minimum °C<input name="temperatureMinC" type="number" step="0.1" defaultValue={selectedEntry.temperatureMinC ?? ""} /></label>
              <label>Maximum °C<input name="temperatureMaxC" type="number" step="0.1" defaultValue={selectedEntry.temperatureMaxC ?? ""} /></label>
              <label>Létszám<input name="workforceTotal" type="number" min="0" defaultValue={selectedEntry.workforceTotal} /></label>
              <label className={styles.inlineWide}>Időjárási megjegyzés<input name="weatherNote" defaultValue={selectedEntry.weatherNote} /></label>
              <label className={styles.inlineWide}>Létszámbontás<input name="workforceBreakdown" defaultValue={selectedEntry.workforceBreakdown.join("; ")} /></label>
              <label className={styles.inlineWide}>Elvégzett munkák<textarea name="workSummary" rows={3} defaultValue={selectedEntry.workSummary} /></label>
              <label className={styles.inlineWide}>Akadályok<textarea name="blockerSummary" rows={3} defaultValue={selectedEntry.blockerSummary} /></label>
              <label className={styles.inlineWide}>Munkavédelem<textarea name="safetySummary" rows={3} defaultValue={selectedEntry.safetySummary} /></label>
              <label className={styles.inlineWide}>Ellenőrzések<textarea name="inspectionSummary" rows={3} defaultValue={selectedEntry.inspectionSummary} /></label>
              <label className={styles.inlineFull}>Dokumentumazonosítók<input name="relatedDocumentIds" defaultValue={selectedEntry.relatedDocumentIds.join(", ")} /></label>
              <footer><button type="button" onClick={() => setShowEditForm(false)}>Mégse</button><button type="submit" disabled={busy}><Save size={14} />Mentés</button></footer>
            </form>}

            <section className={styles.eventSection}>
              <header><div><Hammer size={17} /><strong>Napi események</strong><span>{events.length} bejegyzés</span></div>{canWrite && !selectedTerminal && <button type="button" onClick={() => setShowEventForm((current) => !current)}><Plus size={14} />Új esemény</button>}</header>
              {showEventForm && canWrite && !selectedTerminal && <form className={styles.inlineForm} onSubmit={submitEvent}>
                <label>Típus<select name="eventType" defaultValue="WORK_PROGRESS">{Object.entries(EVENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>Súlyosság<select name="severity" defaultValue="INFO">{Object.entries(SEVERITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>Időpont<input name="occurredAt" type="datetime-local" defaultValue={toLocalInput(new Date())} /></label>
                <label className={styles.inlineWide}>Esemény címe<input name="title" required maxLength={240} /></label>
                <label>Felelős<input name="responsibleName" maxLength={240} /></label>
                <label>Határidő<input name="dueAt" type="datetime-local" defaultValue={defaultDueDate()} /></label>
                <label className={styles.inlineFull}>Leírás<textarea name="description" rows={3} maxLength={6000} /></label>
                <label className={styles.inlineWide}>Dokumentumazonosítók<input name="relatedDocumentIds" /></label>
                <label>DIALOG témakártya ID<input name="dialogThreadId" /></label>
                <label>DECIDE kérelem ID<input name="decideRequestId" /></label>
                <footer><button type="button" onClick={() => setShowEventForm(false)}>Mégse</button><button type="submit" disabled={busy}><PackageCheck size={14} />Esemény rögzítése</button></footer>
              </form>}

              <div className={styles.eventList}>
                {events.length === 0 && <div className={styles.messageEmpty}>Még nincs külön napi esemény.</div>}
                {events.map((item) => {
                  const overdue = item.status === "OPEN" && item.dueAt && new Date(item.dueAt).getTime() < referenceNow;
                  return <article key={item.id} className={`${styles.eventCard} ${styles[`severity${item.severity}`]}`}>
                    <header><div><small>{item.code} · {EVENT_LABELS[item.eventType]}</small><h4>{item.title}</h4></div><span className={`${styles.entryStatus} ${item.status === "RESOLVED" ? styles.statusCLOSED : item.status === "CANCELLED" ? styles.statusCANCELLED : styles.statusOPEN}`}>{overdue ? "Lejárt" : EVENT_STATUS_LABELS[item.status]}</span></header>
                    <p>{item.description || "Nincs külön leírás."}</p>
                    <div className={styles.eventMeta}><span>{SEVERITY_LABELS[item.severity]}</span><span>{formatDateTime(item.occurredAt)}</span><span>{item.responsibleName || "Nincs felelős"}</span><span>{item.dueAt ? `Határidő: ${formatDateTime(item.dueAt)}` : "Nincs határidő"}</span>{item.calendarEventId && <span>Naptárhoz kapcsolva</span>}</div>
                    {item.resolution && <p><b>Lezárás:</b> {item.resolution}</p>}
                    {canWrite && item.status === "OPEN" && <div className={styles.eventActions}><button type="button" disabled={busy} onClick={() => void resolveEvent(item)}><CheckCircle2 size={13} />Megoldva</button><button type="button" disabled={busy} onClick={() => void cancelEvent(item)}><Ban size={13} />Visszavonás</button></div>}
                  </article>;
                })}
              </div>
            </section>
          </>}
        </main>
      </div>
    </section>
  );
}
