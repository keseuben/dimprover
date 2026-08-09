"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileQuestion,
  Filter,
  Loader2,
  MessageCircleMore,
  MessagesSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import styles from "./DialogWorkspace.module.css";

type ThreadType = "RFI" | "DATA_REQUEST" | "DESIGN_COMMENT" | "COORDINATION" | "DECISION_LOG";
type ThreadStatus = "OPEN" | "WAITING_RESPONSE" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "CANCELLED";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type MessageType = "COMMENT" | "QUESTION" | "ANSWER" | "STATUS_NOTE";

type DialogThread = {
  id: string;
  code: string;
  threadType: ThreadType;
  title: string;
  description: string;
  discipline: string;
  status: ThreadStatus;
  priority: Priority;
  ownerName: string;
  participantNames: string[];
  relatedDocumentIds: string[];
  dueAt: string | null;
  calendarEventId: string | null;
  version: number;
  lastActivityAt: string;
};

type DialogMessage = {
  id: string;
  messageType: MessageType;
  body: string;
  authorName: string;
  createdAt: string;
};

type DialogSummary = {
  total: number;
  open: number;
  waitingResponse: number;
  overdue: number;
  resolved: number;
  critical: number;
};

type Health = {
  ok: boolean;
  ready: boolean;
  version: string;
  permissions: string[];
  database: {
    expectedSchemaVersion: string;
    actualSchemaVersion: string | null;
    tables: Record<string, boolean>;
  };
};

const TYPE_LABELS: Record<ThreadType, string> = {
  RFI: "RFI / szakági kérdés",
  DATA_REQUEST: "Adatkérés",
  DESIGN_COMMENT: "Tervészrevétel",
  COORDINATION: "Kooperációs pont",
  DECISION_LOG: "Döntési napló",
};

const STATUS_LABELS: Record<ThreadStatus, string> = {
  OPEN: "Nyitott",
  WAITING_RESPONSE: "Válaszra vár",
  IN_PROGRESS: "Folyamatban",
  RESOLVED: "Megoldva",
  CLOSED: "Lezárva",
  CANCELLED: "Visszavonva",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Alacsony",
  MEDIUM: "Közepes",
  HIGH: "Magas",
  CRITICAL: "Kritikus",
};

const MESSAGE_LABELS: Record<MessageType, string> = {
  COMMENT: "Hozzászólás",
  QUESTION: "Kérdés",
  ANSWER: "Válasz",
  STATUS_NOTE: "Állapotjegyzet",
};

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

function defaultDueDate() {
  const due = new Date();
  due.setDate(due.getDate() + 7);
  due.setHours(16, 0, 0, 0);
  return toLocalInput(due);
}

export default function DialogWorkspace({ projectId, permissions = [] }: { projectId: string; permissions?: string[] }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [threads, setThreads] = useState<DialogThread[]>([]);
  const [summary, setSummary] = useState<DialogSummary | null>(null);
  const [apiPermissions, setApiPermissions] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedThread, setSelectedThread] = useState<DialogThread | null>(null);
  const [messages, setMessages] = useState<DialogMessage[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [dueValue, setDueValue] = useState(defaultDueDate);
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
  const canWrite = effectivePermissions.includes("dialog.write");

  const loadThreads = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setReferenceNow(Date.now());
    setError("");
    try {
      const healthResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/dialog/health`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const healthPayload = await healthResponse.json() as Health & { error?: string };
      if (!healthResponse.ok || !healthPayload.ok) throw new Error(healthPayload.error || "A DIALOG állapota nem tölthető be.");
      setHealth(healthPayload);
      setApiPermissions(healthPayload.permissions || []);
      if (!healthPayload.ready) {
        setThreads([]);
        setSummary(null);
        setSelectedId("");
        return;
      }

      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (typeFilter !== "ALL") params.set("threadType", typeFilter);
      if (query.trim()) params.set("query", query.trim());
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/dialog/threads?${params}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        threads?: DialogThread[];
        summary?: DialogSummary;
        permissions?: string[];
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A DIALOG témakártyák nem tölthetők be.");
      const nextThreads = payload.threads || [];
      setThreads(nextThreads);
      setSummary(payload.summary || null);
      setApiPermissions(payload.permissions || healthPayload.permissions || []);
      setSelectedId((current) => nextThreads.some((thread) => thread.id === current) ? current : nextThreads[0]?.id || "");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "A DIALOG betöltése sikertelen.");
    } finally {
      setLoading(false);
    }
  }, [projectId, query, statusFilter, typeFilter]);

  const loadDetail = useCallback(async (threadId: string, signal?: AbortSignal) => {
    if (!threadId || !health?.ready) {
      setSelectedThread(null);
      setMessages([]);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/dialog/threads/${encodeURIComponent(threadId)}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        thread?: DialogThread;
        messages?: DialogMessage[];
        permissions?: string[];
      };
      if (!response.ok || !payload.ok || !payload.thread) throw new Error(payload.error || "A témakártya nem tölthető be.");
      setSelectedThread(payload.thread);
      setMessages(payload.messages || []);
      setApiPermissions(payload.permissions || []);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "A témakártya nem tölthető be.");
    } finally {
      setDetailLoading(false);
    }
  }, [health?.ready, projectId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadThreads(controller.signal), query ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadThreads, query]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDetail(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadDetail, selectedId]);

  async function submitThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/dialog/threads`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          threadType: form.get("threadType"),
          discipline: form.get("discipline"),
          priority: form.get("priority"),
          ownerName: form.get("ownerName"),
          participantNames: form.get("participantNames"),
          relatedDocumentIds: form.get("relatedDocumentIds"),
          dueAt: form.get("dueAt") ? new Date(String(form.get("dueAt"))).toISOString() : null,
          description: form.get("description"),
          initialMessage: form.get("initialMessage"),
          initialMessageType: "QUESTION",
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; thread?: DialogThread };
      if (!response.ok || !payload.ok || !payload.thread) throw new Error(payload.error || "A témakártya mentése sikertelen.");
      event.currentTarget.reset();
      setDueValue(defaultDueDate());
      setShowForm(false);
      setSelectedId(payload.thread.id);
      setNotice(`${payload.thread.code} létrejött, a határidő bekerült a projekt-naptárba.`);
      await loadThreads();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A témakártya mentése sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(status: ThreadStatus) {
    if (!selectedThread) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/dialog/threads/${encodeURIComponent(selectedThread.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: selectedThread.version, status }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; thread?: DialogThread };
      if (!response.ok || !payload.ok || !payload.thread) throw new Error(payload.error || "Az állapotváltás sikertelen.");
      setNotice(`Állapot: ${STATUS_LABELS[payload.thread.status]}. A naptári határidő szinkronizálva.`);
      await loadThreads();
      await loadDetail(payload.thread.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az állapotváltás sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThread) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/dialog/threads/${encodeURIComponent(selectedThread.id)}/messages`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageType: form.get("messageType"), body: form.get("body") }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A hozzászólás mentése sikertelen.");
      event.currentTarget.reset();
      setNotice("A hozzászólás rögzítve és auditálva.");
      await loadDetail(selectedThread.id);
      await loadThreads();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A hozzászólás mentése sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !health) {
    return <section className={styles.statePanel}><Loader2 className={styles.spin} size={28} /><strong>DIALOG betöltése</strong><span>Jogosultságok és egyeztetési adatok ellenőrzése…</span></section>;
  }

  if (health && !health.ready) {
    const tableCount = Object.values(health.database.tables || {}).filter(Boolean).length;
    const totalTables = Object.keys(health.database.tables || {}).length || 4;
    return (
      <section className={styles.setupPanel}>
        <div className={styles.setupIcon}><MessagesSquare size={31} /></div>
        <div>
          <span>DIALOG COMMUNICATION CORE 0.6.0 · ADATBÁZIS ELŐKÉSZÍTÉS</span>
          <h2>Egyeztetések és RFI témakártyák</h2>
          <p>A DIALOG munkatér már elő van készítve. A mentés biztonságosan tiltott, amíg a 0.6.0 PostgreSQL-séma nincs alkalmazva.</p>
          <div className={styles.setupChecks}>
            <b><ShieldCheck size={14} />Project Core jogosultság</b>
            <b><CalendarClock size={14} />Project Calendar határidő</b>
            <b><MessageCircleMore size={14} />Auditált hozzászólásfolyam</b>
          </div>
          <div className={styles.sqlName}><code>DIMPRO_PROJEKTKAPU_DIALOG_CORE_V060_BOOTSTRAP.sql</code><small>{tableCount}/{totalTables} tábla elérhető</small></div>
        </div>
      </section>
    );
  }

  const selectedOverdue = Boolean(selectedThread?.dueAt)
    && !["RESOLVED", "CLOSED", "CANCELLED"].includes(selectedThread?.status || "")
    && new Date(selectedThread?.dueAt || "").getTime() < referenceNow;

  return (
    <section className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div>
          <span>DIMPRO DIALOG · EGYEZTETÉSEK 0.6.0</span>
          <h2>Szakági kérdések, adatkérések és kooperációs pontok</h2>
          <p>Minden témakártya felelőshöz, határidőhöz, projekt-naptárhoz és auditnaplóhoz kapcsolódik.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" disabled={busy} onClick={() => void loadThreads()}><RefreshCw size={15} />Frissítés</button>
          <button type="button" className={styles.primaryButton} disabled={busy || !canWrite} onClick={() => setShowForm((current) => !current)}><Plus size={15} />Új egyeztetés</button>
        </div>
      </header>

      <div className={styles.metrics}>
        <article><MessagesSquare size={18} /><div><strong>{summary?.total ?? 0}</strong><span>Összes téma</span></div></article>
        <article><CircleDot size={18} /><div><strong>{summary?.open ?? 0}</strong><span>Nyitott / folyamatban</span></div></article>
        <article><Clock3 size={18} /><div><strong>{summary?.waitingResponse ?? 0}</strong><span>Válaszra vár</span></div></article>
        <article><AlertTriangle size={18} /><div><strong>{summary?.overdue ?? 0}</strong><span>Lejárt határidő</span></div></article>
        <article><CheckCircle2 size={18} /><div><strong>{summary?.resolved ?? 0}</strong><span>Megoldva / lezárva</span></div></article>
        <article><AlertTriangle size={18} /><div><strong>{summary?.critical ?? 0}</strong><span>Kritikus</span></div></article>
      </div>

      {(error || notice) && <div className={error ? styles.errorNotice : styles.successNotice}>{error || notice}</div>}

      {showForm && canWrite && (
        <form className={styles.createForm} onSubmit={submitThread}>
          <header><Plus size={17} /><strong>Új DIALOG témakártya</strong><button type="button" onClick={() => setShowForm(false)} aria-label="Űrlap bezárása"><X size={16} /></button></header>
          <label className={styles.formWide}>Téma címe<input name="title" required maxLength={240} placeholder="Például: Gépészeti akna szükséges szabad mérete" /></label>
          <label>Típus<select name="threadType" defaultValue="RFI">{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Szakág<input name="discipline" maxLength={160} placeholder="Építészet, gépészet…" /></label>
          <label>Prioritás<select name="priority" defaultValue="MEDIUM">{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Felelős<input name="ownerName" maxLength={240} placeholder="Személy vagy szervezet" /></label>
          <label>Válaszadási határidő<input name="dueAt" type="datetime-local" value={dueValue} onChange={(event) => setDueValue(event.target.value)} /></label>
          <label>Résztvevők<input name="participantNames" placeholder="Név 1; Név 2; szervezet" /></label>
          <label className={styles.formWide}>Kapcsolódó dokumentumazonosítók<input name="relatedDocumentIds" placeholder="Dokumentum ID-k vesszővel elválasztva" /></label>
          <label className={styles.formWide}>Leírás<textarea name="description" rows={3} maxLength={6000} placeholder="Előzmény, műszaki környezet és pontos kérdés" /></label>
          <label className={styles.formWide}>Első kérdés / hozzászólás<textarea name="initialMessage" rows={3} maxLength={6000} placeholder="A címzettek számára megválaszolandó kérdés" /></label>
          <footer><button type="button" onClick={() => setShowForm(false)}>Mégse</button><button type="submit" disabled={busy}>{busy ? <Loader2 className={styles.spin} size={15} /> : <FileQuestion size={15} />}Témakártya létrehozása</button></footer>
        </form>
      )}

      <div className={styles.toolbar}>
        <label className={styles.searchBox}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés kód, cím, szakág vagy felelős alapján…" /></label>
        <div className={styles.filters}><Filter size={15} />
          <select aria-label="DIALOG státuszszűrő" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">Minden aktív státusz</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select aria-label="DIALOG típusszűrő" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">Minden típus</option>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
      </div>

      <div className={styles.dialogLayout}>
        <aside className={styles.threadList}>
          <header><strong>Témakártyák</strong><span>{threads.length}</span></header>
          <div>
            {threads.length === 0 && <div className={styles.emptyList}><MessageCircleMore size={28} /><strong>Nincs egyeztetési téma</strong><span>Az új RFI-k és kooperációs pontok itt jelennek meg.</span></div>}
            {threads.map((thread) => {
              const overdue = Boolean(thread.dueAt)
                && !["RESOLVED", "CLOSED", "CANCELLED"].includes(thread.status)
                && new Date(thread.dueAt || "").getTime() < referenceNow;
              return (
                <button key={thread.id} type="button" onClick={() => setSelectedId(thread.id)} className={selectedId === thread.id ? styles.threadActive : ""}>
                  <span className={`${styles.priorityBar} ${styles[`priority${thread.priority}`]}`} />
                  <div><small>{thread.code} · {TYPE_LABELS[thread.threadType]}</small><strong>{thread.title}</strong><p>{thread.discipline || "Nincs szakág"} · {thread.ownerName || "Nincs felelős"}</p></div>
                  <b>{overdue ? "Lejárt" : STATUS_LABELS[thread.status]}</b>
                </button>
              );
            })}
          </div>
        </aside>

        <main className={styles.threadDetail}>
          {detailLoading && <div className={styles.detailState}><Loader2 className={styles.spin} size={25} /><span>Témakártya betöltése…</span></div>}
          {!detailLoading && !selectedThread && <div className={styles.detailState}><MessagesSquare size={32} /><strong>Válassz témakártyát</strong><span>A részletes adatok és hozzászólások itt jelennek meg.</span></div>}
          {!detailLoading && selectedThread && <>
            <header className={styles.detailHeader}>
              <div><span>{selectedThread.code} · {TYPE_LABELS[selectedThread.threadType]}</span><h3>{selectedThread.title}</h3><p>{selectedThread.description || "Nincs külön leírás."}</p></div>
              <div className={styles.detailBadges}><b className={styles[`priority${selectedThread.priority}`]}>{PRIORITY_LABELS[selectedThread.priority]}</b><strong>{selectedOverdue ? "Lejárt" : STATUS_LABELS[selectedThread.status]}</strong></div>
            </header>

            <section className={styles.metaGrid}>
              <article><small>Szakág</small><strong>{selectedThread.discipline || "Nincs megadva"}</strong></article>
              <article><small>Felelős</small><strong>{selectedThread.ownerName || "Nincs megadva"}</strong></article>
              <article><small>Válaszadási határidő</small><strong>{formatDateTime(selectedThread.dueAt)}</strong></article>
              <article><small>Projekt-naptár</small><strong>{selectedThread.calendarEventId ? "Kapcsolva" : "Nincs határidő"}</strong></article>
              <article><small>Résztvevők</small><strong>{selectedThread.participantNames.length ? selectedThread.participantNames.join(", ") : "Nincs megadva"}</strong></article>
              <article><small>Dokumentumkapcsolat</small><strong>{selectedThread.relatedDocumentIds.length ? `${selectedThread.relatedDocumentIds.length} dokumentum` : "Nincs megadva"}</strong></article>
            </section>

            {canWrite && !["CLOSED", "CANCELLED"].includes(selectedThread.status) && <div className={styles.statusActions}>
              <span>Állapotváltás</span>
              {selectedThread.status !== "WAITING_RESPONSE" && <button type="button" disabled={busy} onClick={() => void updateStatus("WAITING_RESPONSE")}>Válaszra vár</button>}
              {selectedThread.status !== "IN_PROGRESS" && <button type="button" disabled={busy} onClick={() => void updateStatus("IN_PROGRESS")}>Folyamatban</button>}
              {selectedThread.status !== "RESOLVED" && <button type="button" disabled={busy} onClick={() => void updateStatus("RESOLVED")}>Megoldva</button>}
              <button type="button" disabled={busy} onClick={() => void updateStatus("CLOSED")}>Lezárás</button>
              <button type="button" disabled={busy} className={styles.dangerButton} onClick={() => void updateStatus("CANCELLED")}>Visszavonás</button>
            </div>}

            <section className={styles.messageSection}>
              <header><MessagesSquare size={16} /><div><strong>Hozzászólásfolyam</strong><span>{messages.length} bejegyzés</span></div></header>
              <div className={styles.messages}>
                {messages.length === 0 && <div className={styles.messageEmpty}>Még nincs hozzászólás.</div>}
                {messages.map((message) => <article key={message.id}><header><strong>{message.authorName}</strong><span>{MESSAGE_LABELS[message.messageType]} · {formatDateTime(message.createdAt)}</span></header><p>{message.body}</p></article>)}
              </div>
              {canWrite && !["CLOSED", "CANCELLED"].includes(selectedThread.status) && <form className={styles.messageForm} onSubmit={submitMessage}>
                <select name="messageType" defaultValue="COMMENT">{Object.entries(MESSAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <textarea name="body" required rows={3} maxLength={6000} placeholder="Hozzászólás vagy válasz…" />
                <button type="submit" disabled={busy}><Send size={15} />Küldés</button>
              </form>}
            </section>
          </>}
        </main>
      </div>
    </section>
  );
}
