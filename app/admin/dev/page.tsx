"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DevProject, DevVersion, DevWorkCategory, DevWorkSession } from "@/app/lib/dev-center/types";
import DevEnginePanel from "@/components/admin/DevEnginePanel";
import FounderFocusReminder from "@/components/admin/FounderFocusReminder";
import { BenjadminDataWorkspace, BenjadminMetric, BenjadminPagination, BenjadminStatusPill } from "@/components/admin/BenjadminDataWorkspace";
import {
  ChevronRight,
  Code2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Square,
  UploadCloud,
  X,
} from "lucide-react";

type AuthState = "checking" | "authorized" | "blocked";

const devWorkCategoryOptions: Array<{ value: DevWorkCategory; label: string }> = [
  { value: "active_development", label: "Aktív fejlesztés" },
  { value: "build_test", label: "Build és teszt" },
  { value: "waiting_blocked", label: "Várakozás / blokkolás" },
  { value: "documentation_release", label: "Dokumentáció és kiadás" },
];

type DevTimeBreakdown = Record<DevWorkCategory, number> & { gross: number; unclassified: number };

function createEmptyTimeBreakdown(): DevTimeBreakdown {
  return {
    gross: 0,
    active_development: 0,
    build_test: 0,
    waiting_blocked: 0,
    documentation_release: 0,
    unclassified: 0,
  };
}

function addTimeBreakdowns(left: DevTimeBreakdown, right: DevTimeBreakdown): DevTimeBreakdown {
  return {
    gross: left.gross + right.gross,
    active_development: left.active_development + right.active_development,
    build_test: left.build_test + right.build_test,
    waiting_blocked: left.waiting_blocked + right.waiting_blocked,
    documentation_release: left.documentation_release + right.documentation_release,
    unclassified: left.unclassified + right.unclassified,
  };
}


function formatHungarianDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function getSessionMinutes(session: DevWorkSession, now = Date.now()) {
  if (typeof session.durationMinutes === "number") return Math.max(0, session.durationMinutes);
  const start = new Date(session.startedAt).getTime();
  const end = session.endedAt ? new Date(session.endedAt).getTime() : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(1, Math.round((end - start) / 60_000));
}

function getSessionMinutesInRange(session: DevWorkSession, rangeStart: number, rangeEnd: number, now = Date.now()) {
  const start = Math.max(new Date(session.startedAt).getTime(), rangeStart);
  const rawEnd = session.endedAt ? new Date(session.endedAt).getTime() : now;
  const end = Math.min(rawEnd, rangeEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(1, Math.round((end - start) / 60_000));
}

function getSegmentMinutesInRange(startedAt: string, endedAt: string | null, rangeStart: number, rangeEnd: number, now: number) {
  const start = Math.max(new Date(startedAt).getTime(), rangeStart);
  const rawEnd = endedAt ? new Date(endedAt).getTime() : now;
  const end = Math.min(rawEnd, rangeEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.round((end - start) / 60_000));
}

function getSessionTimeBreakdown(
  session: DevWorkSession,
  now = Date.now(),
  rangeStart = Number.NEGATIVE_INFINITY,
  rangeEnd = Number.POSITIVE_INFINITY,
): DevTimeBreakdown {
  const result = createEmptyTimeBreakdown();
  const gross = Number.isFinite(rangeStart) || Number.isFinite(rangeEnd)
    ? getSessionMinutesInRange(session, rangeStart, rangeEnd, now)
    : getSessionMinutes(session, now);
  result.gross = gross;

  for (const segment of session.timeSegments || []) {
    const minutes = getSegmentMinutesInRange(segment.startedAt, segment.endedAt, rangeStart, rangeEnd, now);
    result[segment.category] += minutes;
  }

  const categorized = devWorkCategoryOptions.reduce((total, option) => total + result[option.value], 0);
  result.unclassified = Math.max(0, gross - categorized);
  return result;
}

function getSessionsTimeBreakdown(
  sessions: DevWorkSession[],
  now = Date.now(),
  rangeStart = Number.NEGATIVE_INFINITY,
  rangeEnd = Number.POSITIVE_INFINITY,
) {
  return sessions.reduce(
    (total, session) => addTimeBreakdowns(total, getSessionTimeBreakdown(session, now, rangeStart, rangeEnd)),
    createEmptyTimeBreakdown(),
  );
}

function formatDuration(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} perc`;
  const hours = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  if (hours < 24) return remaining ? `${hours} ó ${remaining} p` : `${hours} ó`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days} nap ${remainingHours} ó` : `${days} nap`;
}

function formatDurationCompact(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} p`;
  const hours = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return remaining ? `${hours} ó ${remaining} p` : `${hours} ó`;
}


function TimeBreakdownView({ breakdown, runningCategory, compact = false }: { breakdown: DevTimeBreakdown; runningCategory?: DevWorkCategory | null; compact?: boolean }) {
  return (
    <div className={`dev-time-breakdown ${compact ? "is-compact" : ""}`}>
      <div className="dev-time-breakdown__gross">
        <strong>Bruttó munkamenet</strong>
        <strong>{formatDuration(breakdown.gross)}</strong>
      </div>
      {devWorkCategoryOptions.map((option) => (
        <div key={option.value} className="dev-time-breakdown__detail">
          <span>{option.label}</span>
          <span>{formatDuration(breakdown[option.value])}</span>
        </div>
      ))}
      {breakdown.unclassified > 0 ? (
        <div className="dev-time-breakdown__detail is-unclassified">
          <span>Korábbi, nem bontott idő</span>
          <span>{formatDuration(breakdown.unclassified)}</span>
        </div>
      ) : null}
      {runningCategory ? <small className="dev-time-breakdown__running">Most fut: {devWorkCategoryOptions.find((option) => option.value === runningCategory)?.label}</small> : null}
    </div>
  );
}

function versionStatusLabel(status: DevVersion["status"]) {
  const labels: Record<DevVersion["status"], string> = {
    planned: "Tervezett",
    in_progress: "Folyamatban",
    testing: "Tesztelés alatt",
    blocked: "Beavatkozásra vár",
    completed: "Elkészült",
    released: "Kiadva",
  };
  return labels[status];
}


function versionStatusTone(status: DevVersion["status"]): "default" | "ok" | "warning" | "danger" | "info" {
  if (status === "completed" || status === "released") return "ok";
  if (status === "testing") return "info";
  if (status === "blocked") return "danger";
  if (status === "in_progress") return "warning";
  return "default";
}

function projectStatusLabel(status: DevProject["status"]) {
  return ({ active: "Aktív", paused: "Szünetel", completed: "Elkészült", archived: "Archivált", unassigned: "Besorolatlan" } as const)[status] || status;
}

function formatHungarianDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}


export default function DeveloperCenterPage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [query, setQuery] = useState("");
  const [devProjects, setDevProjects] = useState<DevProject[]>([]);
  const [devVersions, setDevVersions] = useState<DevVersion[]>([]);
  const [devWorkSessions, setDevWorkSessions] = useState<DevWorkSession[]>([]);
  const [dataError, setDataError] = useState("");
  const [timerBusy, setTimerBusy] = useState("");
  const [timerMessage, setTimerMessage] = useState("");
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [activeView, setActiveView] = useState<"versions" | "sessions" | "projects">("versions");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [engineDrawerOpen, setEngineDrawerOpen] = useState(false);

  useEffect(() => {
    async function verifyStoredAdminKey() {
      const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
      if (!key) {
        setAuthState("blocked");
        return;
      }
      try {
        const response = await fetch("/api/license/admin", {
          headers: { "x-dimpro-license-admin-key": key },
          cache: "no-store",
        });
        setAuthState(response.ok ? "authorized" : "blocked");
      } catch {
        setAuthState("blocked");
      }
    }
    void verifyStoredAdminKey();
  }, []);

  const loadDevCenterData = useCallback(async () => {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    try {
      const response = await fetch("/api/dev/projects", {
        headers: { "x-dimpro-license-admin-key": key },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        projects?: DevProject[];
        versions?: DevVersion[];
        workSessions?: DevWorkSession[];
        error?: string;
      } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A fejlesztési adatok nem tölthetők be.");
      setDevProjects(payload.projects || []);
      setDevVersions(payload.versions || []);
      setDevWorkSessions(payload.workSessions || []);
      setDataError("");
      setClockTick(Date.now());
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "A fejlesztési adatok nem tölthetők be.");
    }
  }, []);

  useEffect(() => {
    if (authState !== "authorized") return;
    void loadDevCenterData();
  }, [authState, loadDevCenterData]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);



  const summaryCounts = useMemo(() => ({
    inProgress: devVersions.filter((version) => version.status === "in_progress" || version.status === "planned").length,
    testing: devVersions.filter((version) => version.status === "testing").length,
    completed: devVersions.filter((version) => version.status === "completed" || version.status === "released").length,
    blocked: devVersions.filter((version) => version.status === "blocked").length,
  }), [devVersions]);

  const totalTimeBreakdown = useMemo(
    () => getSessionsTimeBreakdown(devWorkSessions, clockTick),
    [clockTick, devWorkSessions],
  );

  const totalTrackedMinutes = totalTimeBreakdown.gross;

  const currentMonthStart = useMemo(() => {
    const date = new Date(clockTick);
    return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  }, [clockTick]);

  const currentMonthTimeBreakdown = useMemo(
    () => getSessionsTimeBreakdown(devWorkSessions, clockTick, currentMonthStart, clockTick),
    [clockTick, currentMonthStart, devWorkSessions],
  );

  const currentMonthMinutes = currentMonthTimeBreakdown.gross;

  const activeSessionCount = useMemo(
    () => devWorkSessions.filter((session) => !session.endedAt).length,
    [devWorkSessions],
  );





  const filteredVersions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("hu-HU");
    return [...devVersions]
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .filter((version) => {
        if (statusFilter !== "all" && version.status !== statusFilter) return false;
        if (!normalized) return true;
        const projectName = devProjects.find((project) => project.id === version.projectId)?.name || "";
        return [projectName, version.moduleName, version.version, version.title, version.summary, version.status]
          .join(" ")
          .toLocaleLowerCase("hu-HU")
          .includes(normalized);
      });
  }, [devProjects, devVersions, query, statusFilter]);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("hu-HU");
    return [...devProjects]
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .filter((project) => !normalized || [project.name, project.slug, project.category, project.description, project.status].join(" ").toLocaleLowerCase("hu-HU").includes(normalized));
  }, [devProjects, query]);

  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("hu-HU");
    return [...devWorkSessions]
      .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
      .filter((session) => {
        if (!normalized) return true;
        const project = devProjects.find((item) => item.id === session.projectId);
        const version = devVersions.find((item) => item.id === session.versionId);
        return [project?.name || "", session.moduleName, version?.version || "", session.currentCategory || "", session.source, session.note || ""].join(" ").toLocaleLowerCase("hu-HU").includes(normalized);
      });
  }, [devProjects, devVersions, devWorkSessions, query]);

  const activeRows = activeView === "versions" ? filteredVersions : activeView === "sessions" ? filteredSessions : filteredProjects;
  const pageCount = Math.max(1, Math.ceil(activeRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const pagedVersions = filteredVersions.slice(pageStart, pageStart + pageSize);
  const pagedSessions = filteredSessions.slice(pageStart, pageStart + pageSize);
  const pagedProjects = filteredProjects.slice(pageStart, pageStart + pageSize);
  const selectedVersion = selectedVersionId ? devVersions.find((version) => version.id === selectedVersionId) || null : null;

  async function toggleVersionTimer(versionId: string, isRunning: boolean) {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    setTimerBusy(versionId);
    setTimerMessage("");
    try {
      const action = isRunning ? "stop" : "start";
      const response = await fetch(`/api/dev/versions/${encodeURIComponent(versionId)}/time/${action}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-license-admin-key": key,
        },
        body: JSON.stringify({
          source: "manual",
          category: "active_development",
          note: isRunning ? "Kézzel leállított munkamenet." : "Kézzel indított aktív fejlesztési munkamenet.",
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Az időmérés módosítása sikertelen.");
      setTimerMessage(isRunning ? "A fejlesztési időmérés leállítva." : "A fejlesztési időmérés elindítva.");
      await loadDevCenterData();
    } catch (error) {
      setTimerMessage(error instanceof Error ? error.message : "Az időmérés módosítása sikertelen.");
    } finally {
      setTimerBusy("");
    }
  }

  async function switchVersionTimeCategory(versionId: string, category: DevWorkCategory) {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    setTimerBusy(versionId);
    setTimerMessage("");
    try {
      const response = await fetch(`/api/dev/versions/${encodeURIComponent(versionId)}/time/category`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-license-admin-key": key,
        },
        body: JSON.stringify({ category }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Az időkategória módosítása sikertelen.");
      setTimerMessage(`Az aktív időkategória: ${devWorkCategoryOptions.find((option) => option.value === category)?.label}.`);
      await loadDevCenterData();
    } catch (error) {
      setTimerMessage(error instanceof Error ? error.message : "Az időkategória módosítása sikertelen.");
    } finally {
      setTimerBusy("");
    }
  }

  if (authState !== "authorized") {
    return (
      <main className="benjadmin-data-page">
        <section className="benjadmin-data-auth-card">
          <ShieldCheck size={22} />
          <h1>{authState === "checking" ? "Jogosultság ellenőrzése" : "Licencadmin belépés szükséges"}</h1>
          <p>A Fejlesztési Központ csak sikeres BENJADMIN licencadmin-belépés után érhető el.</p>
          {authState === "blocked" ? <Link href="/admin" className="benjadmin-data-primary-action">Licencadmin megnyitása <ChevronRight size={15} /></Link> : null}
        </section>
      </main>
    );
  }

  return (
    <>
      <BenjadminDataWorkspace
        eyebrow="BENJADMIN · FEJLESZTÉSI VEZÉRLÉS"
        title="Fejlesztési Központ"
        description="Projekt-, verzió- és munkamenet-nyilvántartás táblázatos kezeléssel. A fejlesztési motor részletei külön oldalsó panelen érhetők el."
        actions={(
          <>
            <button type="button" className="benjadmin-data-secondary-action" onClick={() => void loadDevCenterData()}><RefreshCw size={16} /> Frissítés</button>
            <button type="button" className="benjadmin-data-secondary-action" onClick={() => setEngineDrawerOpen(true)}><Code2 size={16} /> Fejlesztési motor</button>
            <Link href="/admin/release-kozpont" className="benjadmin-data-primary-action"><UploadCloud size={16} /> Release Központ</Link>
          </>
        )}
        metrics={(
          <>
            <BenjadminMetric label="Projektek" value={devProjects.length} />
            <BenjadminMetric label="Folyamatban" value={summaryCounts.inProgress} tone="warning" />
            <BenjadminMetric label="Tesztelés" value={summaryCounts.testing} />
            <BenjadminMetric label="Blokkolt" value={summaryCounts.blocked} tone={summaryCounts.blocked ? "danger" : "default"} />
            <BenjadminMetric label="Fejlesztési idő" value={formatDurationCompact(totalTrackedMinutes)} />
          </>
        )}
        toolbar={(
          <>
            <FounderFocusReminder />
            <div className="benjadmin-data-filter-group" aria-label="Fejlesztési nézet">
              <button type="button" className={activeView === "versions" ? "is-active" : ""} onClick={() => { setActiveView("versions"); setPage(1); }}>Verziók</button>
              <button type="button" className={activeView === "sessions" ? "is-active" : ""} onClick={() => { setActiveView("sessions"); setPage(1); }}>Munkamenetek</button>
              <button type="button" className={activeView === "projects" ? "is-active" : ""} onClick={() => { setActiveView("projects"); setPage(1); }}>Projektek</button>
              {activeView === "versions" ? ["all", "in_progress", "testing", "blocked", "completed"].map((status) => <button key={status} type="button" className={statusFilter === status ? "is-active" : ""} onClick={() => { setStatusFilter(status); setPage(1); }}>{status === "all" ? "Minden státusz" : versionStatusLabel(status as DevVersion["status"])}</button>) : null}
            </div>
            <label className="benjadmin-data-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Keresés projekt, modul, verzió, leírás vagy státusz alapján" /></label>
            <div className="benjadmin-data-stage-strip">
              <span className={activeSessionCount ? "is-online" : "is-unknown"}>Aktív munkamenet: <b>{activeSessionCount}</b></span>
              <span>Havi idő: <b>{formatDurationCompact(currentMonthMinutes)}</b></span>
            </div>
          </>
        )}
        footer={(
          <>
            <span className="benjadmin-data-message">{timerMessage || dataError || `${activeRows.length} megjeleníthető rekord`}</span>
            <BenjadminPagination page={safePage} pageSize={pageSize} total={activeRows.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      >
        <div className="benjadmin-data-table-scroll">
          {activeView === "versions" ? (
            <table className="benjadmin-data-table" data-testid="benjadmin-dev-versions-table">
              <thead><tr><th>Projekt</th><th>Modul</th><th>Verzió</th><th>Fejlesztés</th><th>Státusz</th><th>Ráfordítás</th><th>Aktív időkategória</th><th>Frissítve</th><th>Művelet</th></tr></thead>
              <tbody>
                {pagedVersions.length ? pagedVersions.map((version) => {
                  const project = devProjects.find((item) => item.id === version.projectId);
                  const versionSessions = devWorkSessions.filter((session) => session.versionId === version.id);
                  const breakdown = getSessionsTimeBreakdown(versionSessions, clockTick);
                  const openSession = versionSessions.find((session) => !session.endedAt);
                  const runningCategory = openSession?.currentCategory || openSession?.timeSegments?.find((segment) => !segment.endedAt)?.category || null;
                  return (
                    <tr key={version.id}>
                      <td><strong>{project?.name || "Egyéb / besorolatlan"}</strong></td>
                      <td>{version.moduleName || "Általános fejlesztés"}</td>
                      <td className="is-mono"><strong>{version.version}</strong></td>
                      <td className="is-wide"><strong>{version.title}</strong><br /><small>{version.summary || "Nincs rövid leírás."}</small></td>
                      <td><BenjadminStatusPill tone={versionStatusTone(version.status)}>{versionStatusLabel(version.status)}</BenjadminStatusPill></td>
                      <td>{formatDurationCompact(breakdown.gross)}</td>
                      <td>{runningCategory ? devWorkCategoryOptions.find((item) => item.value === runningCategory)?.label || runningCategory : "—"}</td>
                      <td className="is-nowrap">{formatHungarianDateTime(version.completedAt || version.updatedAt)}</td>
                      <td><button type="button" className="benjadmin-data-row-action" onClick={() => setSelectedVersionId(version.id)}>Részletek</button></td>
                    </tr>
                  );
                }) : <tr><td colSpan={9} className="benjadmin-data-empty">Nincs a szűrésnek megfelelő fejlesztési verzió.</td></tr>}
              </tbody>
            </table>
          ) : activeView === "sessions" ? (
            <table className="benjadmin-data-table" data-testid="benjadmin-dev-sessions-table">
              <thead><tr><th>Projekt</th><th>Modul</th><th>Verzió</th><th>Forrás</th><th>Időkategória</th><th>Kezdés</th><th>Befejezés</th><th>Időtartam</th><th>Állapot</th></tr></thead>
              <tbody>
                {pagedSessions.length ? pagedSessions.map((session) => {
                  const project = devProjects.find((item) => item.id === session.projectId);
                  const version = devVersions.find((item) => item.id === session.versionId);
                  const minutes = getSessionMinutes(session, clockTick);
                  const category = session.currentCategory || session.timeSegments?.find((segment) => !segment.endedAt)?.category || null;
                  return <tr key={session.id}><td><strong>{project?.name || "Egyéb / besorolatlan"}</strong></td><td>{session.moduleName || "Általános fejlesztés"}</td><td className="is-mono">{version?.version || "—"}</td><td>{session.source}</td><td>{category ? devWorkCategoryOptions.find((item) => item.value === category)?.label || category : "—"}</td><td className="is-nowrap">{formatHungarianDateTime(session.startedAt)}</td><td className="is-nowrap">{session.endedAt ? formatHungarianDateTime(session.endedAt) : "Fut"}</td><td>{formatDurationCompact(minutes)}</td><td><BenjadminStatusPill tone={session.endedAt ? "default" : "ok"}>{session.endedAt ? "Lezárt" : "Aktív"}</BenjadminStatusPill></td></tr>;
                }) : <tr><td colSpan={9} className="benjadmin-data-empty">Még nincs rögzített munkamenet.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="benjadmin-data-table" data-testid="benjadmin-dev-projects-table">
              <thead><tr><th>Projekt</th><th>Slug</th><th>Kategória</th><th>Státusz</th><th>Verziók</th><th>Munkamenetek</th><th>Indulás</th><th>Frissítve</th><th>Leírás</th></tr></thead>
              <tbody>
                {pagedProjects.length ? pagedProjects.map((project) => <tr key={project.id}><td><strong>{project.name}</strong></td><td className="is-mono">{project.slug}</td><td>{project.category}</td><td><BenjadminStatusPill tone={project.status === "active" ? "ok" : project.status === "paused" ? "warning" : "default"}>{projectStatusLabel(project.status)}</BenjadminStatusPill></td><td>{devVersions.filter((version) => version.projectId === project.id).length}</td><td>{devWorkSessions.filter((session) => session.projectId === project.id).length}</td><td className="is-nowrap">{formatHungarianDate(project.startedAt)}</td><td className="is-nowrap">{formatHungarianDateTime(project.updatedAt)}</td><td className="is-wide">{project.description || "—"}</td></tr>) : <tr><td colSpan={9} className="benjadmin-data-empty">Nincs projekt.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </BenjadminDataWorkspace>

      {selectedVersion ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="Verzió részletek bezárása" onClick={() => setSelectedVersionId(null)} /> : null}
      {selectedVersion ? (() => {
        const project = devProjects.find((item) => item.id === selectedVersion.projectId);
        const versionSessions = devWorkSessions.filter((session) => session.versionId === selectedVersion.id);
        const breakdown = getSessionsTimeBreakdown(versionSessions, clockTick);
        const openSession = versionSessions.find((session) => !session.endedAt);
        const runningCategory = openSession?.currentCategory || openSession?.timeSegments?.find((segment) => !segment.endedAt)?.category || null;
        const primaryUrl = selectedVersion.downloadUrl || selectedVersion.releaseUrl || selectedVersion.chatUrl;
        return (
          <aside className="benjadmin-data-drawer benjadmin-dev-drawer" data-testid="benjadmin-dev-version-drawer">
            <header><div><span>FEJLESZTÉSI VERZIÓ</span><strong>{selectedVersion.version}</strong></div><button type="button" onClick={() => setSelectedVersionId(null)} aria-label="Bezárás"><X size={18} /></button></header>
            <div className="benjadmin-data-drawer__body benjadmin-dev-version-detail">
              <section className="benjadmin-data-form-section"><header><strong>{selectedVersion.title}</strong><BenjadminStatusPill tone={versionStatusTone(selectedVersion.status)}>{versionStatusLabel(selectedVersion.status)}</BenjadminStatusPill></header><p>{selectedVersion.summary || "Nincs rövid leírás."}</p></section>
              <div className="benjadmin-dev-detail-grid"><span>Projekt<b>{project?.name || "Egyéb / besorolatlan"}</b></span><span>Modul<b>{selectedVersion.moduleName || "Általános fejlesztés"}</b></span><span>Indulás<b>{formatHungarianDateTime(selectedVersion.startedAt)}</b></span><span>Frissítés<b>{formatHungarianDateTime(selectedVersion.updatedAt)}</b></span></div>
              <section className="benjadmin-data-form-section"><header><strong>Ráfordított idő</strong><span>{formatDurationCompact(breakdown.gross)}</span></header><TimeBreakdownView breakdown={breakdown} runningCategory={runningCategory} /></section>
              {selectedVersion.testSummary ? <section className="benjadmin-data-form-section"><header><strong>Tesztösszefoglaló</strong></header><p>{selectedVersion.testSummary}</p></section> : null}
              {selectedVersion.nextStep ? <section className="benjadmin-data-form-section"><header><strong>Következő lépés</strong></header><p>{selectedVersion.nextStep}</p></section> : null}
              <div className="benjadmin-dev-drawer-actions">
                {primaryUrl ? <a href={primaryUrl} target="_blank" rel="noreferrer" className="benjadmin-data-secondary-action">Megnyitás <ChevronRight size={14} /></a> : null}
                <Link href={`/admin/fejlesztesi-naplo?project=${encodeURIComponent(selectedVersion.projectId)}`} className="benjadmin-data-secondary-action">Fejlesztési napló <ChevronRight size={14} /></Link>
              </div>
              {openSession ? <label className="benjadmin-data-field"><span>Aktív időkategória</span><select value={runningCategory || "active_development"} disabled={timerBusy === selectedVersion.id} onChange={(event) => void switchVersionTimeCategory(selectedVersion.id, event.target.value as DevWorkCategory)}>{devWorkCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : null}
              <button type="button" className={openSession ? "benjadmin-data-danger-action" : "benjadmin-data-primary-action is-full"} disabled={timerBusy === selectedVersion.id} onClick={() => void toggleVersionTimer(selectedVersion.id, Boolean(openSession))}>{openSession ? <Square size={14} /> : <Play size={14} />}{timerBusy === selectedVersion.id ? "Mentés…" : openSession ? "Munkamenet leállítása" : "Munkamenet indítása"}</button>
            </div>
          </aside>
        );
      })() : null}

      {engineDrawerOpen ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="Fejlesztési motor bezárása" onClick={() => setEngineDrawerOpen(false)} /> : null}
      {engineDrawerOpen ? <aside className="benjadmin-data-drawer benjadmin-engine-drawer" data-testid="benjadmin-dev-engine-drawer"><header><div><span>BENJADMIN</span><strong>Fejlesztési motor</strong></div><button type="button" onClick={() => setEngineDrawerOpen(false)} aria-label="Bezárás"><X size={18} /></button></header><div className="benjadmin-data-drawer__body"><DevEnginePanel /></div></aside> : null}
    </>
  );
}
