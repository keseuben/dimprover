"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Filter,
  GitBranch,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
  XCircle,
} from "lucide-react";
import styles from "./DecideWorkspace.module.css";

type RequestType = "PLAN_APPROVAL" | "PRODUCT_SUBSTITUTION" | "COST_IMPACT" | "SCHEDULE_IMPACT" | "TECHNICAL_DECISION";
type RequestStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "CANCELLED";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type StageMode = "ALL" | "ANY";
type ApproverStatus = "WAITING" | "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "SKIPPED";
type NoteType = "COMMENT" | "STATUS_NOTE";

type DecideRequest = {
  id: string;
  code: string;
  requestType: RequestType;
  title: string;
  description: string;
  status: RequestStatus;
  priority: Priority;
  requesterName: string;
  ownerName: string;
  dueAt: string | null;
  costImpactMinor: number | null;
  currency: string;
  scheduleImpactDays: number | null;
  relatedDocumentIds: string[];
  dialogThreadId: string | null;
  calendarEventId: string | null;
  currentStage: number;
  stageCount: number;
  version: number;
  updatedAt: string;
};

type DecideApprover = {
  id: string;
  stageNumber: number;
  stageMode: StageMode;
  approverUserId: string;
  approverName: string;
  approverRole: string;
  status: ApproverStatus;
  responseComment: string;
  respondedAt: string | null;
};

type DecideNote = {
  id: string;
  noteType: NoteType;
  body: string;
  authorName: string;
  createdAt: string;
};

type Summary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  changesRequested: number;
  overdue: number;
  critical: number;
};

type Health = {
  ok: boolean;
  ready: boolean;
  version: string;
  actorUserId: string;
  actorDisplayName?: string;
  permissions: string[];
  database: {
    expectedSchemaVersion: string;
    actualSchemaVersion: string | null;
    tables: Record<string, boolean>;
  };
};

type ApproverRow = {
  key: string;
  stageNumber: number;
  stageMode: StageMode;
  approverUserId: string;
  approverName: string;
  approverRole: string;
};

const TYPE_LABELS: Record<RequestType, string> = {
  PLAN_APPROVAL: "Tervjóváhagyás",
  PRODUCT_SUBSTITUTION: "Termékkiváltás",
  COST_IMPACT: "Költséghatás",
  SCHEDULE_IMPACT: "Határidőhatás",
  TECHNICAL_DECISION: "Műszaki döntés",
};

const STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: "Tervezet",
  PENDING: "Jóváhagyás alatt",
  APPROVED: "Jóváhagyva",
  REJECTED: "Elutasítva",
  CHANGES_REQUESTED: "Módosítás szükséges",
  CANCELLED: "Visszavonva",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Alacsony",
  MEDIUM: "Közepes",
  HIGH: "Magas",
  CRITICAL: "Kritikus",
};

const APPROVER_STATUS_LABELS: Record<ApproverStatus, string> = {
  WAITING: "Következő szakasz",
  PENDING: "Válaszra vár",
  APPROVED: "Jóváhagyta",
  REJECTED: "Elutasította",
  CHANGES_REQUESTED: "Módosítást kért",
  SKIPPED: "Kihagyva",
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

function formatMoney(value: number | null, currency: string) {
  if (value == null) return "Nincs megadva";
  return new Intl.NumberFormat("hu-HU", { style: "currency", currency: currency || "HUF", maximumFractionDigits: 0 }).format(value);
}

function newApproverRow(stageNumber = 1, actorUserId = "", actorDisplayName = ""): ApproverRow {
  return {
    key: `approver-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    stageNumber,
    stageMode: "ALL",
    approverUserId: actorUserId,
    approverName: actorDisplayName,
    approverRole: "Jóváhagyó",
  };
}

export default function DecideWorkspace({ projectId, permissions = [] }: { projectId: string; permissions?: string[] }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [requests, setRequests] = useState<DecideRequest[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [apiPermissions, setApiPermissions] = useState<string[]>([]);
  const [actorUserId, setActorUserId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<DecideRequest | null>(null);
  const [approvers, setApprovers] = useState<DecideApprover[]>([]);
  const [notes, setNotes] = useState<DecideNote[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [dueValue, setDueValue] = useState(defaultDueDate);
  const [approverRows, setApproverRows] = useState<ApproverRow[]>([newApproverRow()]);
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
  const canWrite = effectivePermissions.includes("approval.write");
  const canRespond = effectivePermissions.includes("approval.respond");

  const loadRequests = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setReferenceNow(Date.now());
    setError("");
    try {
      const healthResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decide/health`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const healthPayload = await healthResponse.json() as Health & { error?: string };
      if (!healthResponse.ok || !healthPayload.ok) throw new Error(healthPayload.error || "A DECIDE állapota nem tölthető be.");
      setHealth(healthPayload);
      setActorUserId(healthPayload.actorUserId || "");
      setApiPermissions(healthPayload.permissions || []);
      setApproverRows((current) => current.length === 1 && !current[0].approverUserId
        ? [newApproverRow(1, healthPayload.actorUserId || "", healthPayload.actorDisplayName || "")]
        : current);
      if (!healthPayload.ready) {
        setRequests([]);
        setSummary(null);
        setSelectedId("");
        return;
      }

      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (typeFilter !== "ALL") params.set("requestType", typeFilter);
      if (query.trim()) params.set("query", query.trim());
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decide/requests?${params}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        requests?: DecideRequest[];
        summary?: Summary;
        permissions?: string[];
        actorUserId?: string;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A döntési kérelmek nem tölthetők be.");
      const nextRequests = payload.requests || [];
      setRequests(nextRequests);
      setSummary(payload.summary || null);
      setApiPermissions(payload.permissions || healthPayload.permissions || []);
      setActorUserId(payload.actorUserId || healthPayload.actorUserId || "");
      setSelectedId((current) => nextRequests.some((item) => item.id === current) ? current : nextRequests[0]?.id || "");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "A DECIDE betöltése sikertelen.");
    } finally {
      setLoading(false);
    }
  }, [projectId, query, statusFilter, typeFilter]);

  const loadDetail = useCallback(async (requestId: string, signal?: AbortSignal) => {
    if (!requestId || !health?.ready) {
      setSelectedRequest(null);
      setApprovers([]);
      setNotes([]);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decide/requests/${encodeURIComponent(requestId)}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        request?: DecideRequest;
        approvers?: DecideApprover[];
        notes?: DecideNote[];
        actorUserId?: string;
        permissions?: string[];
      };
      if (!response.ok || !payload.ok || !payload.request) throw new Error(payload.error || "A döntési kérelem nem tölthető be.");
      setSelectedRequest(payload.request);
      setApprovers(payload.approvers || []);
      setNotes(payload.notes || []);
      setActorUserId(payload.actorUserId || "");
      setApiPermissions(payload.permissions || []);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "A döntési kérelem nem tölthető be.");
    } finally {
      setDetailLoading(false);
    }
  }, [health?.ready, projectId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadRequests(controller.signal), query ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadRequests, query]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDetail(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadDetail, selectedId]);

  function updateApproverRow(key: string, patch: Partial<ApproverRow>) {
    setApproverRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decide/requests`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          requestType: form.get("requestType"),
          priority: form.get("priority"),
          ownerName: form.get("ownerName"),
          dueAt: form.get("dueAt") ? new Date(String(form.get("dueAt"))).toISOString() : null,
          costImpactMinor: form.get("costImpactMinor") === "" ? null : Number(form.get("costImpactMinor")),
          currency: "HUF",
          scheduleImpactDays: form.get("scheduleImpactDays") === "" ? null : Number(form.get("scheduleImpactDays")),
          relatedDocumentIds: form.get("relatedDocumentIds"),
          dialogThreadId: form.get("dialogThreadId"),
          description: form.get("description"),
          initialNote: form.get("initialNote"),
          approvers: approverRows.map((row) => ({
            stageNumber: row.stageNumber,
            stageMode: row.stageMode,
            approverUserId: row.approverUserId,
            approverName: row.approverName,
            approverRole: row.approverRole,
          })),
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; request?: DecideRequest };
      if (!response.ok || !payload.ok || !payload.request) throw new Error(payload.error || "A döntési kérelem mentése sikertelen.");
      event.currentTarget.reset();
      setDueValue(defaultDueDate());
      setApproverRows([newApproverRow(1, actorUserId, "")]);
      setShowForm(false);
      setSelectedId(payload.request.id);
      setNotice(`${payload.request.code} létrejött, a jóváhagyási lánc és a naptári határidő aktív.`);
      await loadRequests();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A döntési kérelem mentése sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function respond(approver: DecideApprover, responseValue: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED") {
    if (!selectedRequest) return;
    const comment = window.prompt(
      responseValue === "APPROVED" ? "Jóváhagyói megjegyzés (opcionális):" : "Indoklás (kötelező):",
      "",
    );
    if (comment === null) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decide/requests/${encodeURIComponent(selectedRequest.id)}/respond`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approverId: approver.id, response: responseValue, comment }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; request?: DecideRequest };
      if (!response.ok || !payload.ok || !payload.request) throw new Error(payload.error || "A jóváhagyói válasz mentése sikertelen.");
      setNotice(`Válasz rögzítve. Kérelem állapota: ${STATUS_LABELS[payload.request.status]}.`);
      await loadRequests();
      await loadDetail(payload.request.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A jóváhagyói válasz mentése sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest() {
    if (!selectedRequest) return;
    const reason = window.prompt("A visszavonás indoka:", "A döntési kérelem már nem aktuális.");
    if (reason === null) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decide/requests/${encodeURIComponent(selectedRequest.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: selectedRequest.version, status: "CANCELLED", description: `${selectedRequest.description}\n\nVisszavonás indoka: ${reason}`.trim() }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; request?: DecideRequest };
      if (!response.ok || !payload.ok || !payload.request) throw new Error(payload.error || "A visszavonás sikertelen.");
      setNotice("A kérelem visszavonva, a jóváhagyási feladatok és a naptári határidő lezárva.");
      await loadRequests();
      await loadDetail(payload.request.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A visszavonás sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRequest) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decide/requests/${encodeURIComponent(selectedRequest.id)}/notes`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ noteType: form.get("noteType"), body: form.get("body") }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A megjegyzés mentése sikertelen.");
      event.currentTarget.reset();
      setNotice("A döntési megjegyzés rögzítve és auditálva.");
      await loadDetail(selectedRequest.id);
      await loadRequests();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A megjegyzés mentése sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !health) {
    return <section className={styles.statePanel}><Loader2 className={styles.spin} size={28} /><strong>DECIDE betöltése</strong><span>Jogosultságok és jóváhagyási adatok ellenőrzése…</span></section>;
  }

  if (health && !health.ready) {
    const tableCount = Object.values(health.database.tables || {}).filter(Boolean).length;
    const totalTables = Object.keys(health.database.tables || {}).length || 5;
    return (
      <section className={styles.setupPanel}>
        <div className={styles.setupIcon}><BadgeCheck size={31} /></div>
        <div>
          <span>DECIDE WORKFLOW CORE 0.7.0 · ADATBÁZIS ELŐKÉSZÍTÉS</span>
          <h2>Auditálható jóváhagyások és döntési folyamatok</h2>
          <p>A DECIDE munkatér elő van készítve. A mentés és válaszadás biztonságosan tiltott, amíg a 0.7.0 PostgreSQL-séma nincs alkalmazva.</p>
          <div className={styles.setupChecks}>
            <b><ShieldCheck size={14} />Project Core jogosultság</b>
            <b><GitBranch size={14} />Soros és párhuzamos szakaszok</b>
            <b><CalendarClock size={14} />Project Calendar határidő</b>
          </div>
          <div className={styles.sqlName}><code>DIMPRO_PROJEKTKAPU_DECIDE_CORE_V070_BOOTSTRAP.sql</code><small>{tableCount}/{totalTables} tábla elérhető</small></div>
        </div>
      </section>
    );
  }

  const selectedOverdue = Boolean(selectedRequest?.dueAt)
    && selectedRequest?.status === "PENDING"
    && new Date(selectedRequest.dueAt || "").getTime() < referenceNow;
  const groupedApprovers = [...new Set(approvers.map((item) => item.stageNumber))].sort((a, b) => a - b);
  const myPendingApprovers = approvers.filter((item) => item.approverUserId === actorUserId && item.status === "PENDING");

  return (
    <section className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div>
          <span>DIMPRO DECIDE · JÓVÁHAGYÁSOK 0.7.0</span>
          <h2>Auditálható döntések és jóváhagyási láncok</h2>
          <p>Tervek, termékkiváltások, költség- és határidőhatások soros vagy párhuzamos döntési szakaszokkal.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" disabled={busy} onClick={() => void loadRequests()}><RefreshCw size={15} />Frissítés</button>
          <button type="button" className={styles.primaryButton} disabled={busy || !canWrite} onClick={() => setShowForm((current) => !current)}><Plus size={15} />Új jóváhagyás</button>
        </div>
      </header>

      <div className={styles.metrics}>
        <article><FileCheck2 size={18} /><div><strong>{summary?.total ?? 0}</strong><span>Összes kérelem</span></div></article>
        <article><Clock3 size={18} /><div><strong>{summary?.pending ?? 0}</strong><span>Jóváhagyás alatt</span></div></article>
        <article><CheckCircle2 size={18} /><div><strong>{summary?.approved ?? 0}</strong><span>Jóváhagyva</span></div></article>
        <article><XCircle size={18} /><div><strong>{summary?.rejected ?? 0}</strong><span>Elutasítva</span></div></article>
        <article><AlertTriangle size={18} /><div><strong>{summary?.changesRequested ?? 0}</strong><span>Módosítás szükséges</span></div></article>
        <article><CalendarClock size={18} /><div><strong>{summary?.overdue ?? 0}</strong><span>Lejárt határidő</span></div></article>
        <article><AlertTriangle size={18} /><div><strong>{summary?.critical ?? 0}</strong><span>Kritikus</span></div></article>
      </div>

      {(error || notice) && <div className={error ? styles.errorNotice : styles.successNotice}>{error || notice}</div>}

      {showForm && canWrite && (
        <form className={styles.createForm} onSubmit={submitRequest}>
          <header><Plus size={17} /><strong>Új döntési / jóváhagyási kérelem</strong><button type="button" onClick={() => setShowForm(false)} aria-label="Űrlap bezárása"><X size={16} /></button></header>
          <label className={styles.formWide}>Kérelem címe<input name="title" required maxLength={240} placeholder="Például: Homlokzati hőszigetelő rendszer kiváltásának jóváhagyása" /></label>
          <label>Típus<select name="requestType" defaultValue="TECHNICAL_DECISION">{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Prioritás<select name="priority" defaultValue="MEDIUM">{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Felelős<input name="ownerName" maxLength={240} placeholder="Személy vagy szervezet" /></label>
          <label>Döntési határidő<input name="dueAt" type="datetime-local" value={dueValue} onChange={(event) => setDueValue(event.target.value)} /></label>
          <label>Költséghatás (Ft)<input name="costImpactMinor" type="number" step="1" placeholder="Például: 1250000" /></label>
          <label>Határidőhatás (nap)<input name="scheduleImpactDays" type="number" step="1" placeholder="Például: 5" /></label>
          <label className={styles.formWide}>Kapcsolódó dokumentumazonosítók<input name="relatedDocumentIds" placeholder="Dokumentum ID-k vesszővel elválasztva" /></label>
          <label className={styles.formWide}>Kapcsolódó DIALOG-téma<input name="dialogThreadId" placeholder="Opcionális DIALOG témakártya-azonosító" /></label>
          <label className={styles.formWide}>Leírás<textarea name="description" rows={3} maxLength={6000} placeholder="Műszaki tartalom, alternatívák, következmények és javaslat" /></label>
          <label className={styles.formWide}>Indító megjegyzés<textarea name="initialNote" rows={3} maxLength={6000} placeholder="A jóváhagyók számára szükséges kiegészítő információ" /></label>

          <section className={styles.approverEditor}>
            <header><div><GitBranch size={16} /><strong>Jóváhagyási lánc</strong><span>Azonos szakaszszám = párhuzamos jóváhagyás.</span></div><button type="button" onClick={() => setApproverRows((current) => [...current, newApproverRow(Math.max(...current.map((row) => row.stageNumber)) + 1)])}><Plus size={14} />Jóváhagyó</button></header>
            <div>
              {approverRows.map((row) => (
                <article key={row.key}>
                  <label>Szakasz<input type="number" min="1" max="20" value={row.stageNumber} onChange={(event) => updateApproverRow(row.key, { stageNumber: Number(event.target.value) || 1 })} /></label>
                  <label>Mód<select value={row.stageMode} onChange={(event) => updateApproverRow(row.key, { stageMode: event.target.value as StageMode })}><option value="ALL">Mindenki szükséges</option><option value="ANY">Egy jóváhagyás elég</option></select></label>
                  <label>Felhasználóazonosító<input required value={row.approverUserId} onChange={(event) => updateApproverRow(row.key, { approverUserId: event.target.value })} /></label>
                  <label>Név<input required value={row.approverName} onChange={(event) => updateApproverRow(row.key, { approverName: event.target.value })} /></label>
                  <label>Szerep<input value={row.approverRole} onChange={(event) => updateApproverRow(row.key, { approverRole: event.target.value })} /></label>
                  <button type="button" aria-label="Jóváhagyó törlése" disabled={approverRows.length === 1} onClick={() => setApproverRows((current) => current.filter((item) => item.key !== row.key))}><Trash2 size={15} /></button>
                </article>
              ))}
            </div>
          </section>

          <footer><button type="button" onClick={() => setShowForm(false)}>Mégse</button><button type="submit" disabled={busy}>{busy ? <Loader2 className={styles.spin} size={15} /> : <BadgeCheck size={15} />}Kérelem benyújtása</button></footer>
        </form>
      )}

      <div className={styles.toolbar}>
        <label className={styles.searchBox}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés kód, cím, kérelmező vagy felelős alapján…" /></label>
        <div className={styles.filters}><Filter size={15} />
          <select aria-label="DECIDE státuszszűrő" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">Minden aktív státusz</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select aria-label="DECIDE típusszűrő" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">Minden típus</option>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
      </div>

      <div className={styles.decideLayout}>
        <aside className={styles.requestList}>
          <header><strong>Döntési kérelmek</strong><span>{requests.length}</span></header>
          <div>
            {requests.length === 0 && <div className={styles.emptyList}><BadgeCheck size={28} /><strong>Nincs döntési kérelem</strong><span>Az új jóváhagyások itt jelennek meg.</span></div>}
            {requests.map((item) => {
              const overdue = item.status === "PENDING" && item.dueAt && new Date(item.dueAt).getTime() < referenceNow;
              return (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={selectedId === item.id ? styles.requestActive : ""}>
                  <span className={`${styles.priorityBar} ${styles[`priority${item.priority}`]}`} />
                  <div><small>{item.code} · {TYPE_LABELS[item.requestType]}</small><strong>{item.title}</strong><p>{item.ownerName || item.requesterName} · {item.currentStage}/{item.stageCount}. szakasz</p></div>
                  <b>{overdue ? "Lejárt" : STATUS_LABELS[item.status]}</b>
                </button>
              );
            })}
          </div>
        </aside>

        <main className={styles.requestDetail}>
          {detailLoading && <div className={styles.detailState}><Loader2 className={styles.spin} size={25} /><span>Döntési kérelem betöltése…</span></div>}
          {!detailLoading && !selectedRequest && <div className={styles.detailState}><FileCheck2 size={32} /><strong>Válassz döntési kérelmet</strong><span>A részletes hatások és jóváhagyási szakaszok itt jelennek meg.</span></div>}
          {!detailLoading && selectedRequest && <>
            <header className={styles.detailHeader}>
              <div><span>{selectedRequest.code} · {TYPE_LABELS[selectedRequest.requestType]}</span><h3>{selectedRequest.title}</h3><p>{selectedRequest.description || "Nincs külön leírás."}</p></div>
              <div className={styles.detailBadges}><b className={styles[`priority${selectedRequest.priority}`]}>{PRIORITY_LABELS[selectedRequest.priority]}</b><strong>{selectedOverdue ? "Lejárt" : STATUS_LABELS[selectedRequest.status]}</strong></div>
            </header>

            <section className={styles.impactGrid}>
              <article><CircleDollarSign size={17} /><small>Költséghatás</small><strong>{formatMoney(selectedRequest.costImpactMinor, selectedRequest.currency)}</strong></article>
              <article><CalendarClock size={17} /><small>Határidőhatás</small><strong>{selectedRequest.scheduleImpactDays == null ? "Nincs megadva" : `${selectedRequest.scheduleImpactDays} nap`}</strong></article>
              <article><Clock3 size={17} /><small>Döntési határidő</small><strong>{formatDateTime(selectedRequest.dueAt)}</strong></article>
              <article><UserCheck size={17} /><small>Felelős</small><strong>{selectedRequest.ownerName || selectedRequest.requesterName}</strong></article>
              <article><FileCheck2 size={17} /><small>Dokumentumkapcsolat</small><strong>{selectedRequest.relatedDocumentIds.length ? `${selectedRequest.relatedDocumentIds.length} dokumentum` : "Nincs megadva"}</strong></article>
              <article><MessageSquareText size={17} /><small>DIALOG-kapcsolat</small><strong>{selectedRequest.dialogThreadId ? "Kapcsolva" : "Nincs megadva"}</strong></article>
            </section>

            {myPendingApprovers.length > 0 && canRespond && <section className={styles.myDecision}>
              <header><ShieldCheck size={17} /><div><strong>Rád váró döntés</strong><span>{selectedRequest.currentStage}. jóváhagyási szakasz</span></div></header>
              {myPendingApprovers.map((approver) => <div key={approver.id}><span>{approver.approverName} · {approver.approverRole || "Jóváhagyó"}</span><div><button type="button" disabled={busy} onClick={() => void respond(approver, "APPROVED")}><CheckCircle2 size={14} />Jóváhagyás</button><button type="button" disabled={busy} onClick={() => void respond(approver, "CHANGES_REQUESTED")}><AlertTriangle size={14} />Módosítás</button><button type="button" disabled={busy} className={styles.dangerButton} onClick={() => void respond(approver, "REJECTED")}><XCircle size={14} />Elutasítás</button></div></div>)}
            </section>}

            <section className={styles.workflowSection}>
              <header><GitBranch size={17} /><div><strong>Jóváhagyási lánc</strong><span>{selectedRequest.currentStage}/{selectedRequest.stageCount}. szakasz aktív</span></div></header>
              <div>
                {groupedApprovers.map((stage) => {
                  const stageApprovers = approvers.filter((item) => item.stageNumber === stage);
                  return <article key={stage} className={stage === selectedRequest.currentStage && selectedRequest.status === "PENDING" ? styles.stageActive : ""}>
                    <header><b>{stage}. szakasz</b><span>{stageApprovers[0]?.stageMode === "ANY" ? "Legalább egy jóváhagyás" : "Minden jóváhagyó szükséges"}</span></header>
                    <div>{stageApprovers.map((approver) => <div key={approver.id}><span className={styles[`approver${approver.status}`]}>{APPROVER_STATUS_LABELS[approver.status]}</span><strong>{approver.approverName}</strong><small>{approver.approverRole || approver.approverUserId}</small>{approver.responseComment && <p>{approver.responseComment}</p>}</div>)}</div>
                  </article>;
                })}
              </div>
            </section>

            {canWrite && selectedRequest.status === "PENDING" && <div className={styles.requestActions}><button type="button" disabled={busy} className={styles.dangerButton} onClick={() => void cancelRequest()}><XCircle size={14} />Kérelem visszavonása</button></div>}

            <section className={styles.noteSection}>
              <header><MessageSquareText size={16} /><div><strong>Döntési megjegyzések</strong><span>{notes.length} bejegyzés</span></div></header>
              <div className={styles.notes}>{notes.length === 0 && <div className={styles.noteEmpty}>Még nincs döntési megjegyzés.</div>}{notes.map((note) => <article key={note.id}><header><strong>{note.authorName}</strong><span>{note.noteType === "STATUS_NOTE" ? "Állapotjegyzet" : "Megjegyzés"} · {formatDateTime(note.createdAt)}</span></header><p>{note.body}</p></article>)}</div>
              {canWrite && <form className={styles.noteForm} onSubmit={submitNote}><select name="noteType" defaultValue="COMMENT"><option value="COMMENT">Megjegyzés</option><option value="STATUS_NOTE">Állapotjegyzet</option></select><textarea name="body" required rows={3} maxLength={6000} placeholder="Döntési megjegyzés…" /><button type="submit" disabled={busy}><Send size={15} />Küldés</button></form>}
            </section>
          </>}
        </main>
      </div>
    </section>
  );
}
