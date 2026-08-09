"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DevProject, DevVersion, DevWorkCategory, DevWorkSession } from "@/app/lib/dev-center/types";
import DevPwaControls from "@/components/admin/DevPwaControls";
import DevChatStarterCard from "@/components/admin/DevChatStarterCard";
import DevPortfolioOverview from "@/components/admin/DevPortfolioOverview";
import {
  Activity,
  BellRing,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleEllipsis,
  Clock3,
  CloudCog,
  Code2,
  FileText,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  Network,
  PackageCheck,
  Search,
  ServerCog,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Play,
  Square,
  Timer,
  UploadCloud,
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

const quickLinkGroups = [
  {
    title: "Kiadás és verziók",
    icon: PackageCheck,
    items: [
      { label: "Release Központ", href: "/admin/release-kozpont", note: "DEV → STAGING → PRODUCTION állapotok" },
      { label: "Release feltöltő", href: "/admin/releases", note: "Kiadási csomagok feltöltése" },
      { label: "Fájlműhely verziók", href: "/admin/fajlmuhely-verziok", note: "Védett asztali kiadások" },
      { label: "HAGE verziók", href: "/admin/hage-verziok", note: "DEV és RUN csomagok" },
    ],
  },
  {
    title: "Rendszer és üzemeltetés",
    icon: ServerCog,
    items: [
      { label: "Szerverállapot", href: "/admin/szerver", note: "VPS, PM2, build és erőforrások" },
      { label: "Drive API", href: "/admin/drive", note: "Tokenek, upload és storage" },
      { label: "E-mail beállítások", href: "/admin/email", note: "SMTP profilok és feladók" },
      { label: "Belépési napló", href: "/admin/dimpro-belepesek", note: "OTP és hozzáférési események" },
    ],
  },
  {
    title: "Fejlesztési dokumentáció",
    icon: FileText,
    items: [
      { label: "Fejlesztési napló", href: "/admin/fejlesztesi-naplo", note: "Ötletek, döntések és folytatási pontok" },
      { label: "AI Kontextustár", href: "/admin/fejlesztesi-naplo", note: "Más AI-nak átadható projektkontextus" },
      { label: "DIMPRO rendszerstruktúra", href: "/admin/dev/rendszerstruktura", note: "Szerverek, belépések, termékek, modulok és e-mail címek" },
      { label: "Licencadmin", href: "/admin", note: "Licencek, ügyfelek és gépek" },
      { label: "Admin belépések", href: "/adminlog", note: "Admin hozzáférési események" },
    ],
  },
];


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

function versionStatusClass(status: DevVersion["status"]) {
  if (status === "completed" || status === "released") return "is-completed";
  if (status === "testing") return "is-testing";
  if (status === "blocked") return "is-waiting";
  return "is-progress";
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

  const timeSummaryRows = useMemo(() => {
    const rows = new Map<string, {
      projectId: string;
      projectName: string;
      projectStartedAt: string;
      moduleName: string;
      versionIds: Set<string>;
      totalMinutes: number;
      monthMinutes: number;
      totalBreakdown: DevTimeBreakdown;
      monthBreakdown: DevTimeBreakdown;
      activeSessions: number;
      lastActivity: string;
    }>();

    devWorkSessions.forEach((session) => {
      const project = devProjects.find((item) => item.id === session.projectId);
      const projectName = project?.name || "Egyéb / besorolatlan";
      const projectStartedAt = project?.startedAt || project?.createdAt || session.startedAt;
      const key = `${session.projectId}::${session.moduleName}`;
      const existing = rows.get(key) || {
        projectId: session.projectId,
        projectName,
        projectStartedAt,
        moduleName: session.moduleName || "Általános fejlesztés",
        versionIds: new Set<string>(),
        totalMinutes: 0,
        monthMinutes: 0,
        totalBreakdown: createEmptyTimeBreakdown(),
        monthBreakdown: createEmptyTimeBreakdown(),
        activeSessions: 0,
        lastActivity: session.endedAt || session.startedAt,
      };
      existing.versionIds.add(session.versionId);
      const sessionTotalBreakdown = getSessionTimeBreakdown(session, clockTick);
      const sessionMonthBreakdown = getSessionTimeBreakdown(session, clockTick, currentMonthStart, clockTick);
      existing.totalMinutes += sessionTotalBreakdown.gross;
      existing.monthMinutes += sessionMonthBreakdown.gross;
      existing.totalBreakdown = addTimeBreakdowns(existing.totalBreakdown, sessionTotalBreakdown);
      existing.monthBreakdown = addTimeBreakdowns(existing.monthBreakdown, sessionMonthBreakdown);
      if (!session.endedAt) existing.activeSessions += 1;
      const activity = session.endedAt || session.startedAt;
      if (new Date(activity).getTime() > new Date(existing.lastActivity).getTime()) existing.lastActivity = activity;
      rows.set(key, existing);
    });

    return [...rows.values()].sort((left, right) => right.totalMinutes - left.totalMinutes);
  }, [clockTick, currentMonthStart, devProjects, devWorkSessions]);

  const latestCompleted = useMemo(() => devVersions
    .filter((version) => version.status === "completed" || version.status === "released")
    .sort((left, right) => new Date(right.completedAt || right.updatedAt).getTime() - new Date(left.completedAt || left.updatedAt).getTime())[0], [devVersions]);

  const latestCompletedProject = latestCompleted ? devProjects.find((project) => project.id === latestCompleted.projectId) : undefined;



  const filteredVersions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("hu-HU");
    return [...devVersions]
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .filter((version) => {
        if (!normalized) return true;
        const projectName = devProjects.find((project) => project.id === version.projectId)?.name || "";
        return [projectName, version.moduleName, version.version, version.title, version.summary, version.status]
          .join(" ")
          .toLocaleLowerCase("hu-HU")
          .includes(normalized);
      });
  }, [devProjects, devVersions, query]);

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
      <main className="dev-center-page dev-auth-page">
        <section className="dev-auth-card">
          <ShieldCheck size={34} aria-hidden="true" />
          <p className="dev-kicker">Védett fejlesztői felület</p>
          <h1>Licencadmin belépés szükséges</h1>
          <p>A Fejlesztési Központ csak sikeres licencadmin-belépés után érhető el.</p>
          {authState === "checking" ? (
            <span className="dev-muted-button">Jogosultság ellenőrzése…</span>
          ) : (
            <Link href="/admin" className="dev-primary-button">Licencadmin megnyitása <ChevronRight size={17} /></Link>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="dev-center-page">
      <section className="dev-center-container">
        <header className="dev-hero" id="attekintes">
          <div>
            <p className="dev-kicker">DIMPRO belső fejlesztési vezérlőpult</p>
            <h1>Fejlesztési Központ</h1>
            <p className="dev-hero-copy">
              Projektek, verziók, fejlesztési állapotok, kiadási linkek és értesítések egyetlen áttekinthető munkafelületen.
            </p>
          </div>
          <div className="dev-hero-actions">
            <Link href="/admin/szerver" className="dev-primary-button"><ServerCog size={17} /> Szerver állapotfigyelő</Link>
            <Link href="/admin/dev/rendszerstruktura" className="dev-secondary-button"><Network size={17} /> Rendszerstruktúra</Link>
            <Link href="/admin/fejlesztesi-naplo" className="dev-secondary-button"><FileText size={17} /> Fejlesztési napló</Link>
            <Link href="/admin/releases" className="dev-primary-button"><UploadCloud size={17} /> Új release</Link>
          </div>
        </header>

        <DevChatStarterCard />

        <section className="dev-alert-setup" id="ertesitesek">
          <div className="dev-alert-setup__heading">
            <div className="dev-alert-setup__icon"><BellRing size={24} aria-hidden="true" /></div>
            <div>
              <p className="dev-section-label">Egyszeri mobilbeállítás</p>
              <h2>DIMPRO Dev telepítés és hangos értesítés</h2>
              <p>Telepítse a mobilalkalmazást, engedélyezze a push értesítést, majd próbálja ki az egyedi, erős DIMPRO jelzőhangot.</p>
            </div>
          </div>
          <DevPwaControls />
        </section>

        <section className="dev-summary-grid" aria-label="Fejlesztési összesítő">
          <SummaryCard icon={Code2} label="Folyamatban" value={String(summaryCounts.inProgress)} note="aktív fejlesztési kör" tone="cyan" />
          <SummaryCard icon={Activity} label="Tesztelés alatt" value={String(summaryCounts.testing)} note="ellenőrzésre vár" tone="blue" />
          <SummaryCard icon={CheckCircle2} label="Elkészült" value={String(summaryCounts.completed)} note="lezárt fejlesztési kör" tone="green" />
          <SummaryCard icon={CircleEllipsis} label="Kézi beavatkozás" value={String(summaryCounts.blocked)} note={summaryCounts.blocked ? "beavatkozást igényel" : "nincs blokkoló feladat"} tone="amber" />
          <SummaryCard icon={Timer} label="Bruttó fejlesztési idő" value={formatDurationCompact(totalTrackedMinutes)} note={`${activeSessionCount} aktív munkamenet`} tone="cyan" />
        </section>

        <section className="dev-section" id="projektek">
          <div className="dev-section-heading">
            <div>
              <p className="dev-section-label">Projektalapú fejlesztési nyilvántartás</p>
              <h2>Fejlesztési projektek</h2>
            </div>
            <label className="dev-search">
              <Search size={18} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Projekt vagy verzió keresése" />
            </label>
          </div>

          {dataError ? <div className="dev-data-warning">{dataError} A tartalék projektlista látható.</div> : null}
          <DevPortfolioOverview
            projects={devProjects}
            versions={devVersions}
            workSessions={devWorkSessions}
            now={clockTick}
            query={query}
            showHeading={false}
          />
        </section>

        <section className="dev-section" id="idok">
          <div className="dev-section-heading">
            <div>
              <p className="dev-section-label">Aktív munkamenetek alapján</p>
              <h2>Ráfordított fejlesztési idő</h2>
            </div>
            <div className="dev-time-heading-stats">
              <span><strong>{formatDuration(totalTrackedMinutes)}</strong> összesen</span>
              <span><strong>{formatDuration(currentMonthMinutes)}</strong> ebben a hónapban</span>
              <span className={activeSessionCount ? "is-running" : ""}><strong>{activeSessionCount}</strong> aktív</span>
            </div>
          </div>

          {timerMessage ? <div className="dev-timer-message">{timerMessage}</div> : null}
          <div className="dev-time-overview-grid">
            <article>
              <span>Összesített időbontás</span>
              <TimeBreakdownView breakdown={totalTimeBreakdown} />
            </article>
            <article>
              <span>Aktuális hónap</span>
              <TimeBreakdownView breakdown={currentMonthTimeBreakdown} />
            </article>
          </div>
          <div className="dev-time-table-shell">
            <table className="dev-time-table">
              <thead>
                <tr>
                  <th>Projekt</th>
                  <th>Modul</th>
                  <th>Projekt indulása</th>
                  <th>Verziók</th>
                  <th>Teljes időbontás</th>
                  <th>Aktuális hónap</th>
                  <th>Állapot</th>
                  <th>Utolsó munka</th>
                </tr>
              </thead>
              <tbody>
                {timeSummaryRows.map((row) => (
                  <tr key={`${row.projectId}-${row.moduleName}`}>
                    <td data-label="Projekt"><strong>{row.projectName}</strong></td>
                    <td data-label="Modul"><span className="dev-module-badge">{row.moduleName}</span></td>
                    <td data-label="Projekt indulása">{formatHungarianDate(row.projectStartedAt)}</td>
                    <td data-label="Verziók">{row.versionIds.size}</td>
                    <td data-label="Teljes idő"><TimeBreakdownView breakdown={row.totalBreakdown} compact /></td>
                    <td data-label="Havi idő"><TimeBreakdownView breakdown={row.monthBreakdown} compact /></td>
                    <td data-label="Állapot">
                      {row.activeSessions ? <span className="dev-time-running"><span /> {row.activeSessions} fut</span> : <span className="dev-time-stopped">lezárva</span>}
                    </td>
                    <td data-label="Utolsó munka">{formatHungarianDateTime(row.lastActivity)}</td>
                  </tr>
                ))}
                {!timeSummaryRows.length ? (
                  <tr><td colSpan={8} className="dev-version-empty">Még nincs rögzített fejlesztési munkamenet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="dev-time-disclaimer">A bruttó munkamenet az indítás és leállítás közötti teljes idő. Az új munkameneteken belül a kategóriaváltások külön rögzítik az aktív fejlesztést, a buildet és tesztet, a várakozást, valamint a dokumentációt és kiadást. A korábbi lezárt adatok hitelesen, nem bontott időként maradnak meg.</p>
        </section>

        <section className="dev-section" id="verziok">
          <div className="dev-section-heading">
            <div>
              <p className="dev-section-label">Projekt- és verziótörténet</p>
              <h2>Fejlesztési verziók</h2>
            </div>
            <span className="dev-version-count">{filteredVersions.length} verzió</span>
          </div>

          <div className="dev-version-table-shell">
            <table className="dev-version-table">
              <thead>
                <tr>
                  <th>Projekt</th>
                  <th>Modul</th>
                  <th>Verzió</th>
                  <th>Fejlesztés rövid leírása</th>
                  <th>Állapot</th>
                  <th>Ráfordított idő</th>
                  <th>Frissítve / befejezve</th>
                  <th>Műveletek</th>
                </tr>
              </thead>
              <tbody>
                {filteredVersions.map((version) => {
                  const project = devProjects.find((item) => item.id === version.projectId);
                  const primaryUrl = version.downloadUrl || version.releaseUrl || version.chatUrl;
                  const versionSessions = devWorkSessions.filter((session) => session.versionId === version.id);
                  const versionBreakdown = getSessionsTimeBreakdown(versionSessions, clockTick);
                  const openSession = versionSessions.find((session) => !session.endedAt);
                  const isRunning = Boolean(openSession);
                  const runningCategory = openSession?.currentCategory || openSession?.timeSegments?.find((segment) => !segment.endedAt)?.category || null;
                  return (
                    <tr key={version.id}>
                      <td data-label="Projekt">
                        <strong className="dev-version-project">{project?.name || "Egyéb / besorolatlan"}</strong>
                      </td>
                      <td data-label="Modul">
                        <span className="dev-module-badge">{version.moduleName || "Általános fejlesztés"}</span>
                      </td>
                      <td data-label="Verzió">
                        <span className="dev-version-code">{version.version}</span>
                      </td>
                      <td data-label="Fejlesztés">
                        <strong className="dev-version-title">{version.title}</strong>
                        <span className="dev-version-summary">{version.summary || "Nincs rövid leírás rögzítve."}</span>
                      </td>
                      <td data-label="Állapot">
                        <span className={`dev-status ${versionStatusClass(version.status)}`}>{versionStatusLabel(version.status)}</span>
                      </td>
                      <td data-label="Ráfordítás">
                        <TimeBreakdownView breakdown={versionBreakdown} runningCategory={runningCategory} compact />
                      </td>
                      <td data-label="Időpont">
                        <span className="dev-version-date">{formatHungarianDateTime(version.completedAt || version.updatedAt)}</span>
                      </td>
                      <td data-label="Műveletek">
                        <div className="dev-version-actions">
                          {primaryUrl ? <a href={primaryUrl} target="_blank" rel="noreferrer">Megnyitás <ChevronRight size={14} /></a> : null}
                          <Link href={`/admin/fejlesztesi-naplo?project=${encodeURIComponent(version.projectId)}`}>Napló <ChevronRight size={14} /></Link>
                          {isRunning ? (
                            <label className="dev-time-category-control">
                              <span>Időtípus</span>
                              <select
                                value={runningCategory || "active_development"}
                                disabled={timerBusy === version.id}
                                onChange={(event) => void switchVersionTimeCategory(version.id, event.target.value as DevWorkCategory)}
                              >
                                {devWorkCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            </label>
                          ) : null}
                          <button
                            type="button"
                            className={isRunning ? "is-stop" : "is-start"}
                            disabled={timerBusy === version.id}
                            onClick={() => void toggleVersionTimer(version.id, isRunning)}
                            title={isRunning ? "Aktív fejlesztési munkamenet leállítása" : "Új fejlesztési munkamenet indítása"}
                          >
                            {isRunning ? <Square size={12} /> : <Play size={12} />}
                            {timerBusy === version.id ? "Mentés…" : isRunning ? "Leállítás" : "Indítás"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filteredVersions.length ? (
                  <tr>
                    <td colSpan={8} className="dev-version-empty">Nincs a keresésnek megfelelő fejlesztési verzió.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dev-two-column">
          <article className="dev-panel" id="ertesitesek-allapot">
            <div className="dev-panel-heading">
              <div className="dev-panel-icon"><BellRing size={21} /></div>
              <div><p className="dev-section-label">Következő fejlesztési kör</p><h2>Fejlesztési értesítések</h2></div>
            </div>
            <div className="dev-notification-preview">
              <div className="dev-notification-preview__icon"><CheckCircle2 size={20} /></div>
              <div>
                <strong>{latestCompleted ? `${latestCompletedProject?.name || "DIMPRO fejlesztés"} – ${latestCompleted.version}` : "DIMPRO fejlesztés elkészült"}</strong>
                <p>{latestCompleted?.summary || "A projekt, verzió, rövid változásleírás és befejezési idő itt fog megjelenni."}</p>
              </div>
              <span>{latestCompleted ? formatHungarianDate(latestCompleted.completedAt || latestCompleted.updatedAt) : "minta"}</span>
            </div>
            <div className="dev-feature-list">
              <FeatureLine icon={Smartphone} title="PWA mobilalkalmazás" note="Kezdőképernyőre telepíthető DIMPRO Dev felület." />
              <FeatureLine icon={BellRing} title="Hangos push értesítés" note="Rendszerhanggal, rezgéssel és megnyitható verziókártyával." />
              <FeatureLine icon={CloudCog} title="Dev Reporter API" note="A ChatGPT védett végponton rögzíti a fejlesztési állapotot." />
            </div>
            <div className="dev-callout"><Clock3 size={18} /><span>A projekt–verzió API már elkészült; a következő kör a PWA push és a hangos értesítési csatorna.</span></div>
          </article>

          <article className="dev-panel">
            <div className="dev-panel-heading">
              <div className="dev-panel-icon"><GitBranch size={21} /></div>
              <div><p className="dev-section-label">Kötelező ellenőrzési lánc</p><h2>Fejlesztési munkafolyamat</h2></div>
            </div>
            <ol className="dev-workflow">
              <WorkflowStep number="01" title="Backup és fejlesztői környezet" note="Módosítás előtt mentés és elkülönített DEV példány." />
              <WorkflowStep number="02" title="Kódolás és verziórögzítés" note="Projekt, verzió és rövid változásleírás rögzítése." />
              <WorkflowStep number="03" title="Build, típus- és smoke teszt" note="Automatikus ellenőrzések, majd legalább 10 mintateszt." />
              <WorkflowStep number="04" title="Release és értesítés" note="Kiadási link, befejezési idő és mobilos értesítés." />
            </ol>
          </article>
        </section>

        <section className="dev-section" id="gyorslinkek">
          <div className="dev-section-heading">
            <div><p className="dev-section-label">Átlátható kategóriák</p><h2>Fejlesztési gyorslinkek</h2></div>
          </div>
          <div className="dev-link-group-grid">
            {quickLinkGroups.map((group) => {
              const Icon = group.icon;
              return (
                <article key={group.title} className="dev-link-group">
                  <div className="dev-link-group__title"><Icon size={20} /><h3>{group.title}</h3></div>
                  <div className="dev-link-list">
                    {group.items.map((item) => (
                      <Link key={item.href + item.label} href={item.href}>
                        <span><strong>{item.label}</strong><small>{item.note}</small></span>
                        <ChevronRight size={17} />
                      </Link>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <footer className="dev-footer">
          <span><Sparkles size={16} /> DIMPRO Fejlesztési Központ – első felületi fejlesztési kör</span>
          <Link href="/admin">Licencadmin megnyitása <ChevronRight size={15} /></Link>
        </footer>
      </section>

      <nav className="dev-mobile-nav" aria-label="Mobil alsó navigáció">
        <a href="#attekintes"><LayoutDashboard size={19} /><span>Áttekintés</span></a>
        <a href="#ertesitesek"><BellRing size={19} /><span>Értesítés</span></a>
        <a href="#projektek"><FolderKanban size={19} /><span>Projektek</span></a>
        <a href="#idok"><Timer size={19} /><span>Idő</span></a>
        <a href="#verziok"><Boxes size={19} /><span>Verziók</span></a>
      </nav>
    </main>
  );
}

function SummaryCard({ icon: Icon, label, value, note, tone }: { icon: typeof Code2; label: string; value: string; note: string; tone: string }) {
  return <article className={`dev-summary-card tone-${tone}`}><div className="dev-summary-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>;
}

function FeatureLine({ icon: Icon, title, note }: { icon: typeof Smartphone; title: string; note: string }) {
  return <div className="dev-feature-line"><Icon size={19} /><div><strong>{title}</strong><p>{note}</p></div></div>;
}

function WorkflowStep({ number, title, note }: { number: string; title: string; note: string }) {
  return <li><span>{number}</span><div><strong>{title}</strong><p>{note}</p></div></li>;
}
