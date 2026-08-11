"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bot,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  GitBranch,
  HardDrive,
  KeyRound,
  ListTodo,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import type { DevEngineGateStatus, DevEngineTask, DevEngineWorker, DevEngineWorkerSession } from "@/app/lib/dev-center/engine-types";
import type { DevProject, DevVersion, DevWorkSession } from "@/app/lib/dev-center/types";
import BenjadminEntitlementsPanel from "./BenjadminEntitlementsPanel";
import BenjadminControlPlanePanel from "./BenjadminControlPlanePanel";
import BenjadminPartnerDevelopmentPanel from "./BenjadminPartnerDevelopmentPanel";
import { BenjadminBarChart, BenjadminSparklineCard } from "./BenjadminDashboardKit";

type OperatorView = "overview" | "control" | "partners" | "tasks" | "team" | "workers" | "environments" | "entitlements" | "release" | "audit";

type RawEnvironment = { id?: string; code?: string; name?: string; kind?: string; status?: string; read_only?: boolean; updated_at?: string };
type RawLease = { id?: string; session_id?: string; task_id?: string; branch_name?: string; worktree_path?: string; status?: string; lease_expires_at?: string };
type RawConflict = { id?: string; conflict_type?: string; requester_session_id?: string; holder_session_id?: string; task_id?: string; status?: string; summary?: string; created_at?: string };
type RawBackup = { status?: string; snapshot_id?: string; finished_at?: string };

type EngineState = {
  workers: DevEngineWorker[];
  tasks: DevEngineTask[];
  sessions: DevEngineWorkerSession[];
  locks: Array<{ id?: string; session_id?: string; task_id?: string; scope_type?: string; scope_key?: string; status?: string; expires_at?: string }>;
  worktreeLeases: RawLease[];
  conflicts: RawConflict[];
  environments: RawEnvironment[];
  backups: RawBackup[];
  updatedAt?: string;
};

type OrchestrationSnapshot = {
  activeWorktreeLeases: RawLease[];
  openConflicts: RawConflict[];
  staleSessions: Array<{ id?: string }>;
  checkedAt?: string;
};

type Props = {
  onOpenLicense: () => void;
  onLogout: () => void;
  devProjects: DevProject[];
  devVersions: DevVersion[];
  devWorkSessions: DevWorkSession[];
};

type PaginationProps = { page: number; pageCount: number; total: number; onPage: (page: number) => void };

const PAGE_SIZE = 8;

const views: Array<{ id: OperatorView; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Áttekintés", icon: Activity },
  { id: "control", label: "Control", icon: TerminalSquare },
  { id: "partners", label: "Partner fejlesztések", icon: Boxes },
  { id: "tasks", label: "Taskok", icon: ListTodo },
  { id: "team", label: "Csapat", icon: Bot },
  { id: "workers", label: "Worker-ek", icon: Bot },
  { id: "environments", label: "Környezetek", icon: ServerCog },
  { id: "entitlements", label: "Licenc / AI", icon: KeyRound },
  { id: "release", label: "Release", icon: GitBranch },
  { id: "audit", label: "Audit", icon: ShieldCheck },
];

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDuration(minutes?: number | null) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} p`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ó ${rest} p` : `${hours} ó`;
}

function compactPath(value?: string | null) {
  if (!value) return "—";
  const marker = "/worktrees/";
  const index = value.indexOf(marker);
  return index >= 0 ? value.slice(index + marker.length) : value;
}

function statusTone(status?: string) {
  const value = (status || "").toLowerCase();
  if (["ready", "active", "online", "completed", "released"].includes(value)) return "is-ok";
  if (["busy", "running", "in_progress", "testing", "claimed", "open"].includes(value)) return "is-active";
  if (["blocked", "failed", "offline", "expired", "cancelled"].includes(value)) return "is-danger";
  return "is-muted";
}

function workerAvatarSrc(code?: string) {
  const avatars: Record<string, string> = {
    ARMINAI: "/benjadmin/team/03_ArminAI.webp",
    JAZMINAI: "/benjadmin/team/04_JazminAI.webp",
    OUTMINAI: "/benjadmin/team/05_OutminAI.webp",
  };
  return avatars[(code || "").toUpperCase()] || "/benjadmin/team/02_BenAI.webp";
}

function teamAvatarSrc(id?: string, code?: string) {
  if (id === "benjadmin") return "/benjadmin/team/01_BenjAdmin.webp";
  if (id === "benai") return "/benjadmin/team/02_BenAI.webp";
  return workerAvatarSrc(code);
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    queued: "Sorban", ready: "Indítható", claimed: "Lefoglalva", in_progress: "Fejlesztés", testing: "Teszt",
    blocked: "Blokkolt", completed: "Kész", cancelled: "Törölve", released: "Kiadva", planned: "Tervezett",
    active: "Aktív", closed: "Lezárt", open: "Nyitott", online: "Online", offline: "Offline", paused: "Szünetel",
  };
  return status ? labels[status] || status : "—";
}

function paginate<T>(items: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  return { items: items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), pageCount, safePage };
}

function Pagination({ page, pageCount, total, onPage }: PaginationProps) {
  return (
    <div className="operator-pagination">
      <span>{total} rekord · {page}/{pageCount}. oldal</span>
      <div>
        <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}><ArrowLeft size={14} /> Előző</button>
        <button type="button" onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>Következő <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}

export default function BenjadminOperatorConsole({ onOpenLicense, onLogout, devProjects, devVersions, devWorkSessions }: Props) {
  const [state, setState] = useState<EngineState | null>(null);
  const [gate, setGate] = useState<DevEngineGateStatus | null>(null);
  const [orchestration, setOrchestration] = useState<OrchestrationSnapshot | null>(null);
  const [view, setView] = useState<OperatorView>("overview");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastLiveAt, setLastLiveAt] = useState("");
  const refreshInFlightRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (refreshInFlightRef.current) return;
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;

    refreshInFlightRef.current = true;
    if (!silent) setBusy(true);
    try {
      const headers = { "x-dimpro-license-admin-key": key };
      const response = await fetch("/api/dev/engine/live", { headers, cache: "no-store" });
      const payload = await response.json().catch(() => null) as {
        state?: EngineState;
        gate?: DevEngineGateStatus;
        orchestration?: OrchestrationSnapshot;
        live?: { generatedAt?: string };
        error?: string;
      } | null;
      if (!response.ok || !payload?.state) throw new Error(payload?.error || "Az élő BENJADMIN állapot nem tölthető be.");
      setState(payload.state);
      setGate(payload.gate || null);
      setOrchestration(payload.orchestration || null);
      setLastLiveAt(payload.live?.generatedAt || new Date().toISOString());
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "A BENJADMIN élő adatfrissítés nem érhető el.");
    } finally {
      refreshInFlightRef.current = false;
      if (!silent) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(false);

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const intervalId = window.setInterval(refreshIfVisible, 5000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [load]);
  useEffect(() => { setPage(1); }, [view, query]);

  const normalizedQuery = query.trim().toLocaleLowerCase("hu-HU");
  const workers = useMemo(() => state?.workers || [], [state?.workers]);
  const tasks = useMemo(() => state?.tasks || [], [state?.tasks]);
  const sessions = useMemo(() => state?.sessions || [], [state?.sessions]);
  const activeTasks = tasks.filter((task) => ["queued", "ready", "claimed", "in_progress", "testing", "blocked"].includes(task.status));
  const readySessions = sessions.filter((session) => session.status === "active" && session.handshakeStage === "READY");
  const openConflicts = orchestration?.openConflicts || state?.conflicts.filter((item) => item.status === "open") || [];
  const staleCount = orchestration?.staleSessions.length || 0;

  const taskAnalytics = useMemo(() => {
    const total = Math.max(1, tasks.length);
    const count = (...statuses: DevEngineTask["status"][]) => tasks.filter((task) => statuses.includes(task.status)).length;
    return [
      { label: "Fut / teszt", value: count("claimed", "in_progress", "testing"), total, tone: "info" as const, hint: "aktív végrehajtás" },
      { label: "Várakozik", value: count("queued", "ready"), total, tone: "warning" as const, hint: "queue / indítható" },
      { label: "Blokkolt", value: count("blocked"), total, tone: "danger" as const, hint: "beavatkozást kér" },
      { label: "Kész", value: count("completed"), total, tone: "ok" as const, hint: "lezárt fejlesztés" },
    ];
  }, [tasks]);

  const workerAnalytics = useMemo(() => {
    const activeByWorker = new Map<string, number>();
    for (const task of activeTasks) {
      const workerId = task.assignedWorkerId || task.requestedWorkerId;
      if (workerId) activeByWorker.set(workerId, (activeByWorker.get(workerId) || 0) + 1);
    }
    const max = Math.max(1, ...Array.from(activeByWorker.values()));
    return workers.map((worker) => ({
      label: worker.code,
      value: activeByWorker.get(worker.id) || 0,
      total: max,
      tone: (worker.code === "OUTMINAI" ? "warning" : "info") as "warning" | "info",
      hint: sessions.find((session) => session.workerId === worker.id && session.status !== "closed")?.handshakeStage || worker.status.toUpperCase(),
    }));
  }, [activeTasks, workers, sessions]);

  const activityTrend = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 7 }, () => 0);
    for (const session of devWorkSessions) {
      const started = new Date(session.startedAt);
      if (Number.isNaN(started.getTime())) continue;
      const diffDays = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(started.getFullYear(), started.getMonth(), started.getDate()).getTime()) / 86400000);
      if (diffDays >= 0 && diffDays < 7) buckets[6 - diffDays] += session.durationMinutes || 0;
    }
    return buckets;
  }, [devWorkSessions]);


  const priorityAnalytics = useMemo(() => {
    const total = Math.max(1, tasks.length);
    return [
      { label: "Magas · 80+", value: tasks.filter((task) => task.priority >= 80).length, total, tone: "danger" as const },
      { label: "Közepes · 50–79", value: tasks.filter((task) => task.priority >= 50 && task.priority < 80).length, total, tone: "warning" as const },
      { label: "Normál · 0–49", value: tasks.filter((task) => task.priority < 50).length, total, tone: "info" as const },
    ];
  }, [tasks]);

  const sessionAnalytics = useMemo(() => {
    const total = Math.max(1, sessions.length);
    return [
      { label: "READY handshake", value: sessions.filter((session) => session.status === "active" && session.handshakeStage === "READY").length, total, tone: "ok" as const },
      { label: "Aktív / nyitott", value: sessions.filter((session) => ["open", "active"].includes(session.status)).length, total, tone: "info" as const },
      { label: "Blokkolt / stale", value: sessions.filter((session) => session.status === "blocked").length + staleCount, total: Math.max(total, staleCount), tone: "danger" as const },
      { label: "Lezárt", value: sessions.filter((session) => session.status === "closed").length, total, tone: "default" as const },
    ];
  }, [sessions, staleCount]);

  const environmentAnalytics = useMemo(() => {
    const environments = state?.environments || [];
    const total = Math.max(1, environments.length);
    return [
      { label: "Online / ready", value: environments.filter((item) => ["online", "ready"].includes((item.status || "").toLowerCase())).length, total, tone: "ok" as const },
      { label: "Maintenance", value: environments.filter((item) => (item.status || "").toLowerCase() === "maintenance").length, total, tone: "warning" as const },
      { label: "Offline / quarantine", value: environments.filter((item) => ["offline", "quarantine"].includes((item.status || "").toLowerCase())).length, total, tone: "danger" as const },
    ];
  }, [state?.environments]);

  const environmentPolicyAnalytics = useMemo(() => {
    const environments = state?.environments || [];
    const total = Math.max(1, environments.length);
    return [
      { label: "WRITE", value: environments.filter((item) => item.read_only === false).length, total, tone: "info" as const, hint: "engedélyezett írás" },
      { label: "READ ONLY", value: environments.filter((item) => item.read_only === true).length, total, tone: "warning" as const, hint: "védett célkörnyezet" },
    ];
  }, [state?.environments]);

  const backupAnalytics = useMemo(() => {
    const backups = state?.backups || [];
    const total = Math.max(1, backups.length);
    return [
      { label: "Sikeres", value: backups.filter((item) => (item.status || "").toLowerCase() === "passed").length, total, tone: "ok" as const },
      { label: "Fut", value: backups.filter((item) => (item.status || "").toLowerCase() === "running").length, total, tone: "info" as const },
      { label: "Hibás", value: backups.filter((item) => (item.status || "").toLowerCase() === "failed").length, total, tone: "danger" as const },
    ];
  }, [state?.backups]);

  const taskRows = useMemo(() => tasks.filter((task) => !normalizedQuery || [task.title, task.status, task.branchName, task.description].filter(Boolean).join(" ").toLocaleLowerCase("hu-HU").includes(normalizedQuery)), [tasks, normalizedQuery]);
  const workerRows = useMemo(() => workers.filter((worker) => !normalizedQuery || [worker.name, worker.code, worker.role, worker.status].join(" ").toLocaleLowerCase("hu-HU").includes(normalizedQuery)), [workers, normalizedQuery]);
  const releaseRows = useMemo(() => [...devVersions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).filter((item) => !normalizedQuery || [item.version, item.moduleName, item.title, item.summary, item.status].join(" ").toLocaleLowerCase("hu-HU").includes(normalizedQuery)), [devVersions, normalizedQuery]);
  const auditRows = useMemo(() => [...devWorkSessions].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).filter((item) => !normalizedQuery || [item.moduleName, item.note, item.source, item.currentCategory].filter(Boolean).join(" ").toLocaleLowerCase("hu-HU").includes(normalizedQuery)), [devWorkSessions, normalizedQuery]);
  const environmentRows = useMemo(() => (state?.environments || []).filter((item) => !normalizedQuery || [item.code, item.name, item.status].filter(Boolean).join(" ").toLocaleLowerCase("hu-HU").includes(normalizedQuery)), [state?.environments, normalizedQuery]);

  const teamRows = useMemo(() => [
    { id: "benjadmin", code: "BENJADMIN", name: "BenjAdmin", type: "EMBERI FŐIRÁNYÍTÓ", role: "Rendszertulajdonos / végső döntés", slot: "Irányító", status: "active" },
    { id: "benai", code: "BENAI", name: "BenAI", type: "FEJLESZTÉSIRÁNYÍTÓ AI", role: "Task-, worker-, branch-, worktree- és scope-kiosztás", slot: "Koordinátor", status: gate?.ready ? "ready" : "active" },
    ...workers.map((worker) => ({
      id: worker.id,
      code: worker.code,
      name: worker.name,
      type: worker.code === "OUTMINAI" ? "KÜLSŐ KÓDMÉRNÖK" : "KÓDMÉRNÖK",
      role: worker.code === "OUTMINAI" ? "Partner- és külső projektek, alapból korlátozott scope" : worker.role,
      slot: worker.code,
      status: sessions.find((session) => session.workerId === worker.id && session.status !== "closed")?.status || worker.status,
    })),
  ].filter((item) => !normalizedQuery || [item.name, item.type, item.role, item.slot, item.status].join(" " ).toLocaleLowerCase("hu-HU").includes(normalizedQuery)), [gate?.ready, normalizedQuery, workers, sessions]);

  const pageData = view === "tasks" ? paginate(taskRows, page)
    : view === "team" ? paginate(teamRows, page)
      : view === "workers" ? paginate(workerRows, page)
      : view === "environments" ? paginate(environmentRows, page)
        : view === "release" ? paginate(releaseRows, page)
          : view === "audit" ? paginate(auditRows, page)
            : paginate(activeTasks, page);

  function projectName(projectId?: string | null) {
    return devProjects.find((project) => project.id === projectId)?.name || projectId || "—";
  }

  function workerName(workerId?: string | null) {
    return workers.find((worker) => worker.id === workerId)?.name || "—";
  }

  function sessionForWorker(workerId: string) {
    return sessions.find((session) => session.workerId === workerId && session.status !== "closed");
  }

  return (
    <section id="admin-entry-selector" className="operator-console operator-compact">
      <header className="operator-compact-header">
        <div>
          <div className="operator-command-kicker"><Sparkles size={14} /> BENJADMIN · OPERATOR UI 2.0</div>
          <h1>Fejlesztési és üzemeltetési vezérlőpult</h1>
          <p>Táblázatos, lapozható munkatér a párhuzamos fejlesztések, worker-ek és környezetek áttekintéséhez.</p>
        </div>
        <div className="operator-compact-header__right">
          <span className={`operator-live-pill ${gate?.ready ? "is-ok" : "is-danger"}`}><span /> Engine {gate?.ready ? "READY" : "CHECK"}</span>
          <span className="operator-live-pill is-ok"><span /> ÉLŐ · 5 MP</span>
          <span className="operator-live-pill is-ok"><span /> DEV CANONICAL</span>
          <button type="button" className="operator-icon-action" onClick={() => void load(false)} disabled={busy} title="Frissítés"><RefreshCw size={18} className={busy ? "is-spinning" : ""} /></button>
        </div>
      </header>

      {error ? <div className="operator-alert is-danger"><CircleAlert size={16} /> {error}</div> : null}

      <section className="operator-compact-stats" aria-label="Rendszerösszesítő">
        <div><Bot size={18} /><span>READY worker</span><strong>{readySessions.length}/3</strong></div>
        <div><ListTodo size={18} /><span>Aktív task</span><strong>{activeTasks.length}</strong></div>
        <div><LockKeyhole size={18} /><span>Scope / lease</span><strong>{state?.locks.length || state?.worktreeLeases.length || 0}</strong></div>
        <div className={openConflicts.length ? "is-warning" : ""}><CircleAlert size={18} /><span>Konfliktus</span><strong>{openConflicts.length}</strong></div>
        <div><Database size={18} /><span>Környezet</span><strong>{state?.environments.length || 0}</strong></div>
        <div className={staleCount ? "is-warning" : ""}><Clock3 size={18} /><span>Stale session</span><strong>{staleCount}</strong></div>
      </section>

      <div className="operator-compact-toolbar">
        <nav className="operator-view-tabs" aria-label="Operator nézetek">
          {views.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" className={view === item.id ? "is-active" : ""} onClick={() => setView(item.id)}><Icon size={15} /> {item.label}</button>;
          })}
        </nav>
        <label className="operator-table-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés az aktuális nézetben" /></label>
      </div>

      <section className="operator-table-stage">
        {view === "overview" ? (
          <div className="operator-v3-overview">
            <div className="benj-v3-analytics-grid" aria-label="BENJADMIN analitikai összkép">
              <BenjadminBarChart
                title="Task állapot"
                subtitle={`${tasks.length} összes task`}
                items={taskAnalytics}
              />
              <BenjadminBarChart
                title="Worker terhelés"
                subtitle={`${readySessions.length}/3 READY session`}
                items={workerAnalytics}
              />
              <BenjadminSparklineCard
                title="Fejlesztési aktivitás"
                subtitle="utolsó 7 nap"
                value={activityTrend.reduce((sum, value) => sum + value, 0)}
                valueLabel="perc"
                points={activityTrend}
              />
            </div>
            <div className="operator-overview-grid">
            <div className="operator-table-card">
              <div className="operator-table-title"><div><span>AKTÍV FEJLESZTÉSEK</span><h2>Task queue</h2></div><Link href="/admin/dev"><TerminalSquare size={14} /> Fejlesztési Központ</Link></div>
              <div className="operator-table-wrap">
                <table className="operator-data-table">
                  <thead><tr><th>Prioritás</th><th>Feladat</th><th>Worker</th><th>Állapot</th><th className="hide-small">Branch</th><th className="hide-medium">Frissítve</th></tr></thead>
                  <tbody>
                    {(pageData.items as DevEngineTask[]).map((task) => <tr key={task.id}><td><span className={`operator-priority-pill ${task.priority >= 80 ? "is-high" : task.priority >= 50 ? "is-medium" : ""}`}>{task.priority}</span></td><td><strong>{task.title}</strong><small>{projectName(task.projectId)}</small></td><td>{workerName(task.assignedWorkerId)}</td><td><span className={`operator-status-badge ${statusTone(task.status)}`}>{statusLabel(task.status)}</span></td><td className="hide-small"><code>{task.branchName || "—"}</code></td><td className="hide-medium">{formatDateTime(task.updatedAt)}</td></tr>)}
                    {!pageData.items.length ? <tr><td colSpan={6} className="operator-table-empty">Nincs aktív task.</td></tr> : null}
                  </tbody>
                </table>
              </div>
              <Pagination page={pageData.safePage} pageCount={pageData.pageCount} total={activeTasks.length} onPage={setPage} />
            </div>

            <aside className="operator-overview-side">
              <div className="operator-mini-table-card">
                <div className="operator-table-title"><div><span>WORKER-EK</span><h2>BenAI kiosztás</h2></div></div>
                {workers.map((worker) => {
                  const session = sessionForWorker(worker.id);
                  return <div className="operator-worker-line" key={worker.id}><span className={`operator-status-dot ${statusTone(session?.status || worker.status)}`} /><Image className="operator-worker-avatar" src={workerAvatarSrc(worker.code)} alt="" aria-hidden="true" width={32} height={32} /><div><strong>{worker.name}</strong><small>{session?.taskId ? tasks.find((task) => task.id === session.taskId)?.title || "Aktív task" : "Szabad"}</small></div><span>{session?.handshakeStage || worker.status.toUpperCase()}</span></div>;
                })}
              </div>
              <div className="operator-mini-table-card">
                <div className="operator-table-title"><div><span>KÖRNYEZETEK</span><h2>Release útvonal</h2></div></div>
                {(state?.environments || []).map((environment) => <div className="operator-environment-line" key={environment.id || environment.code}><span className={`operator-status-dot ${statusTone(environment.status)}`} /><strong>{environment.code}</strong><span>{statusLabel(environment.status)}</span><small>{environment.read_only ? "READ ONLY" : "WRITE"}</small></div>)}
              </div>
              <div className={`operator-compact-warning ${openConflicts.length ? "is-warning" : "is-ok"}`}>{openConflicts.length ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}<div><strong>{openConflicts.length ? `${openConflicts.length} nyitott konfliktus` : "Nincs nyitott konfliktus"}</strong><span>{openConflicts[0]?.summary || "Scope és worktree állapot tiszta."}</span></div></div>
            </aside>
            </div>
          </div>
        ) : null}

        {view === "tasks" ? (
          <div className="operator-v3-view-stack">
            <div className="benj-v3-analytics-grid is-compact" aria-label="Task analitika">
              <BenjadminBarChart title="Task státusz" subtitle={`${tasks.length} összes`} items={taskAnalytics} />
              <BenjadminBarChart title="Prioritási megoszlás" subtitle="queue súly" items={priorityAnalytics} />
              <BenjadminBarChart title="Worker terhelés" subtitle="aktív task / worker" items={workerAnalytics} />
            </div>
            <div className="operator-table-card is-full">
              <div className="operator-table-title"><div><span>TASK QUEUE</span><h2>Fejlesztési feladatok</h2></div><span>{taskRows.length} rekord</span></div>
              <div className="operator-table-wrap"><table className="operator-data-table"><thead><tr><th>#</th><th>Feladat</th><th>Projekt</th><th>Worker</th><th>Állapot</th><th className="hide-small">Branch / worktree</th><th className="hide-medium">Scope</th><th>Frissítve</th></tr></thead><tbody>
                {(pageData.items as DevEngineTask[]).map((task) => <tr key={task.id}><td><span className={`operator-priority-pill ${task.priority >= 80 ? "is-high" : task.priority >= 50 ? "is-medium" : ""}`}>{task.priority}</span></td><td><strong>{task.title}</strong><small>{task.description || task.blockedReason || "—"}</small></td><td>{projectName(task.projectId)}</td><td>{workerName(task.assignedWorkerId)}</td><td><span className={`operator-status-badge ${statusTone(task.status)}`}>{statusLabel(task.status)}</span></td><td className="hide-small"><code>{task.branchName || "—"}</code><small>{compactPath(task.worktreePath)}</small></td><td className="hide-medium">{task.scope.map((scope) => `${scope.type}:${scope.key}`).join(", ") || "—"}</td><td>{formatDateTime(task.updatedAt)}</td></tr>)}
              </tbody></table></div><Pagination page={pageData.safePage} pageCount={pageData.pageCount} total={taskRows.length} onPage={setPage} />
            </div>
          </div>
        ) : null}

        {view === "team" ? (
          <div className="operator-v3-view-stack">
            <div className="benj-v3-analytics-grid is-compact" aria-label="Csapat analitika">
              <BenjadminBarChart title="Worker terhelés" subtitle="3 kódolói slot" items={workerAnalytics} />
              <BenjadminBarChart title="Session readiness" subtitle={`${sessions.length} session`} items={sessionAnalytics} />
              <BenjadminSparklineCard title="Fejlesztési aktivitás" subtitle="utolsó 7 nap" value={activityTrend.reduce((sum, value) => sum + value, 0)} valueLabel="perc" points={activityTrend} />
            </div>
            <div className="operator-table-card is-full">
            <div className="operator-table-title"><div><span>BENJADMIN CSAPAT</span><h2>Irányítók és aktív kódolói slotok</h2></div><span>5 tag · 3 kódolói slot</span></div>
            <div className="operator-table-wrap"><table className="operator-data-table"><thead><tr><th>Tag</th><th>Típus</th><th>Szerepkör</th><th>Slot</th><th>Állapot</th><th className="hide-small">Aktív feladat</th><th className="hide-medium">Session / handshake</th></tr></thead><tbody>
              {(pageData.items as Array<{ id: string; code: string; name: string; type: string; role: string; slot: string; status: string }>).map((member) => {
                const worker = workers.find((item) => item.id === member.id);
                const session = worker ? sessionForWorker(worker.id) : undefined;
                const task = session?.taskId ? tasks.find((item) => item.id === session.taskId) : undefined;
                return <tr key={member.id}>
                  <td><div className="operator-worker-identity"><Image className="operator-worker-avatar" src={teamAvatarSrc(member.id, member.code)} alt="" aria-hidden="true" width={32} height={32} /><div><strong>{member.name}</strong><small>{member.id === "benjadmin" ? "emberi vezérlés" : member.id === "benai" ? "AI koordináció" : "AI végrehajtás"}</small></div></div></td>
                  <td>{member.type}</td>
                  <td><strong>{member.role}</strong></td>
                  <td><code>{member.slot}</code></td>
                  <td><span className={"operator-status-badge " + statusTone(member.status)}>{statusLabel(member.status)}</span></td>
                  <td className="hide-small">{task?.title || (member.id === "benjadmin" ? "Jóváhagyás / irányítás" : member.id === "benai" ? "Kiosztás / felügyelet" : "Szabad")}</td>
                  <td className="hide-medium">{session ? <><strong>{session.handshakeStage}</strong><small>{session.id}</small></> : "—"}</td>
                </tr>;
              })}
            </tbody></table></div>
            <Pagination page={pageData.safePage} pageCount={pageData.pageCount} total={teamRows.length} onPage={setPage} />
            </div>
          </div>
        ) : null}

        {view === "workers" ? (
          <div className="operator-v3-view-stack">
            <div className="benj-v3-analytics-grid is-compact" aria-label="Worker analitika">
              <BenjadminBarChart title="Aktív terhelés" subtitle="task / worker" items={workerAnalytics} />
              <BenjadminBarChart title="Session readiness" subtitle="handshake / stale" items={sessionAnalytics} />
              <BenjadminBarChart title="Task státusz" subtitle="teljes task állomány" items={taskAnalytics} />
            </div>
            <div className="operator-table-card is-full">
            <div className="operator-table-title"><div><span>BENAI WORKER-EK</span><h2>Session és worktree állapot</h2></div><span>{workerRows.length} worker</span></div>
            <div className="operator-table-wrap"><table className="operator-data-table"><thead><tr><th>Worker</th><th>Szerep</th><th>Státusz</th><th>Session</th><th>Task</th><th className="hide-small">Branch</th><th className="hide-medium">Worktree</th><th>Heartbeat</th></tr></thead><tbody>
              {(pageData.items as DevEngineWorker[]).map((worker) => { const session = sessionForWorker(worker.id); const task = session?.taskId ? tasks.find((item) => item.id === session.taskId) : undefined; return <tr key={worker.id}><td><div className="operator-worker-identity"><Image className="operator-worker-avatar" src={workerAvatarSrc(worker.code)} alt="" aria-hidden="true" width={32} height={32} /><div><strong>{worker.name}</strong><small>{worker.code}</small></div></div></td><td>{worker.role}</td><td><span className={`operator-status-badge ${statusTone(session?.status || worker.status)}`}>{statusLabel(session?.status || worker.status)}</span></td><td><strong>{session?.handshakeStage || "—"}</strong><small>{session?.id || "nincs aktív session"}</small></td><td>{task?.title || "Szabad"}</td><td className="hide-small"><code>{session?.branchName || "—"}</code></td><td className="hide-medium"><code>{compactPath(session?.worktreePath)}</code></td><td>{formatDateTime(session?.lastHeartbeatAt)}</td></tr>; })}
            </tbody></table></div><Pagination page={pageData.safePage} pageCount={pageData.pageCount} total={workerRows.length} onPage={setPage} />
            </div>
          </div>
        ) : null}

        {view === "environments" ? (
          <div className="operator-v3-view-stack">
            <div className="benj-v3-analytics-grid is-compact" aria-label="Környezet analitika">
              <BenjadminBarChart title="Environment health" subtitle={`${state?.environments.length || 0} környezet`} items={environmentAnalytics} />
              <BenjadminBarChart title="Írási policy" subtitle="DEV / STAGING / PROD" items={environmentPolicyAnalytics} />
              <BenjadminBarChart title="Backup health" subtitle={`${state?.backups.length || 0} minta`} items={backupAnalytics} />
            </div>
            <div className="operator-table-card is-full">
            <div className="operator-table-title"><div><span>KÖRNYEZETEK</span><h2>DEV / STAGING / PROD</h2></div><Link href="/admin/szerver"><ServerCog size={14} /> Infrastruktúra</Link></div>
            <div className="operator-table-wrap"><table className="operator-data-table"><thead><tr><th>Kód</th><th>Név</th><th>Státusz</th><th>Írás</th><th className="hide-small">Szerep</th><th>Frissítve</th></tr></thead><tbody>
              {(pageData.items as RawEnvironment[]).map((environment) => <tr key={environment.id || environment.code}><td><strong>{environment.code}</strong></td><td>{environment.name}</td><td><span className={`operator-status-badge ${statusTone(environment.status)}`}>{statusLabel(environment.status)}</span></td><td><span className={`operator-status-badge ${environment.read_only ? "is-warning" : "is-ok"}`}>{environment.read_only ? "READ ONLY" : "WRITE ENABLED"}</span></td><td className="hide-small">{environment.kind || "—"}</td><td>{formatDateTime(environment.updated_at)}</td></tr>)}
            </tbody></table></div><Pagination page={pageData.safePage} pageCount={pageData.pageCount} total={environmentRows.length} onPage={setPage} />
            </div>
          </div>
        ) : null}

        {view === "control" ? <BenjadminControlPlanePanel query={query} /> : null}

        {view === "partners" ? <BenjadminPartnerDevelopmentPanel query={query} /> : null}

        {view === "entitlements" ? <BenjadminEntitlementsPanel query={query} /> : null}

        {view === "release" ? (
          <div className="operator-table-card is-full">
            <div className="operator-table-title"><div><span>RELEASE / VERZIÓK</span><h2>Kiadási és fejlesztési állapot</h2></div><Link href="/admin/release-kozpont"><GitBranch size={14} /> Release Központ</Link></div>
            <div className="operator-table-wrap"><table className="operator-data-table"><thead><tr><th>Projekt</th><th>Modul</th><th>Verzió</th><th>Állapot</th><th>Leírás</th><th className="hide-small">Teszt</th><th>Frissítve</th></tr></thead><tbody>
              {(pageData.items as DevVersion[]).map((item) => <tr key={item.id}><td>{projectName(item.projectId)}</td><td><strong>{item.moduleName}</strong></td><td><code>{item.version}</code></td><td><span className={`operator-status-badge ${statusTone(item.status)}`}>{statusLabel(item.status)}</span></td><td><strong>{item.title}</strong><small>{item.summary || "—"}</small></td><td className="hide-small"><small>{item.testSummary || "—"}</small></td><td>{formatDateTime(item.completedAt || item.updatedAt)}</td></tr>)}
            </tbody></table></div><Pagination page={pageData.safePage} pageCount={pageData.pageCount} total={releaseRows.length} onPage={setPage} />
          </div>
        ) : null}

        {view === "audit" ? (
          <div className="operator-table-card is-full">
            <div className="operator-table-title"><div><span>AUDIT / MUNKAMENET</span><h2>Fejlesztési idő és aktivitás</h2></div><Link href="/admin/dimpro-belepesek"><ShieldCheck size={14} /> Belépési audit</Link></div>
            <div className="operator-table-wrap"><table className="operator-data-table"><thead><tr><th>Indulás</th><th>Projekt</th><th>Modul</th><th>Forrás</th><th>Időkategória</th><th>Időtartam</th><th className="hide-small">Megjegyzés</th><th>Állapot</th></tr></thead><tbody>
              {(pageData.items as DevWorkSession[]).map((item) => <tr key={item.id}><td>{formatDateTime(item.startedAt)}</td><td>{projectName(item.projectId)}</td><td><strong>{item.moduleName}</strong></td><td>{item.source}</td><td>{item.currentCategory || "—"}</td><td>{formatDuration(item.durationMinutes)}</td><td className="hide-small"><small>{item.note || "—"}</small></td><td><span className={`operator-status-badge ${item.endedAt ? "is-muted" : "is-active"}`}>{item.endedAt ? "Lezárt" : "Fut"}</span></td></tr>)}
            </tbody></table></div><Pagination page={pageData.safePage} pageCount={pageData.pageCount} total={auditRows.length} onPage={setPage} />
          </div>
        ) : null}
      </section>

      <footer className="operator-compact-footer">
        <div><HardDrive size={14} /> canonical DEV · `integration/prod-v1212-benjadmin-m35`</div>
        <div><Clock3 size={14} /> élő: {formatDateTime(lastLiveAt || state?.updatedAt || orchestration?.checkedAt)}</div>
        <button type="button" onClick={onOpenLicense}><KeyRound size={14} /> Licencadmin</button>
        <button type="button" onClick={onLogout}><LogOut size={14} /> Kijelentkezés</button>
      </footer>
    </section>
  );
}
