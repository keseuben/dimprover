"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Box,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  GitBranch,
  HardDrive,
  KeyRound,
  Layers3,
  ListTodo,
  LockKeyhole,
  LogOut,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  TimerReset,
  Workflow,
} from "lucide-react";
import type {
  DevEngineGateStatus,
  DevEngineTask,
  DevEngineWorker,
  DevEngineWorkerSession,
} from "@/app/lib/dev-center/engine-types";
import type { DevProject, DevVersion, DevWorkSession } from "@/app/lib/dev-center/types";
import DevPortfolioOverview from "./DevPortfolioOverview";

type RawEnvironment = {
  id?: string;
  code?: string;
  name?: string;
  kind?: string;
  status?: string;
  read_only?: boolean;
};

type RawWorktreeLease = {
  id?: string;
  session_id?: string;
  task_id?: string;
  branch_name?: string;
  worktree_path?: string;
  status?: string;
  lease_expires_at?: string;
};

type RawConflict = {
  id?: string;
  conflict_type?: string;
  requester_session_id?: string;
  holder_session_id?: string;
  task_id?: string;
  status?: string;
  summary?: string;
  created_at?: string;
};

type RawBuild = {
  id?: string;
  run_type?: string;
  status?: string;
  build_id?: string;
  git_commit?: string;
  summary?: string;
  created_at?: string;
  finished_at?: string;
};

type RawRelease = {
  id?: string;
  status?: string;
  git_commit?: string;
  build_id?: string;
  created_at?: string;
  released_at?: string;
};

type RawBackup = {
  id?: string;
  provider?: string;
  status?: string;
  snapshot_id?: string;
  started_at?: string;
  finished_at?: string;
  summary?: string;
};

type EngineState = {
  workers: DevEngineWorker[];
  tasks: DevEngineTask[];
  sessions: DevEngineWorkerSession[];
  locks: Array<{ id?: string; session_id?: string; task_id?: string; scope_type?: string; scope_key?: string; status?: string; expires_at?: string }>;
  worktreeLeases: RawWorktreeLease[];
  conflicts: RawConflict[];
  environments: RawEnvironment[];
  builds: RawBuild[];
  releases: RawRelease[];
  backups: RawBackup[];
  updatedAt?: string;
};

type OrchestrationSnapshot = {
  activeWorktreeLeases: RawWorktreeLease[];
  openConflicts: RawConflict[];
  staleSessions: Array<{ id?: string; worker_id?: string; task_id?: string; lease_expires_at?: string }>;
  checkedAt?: string;
};

type Props = {
  onOpenLicense: () => void;
  onLogout: () => void;
  devProjects: DevProject[];
  devVersions: DevVersion[];
  devWorkSessions: DevWorkSession[];
};

const workerOrder = ["ARMINAI", "JAZMINAI", "OUTMINAI"];
const workerShortRole: Record<string, string> = {
  ARMINAI: "Alkalmazás / UI",
  JAZMINAI: "Backend / adatbázis",
  OUTMINAI: "Build / release / infra",
};

function statusTone(status?: string) {
  const normalized = (status || "").toLowerCase();
  if (["ready", "active", "online", "passed", "released", "completed"].includes(normalized)) return "is-ok";
  if (["busy", "running", "in_progress", "testing", "claimed"].includes(normalized)) return "is-active";
  if (["failed", "blocked", "offline", "expired", "cancelled"].includes(normalized)) return "is-danger";
  return "is-muted";
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shortCommit(value?: string | null) {
  return value ? value.slice(0, 8) : "—";
}

function compactPath(value?: string | null) {
  if (!value) return "—";
  const marker = "/worktrees/";
  const index = value.indexOf(marker);
  return index >= 0 ? value.slice(index + marker.length) : value;
}

function taskStatusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "Sorban",
    ready: "Indítható",
    claimed: "Lefoglalva",
    in_progress: "Fejlesztés",
    testing: "Teszt",
    blocked: "Blokkolt",
    completed: "Kész",
    cancelled: "Törölve",
  };
  return labels[status] || status;
}

export default function BenjadminOperatorConsole({
  onOpenLicense,
  onLogout,
  devProjects,
  devVersions,
  devWorkSessions,
}: Props) {
  const [state, setState] = useState<EngineState | null>(null);
  const [gate, setGate] = useState<DevEngineGateStatus | null>(null);
  const [orchestration, setOrchestration] = useState<OrchestrationSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    setBusy(true);
    try {
      const headers = { "x-dimpro-license-admin-key": key };
      const [stateResponse, gateResponse, orchestrationResponse] = await Promise.all([
        fetch("/api/dev/engine/state", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/gate", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/orchestration", { headers, cache: "no-store" }),
      ]);
      const statePayload = await stateResponse.json().catch(() => null) as { state?: EngineState; error?: string } | null;
      const gatePayload = await gateResponse.json().catch(() => null) as { gate?: DevEngineGateStatus; error?: string } | null;
      const orchestrationPayload = await orchestrationResponse.json().catch(() => null) as { orchestration?: OrchestrationSnapshot; error?: string } | null;
      if (!stateResponse.ok || !statePayload?.state) throw new Error(statePayload?.error || "Az engine állapot nem tölthető be.");
      setState(statePayload.state);
      setGate(gatePayload?.gate || null);
      setOrchestration(orchestrationPayload?.orchestration || null);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "A BENJADMIN operátori állapot nem tölthető be.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeTasks = useMemo(
    () => (state?.tasks || []).filter((task) => ["queued", "ready", "claimed", "in_progress", "testing", "blocked"].includes(task.status)),
    [state?.tasks],
  );
  const readySessions = useMemo(
    () => (state?.sessions || []).filter((session) => session.status === "active" && session.handshakeStage === "READY"),
    [state?.sessions],
  );
  const workerCards = useMemo(() => {
    const workers = [...(state?.workers || [])].sort((a, b) => workerOrder.indexOf(a.code) - workerOrder.indexOf(b.code));
    return workers.map((worker) => {
      const session = (state?.sessions || []).find((item) => item.workerId === worker.id && item.status !== "closed");
      const task = session?.taskId ? state?.tasks.find((item) => item.id === session.taskId) : undefined;
      const lease = session ? state?.worktreeLeases.find((item) => item.session_id === session.id && item.status === "active") : undefined;
      return { worker, session, task, lease };
    });
  }, [state]);

  const openConflicts = orchestration?.openConflicts || state?.conflicts.filter((item) => item.status === "open") || [];
  const staleCount = orchestration?.staleSessions.length || 0;
  const latestBuild = state?.builds[0];
  const latestRelease = state?.releases[0];
  const latestBackup = state?.backups[0];
  const inProgressVersions = devVersions.filter((version) => ["in_progress", "testing", "blocked"].includes(version.status));

  return (
    <section id="admin-entry-selector" className="operator-console">
      <div className="operator-command-header">
        <div className="operator-command-header__copy">
          <div className="operator-command-kicker"><Sparkles size={14} /> BENJADMIN · OPERATOR UI 2.0</div>
          <h1>Fejlesztési és üzemeltetési parancsnoki tér</h1>
          <p>BenAI egyetlen nézetben követi a worker-eket, feladatokat, worktree-ket, környezeteket és kiadási kapukat. A veszélyes műveletek továbbra is külön koordinált engedélyezéshez kötöttek.</p>
        </div>
        <div className="operator-command-header__actions">
          <span className={`operator-live-pill ${gate?.schemaReady ? "is-ok" : "is-danger"}`}><span /> PostgreSQL engine {gate?.schemaReady ? "READY" : "CHECK"}</span>
          <button type="button" className="operator-icon-action" onClick={() => void load()} disabled={busy} title="Állapot frissítése">
            <RefreshCw size={18} className={busy ? "is-spinning" : ""} />
          </button>
        </div>
      </div>

      {error ? <div className="operator-alert is-danger"><CircleAlert size={17} /><span>{error}</span></div> : null}
      {staleCount ? <div className="operator-alert is-warning"><TimerReset size={17} /><span>{staleCount} lejárt worker session recoveryt igényel.</span></div> : null}

      <div className="operator-pulse-grid">
        <article className="operator-pulse-card is-primary"><div className="operator-pulse-card__icon"><Bot size={21} /></div><div><span>READY worker</span><strong>{readySessions.length}<small>/ 3</small></strong><p>BenAI kiosztási hálózat</p></div></article>
        <article className="operator-pulse-card"><div className="operator-pulse-card__icon"><ListTodo size={21} /></div><div><span>Aktív task</span><strong>{activeTasks.length}</strong><p>{activeTasks.filter((task) => task.status === "blocked").length} blokkolt</p></div></article>
        <article className="operator-pulse-card"><div className="operator-pulse-card__icon"><LockKeyhole size={21} /></div><div><span>Worktree lease</span><strong>{state?.worktreeLeases.length ?? 0}</strong><p>{state?.locks.length ?? 0} scope lock</p></div></article>
        <article className={`operator-pulse-card ${openConflicts.length ? "is-warning" : ""}`}><div className="operator-pulse-card__icon"><CircleAlert size={21} /></div><div><span>Nyitott konfliktus</span><strong>{openConflicts.length}</strong><p>{staleCount} stale session</p></div></article>
        <article className="operator-pulse-card"><div className="operator-pulse-card__icon"><GitBranch size={21} /></div><div><span>Aktív fejlesztési kör</span><strong>{inProgressVersions.length}</strong><p>{devVersions.length} verzió nyilvántartva</p></div></article>
        <article className="operator-pulse-card"><div className="operator-pulse-card__icon"><HardDrive size={21} /></div><div><span>Backup</span><strong>{latestBackup?.status?.toUpperCase() || "—"}</strong><p>{latestBackup?.snapshot_id || "nincs friss engine rekord"}</p></div></article>
      </div>

      <div className="operator-layout-main">
        <section className="operator-panel operator-ai-command">
          <div className="operator-panel-heading">
            <div><p>AI VEZÉRLÉSI LÁNC</p><h2>BenAI és végrehajtó worker-ek</h2></div>
            <span className={`operator-status-badge ${gate?.ready ? "is-ok" : "is-warning"}`}>{gate?.ready ? "GATE READY" : "GATE CHECK"}</span>
          </div>

          <div className="operator-benai-core">
            <div className="operator-benai-core__mark"><Bot size={28} /></div>
            <div><span>KOORDINÁTOR</span><strong>BenAI</strong><p>Task → worker → branch → worktree → scope → operation gate</p></div>
            <div className="operator-benai-core__signal"><Activity size={18} /><span>LIVE</span></div>
          </div>

          <div className="operator-worker-grid">
            {workerCards.map(({ worker, session, task, lease }) => (
              <article key={worker.id} className={`operator-worker-card ${statusTone(session ? "active" : worker.status)}`}>
                <div className="operator-worker-card__head">
                  <div className="operator-worker-avatar">{worker.name.slice(0, 1)}</div>
                  <div><span>{worker.code}</span><strong>{worker.name}</strong><small>{workerShortRole[worker.code] || worker.role}</small></div>
                  <span className={`operator-status-dot ${statusTone(session ? session.status : worker.status)}`} title={session ? session.status : worker.status} />
                </div>
                <div className="operator-worker-facts">
                  <div><span>Session</span><strong>{session ? session.handshakeStage : "NINCS"}</strong></div>
                  <div><span>Task</span><strong>{task?.title || "Szabad"}</strong></div>
                  <div><span>Branch</span><strong>{session?.branchName || "—"}</strong></div>
                  <div><span>Worktree</span><strong title={lease?.worktree_path}>{compactPath(lease?.worktree_path)}</strong></div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="operator-panel operator-environments">
          <div className="operator-panel-heading"><div><p>KÖRNYEZETEK</p><h2>Release útvonal</h2></div><Link href="/admin/release-kozpont">Részletek <ArrowUpRight size={14} /></Link></div>
          <div className="operator-environment-stack">
            {(state?.environments || []).map((environment) => (
              <article key={environment.id || environment.code} className={`operator-environment-card ${environment.code?.toLowerCase() || ""}`}>
                <div><span className={`operator-status-dot ${statusTone(environment.status)}`} /><strong>{environment.code || environment.name}</strong></div>
                <span>{environment.status || "unknown"}</span>
                <small>{environment.read_only ? "READ ONLY" : "WRITE ENABLED"}</small>
              </article>
            ))}
            {!state?.environments.length ? <div className="operator-empty">A környezeti adatok betöltése folyamatban.</div> : null}
          </div>

          <div className="operator-release-facts">
            <div><Box size={16} /><span>Build</span><strong>{latestBuild?.status || "—"}</strong><small>{latestBuild?.build_id || latestBuild?.run_type || "nincs rekord"}</small></div>
            <div><Workflow size={16} /><span>Release</span><strong>{latestRelease?.status || "—"}</strong><small>{shortCommit(latestRelease?.git_commit)}</small></div>
            <div><Database size={16} /><span>Backup</span><strong>{latestBackup?.status || "—"}</strong><small>{latestBackup?.snapshot_id || "—"}</small></div>
          </div>
        </section>
      </div>

      <div className="operator-layout-secondary">
        <section className="operator-panel operator-task-panel">
          <div className="operator-panel-heading">
            <div><p>TASK QUEUE</p><h2>Fejlesztési feladatok</h2></div>
            <Link href="/admin/dev">Fejlesztési Központ <ArrowUpRight size={14} /></Link>
          </div>
          <div className="operator-task-list">
            {activeTasks.slice(0, 8).map((task) => {
              const worker = state?.workers.find((item) => item.id === task.assignedWorkerId);
              return (
                <article key={task.id} className="operator-task-row">
                  <span className={`operator-task-priority ${task.priority >= 80 ? "is-high" : task.priority >= 50 ? "is-medium" : ""}`}>{task.priority}</span>
                  <div className="operator-task-row__copy"><strong>{task.title}</strong><span>{worker?.name || "Nincs worker"} · {task.branchName || "branch kiosztásra vár"}</span></div>
                  <span className={`operator-status-badge ${statusTone(task.status)}`}>{taskStatusLabel(task.status)}</span>
                </article>
              );
            })}
            {!activeTasks.length ? <div className="operator-empty"><CheckCircle2 size={18} /> Nincs aktív task a queue-ban.</div> : null}
          </div>
        </section>

        <section className="operator-panel operator-lock-panel">
          <div className="operator-panel-heading"><div><p>WORKTREE / SCOPE</p><h2>Ütközésvédelem</h2></div><span>{state?.worktreeLeases.length ?? 0} lease</span></div>
          <div className="operator-lock-list">
            {(state?.worktreeLeases || []).slice(0, 6).map((lease) => {
              const session = state?.sessions.find((item) => item.id === lease.session_id);
              const worker = state?.workers.find((item) => item.id === session?.workerId);
              return (
                <article key={lease.id} className="operator-lock-row">
                  <GitBranch size={16} />
                  <div><strong>{lease.branch_name || "—"}</strong><span>{worker?.name || "Worker"} · {compactPath(lease.worktree_path)}</span></div>
                  <small>{formatDateTime(lease.lease_expires_at)}</small>
                </article>
              );
            })}
            {!state?.worktreeLeases.length ? <div className="operator-empty">Nincs aktív worktree lease.</div> : null}
          </div>
          {openConflicts.length ? (
            <div className="operator-conflict-strip">
              <CircleAlert size={16} />
              <div><strong>{openConflicts.length} nyitott konfliktus</strong><span>{openConflicts[0]?.summary || "Felülvizsgálat szükséges."}</span></div>
            </div>
          ) : (
            <div className="operator-conflict-strip is-clear"><ShieldCheck size={16} /><div><strong>Nincs nyitott konfliktus</strong><span>Scope és worktree foglalások tiszták.</span></div></div>
          )}
        </section>
      </div>

      <section className="operator-panel operator-quick-panel">
        <div className="operator-panel-heading"><div><p>GYORS ELÉRÉS</p><h2>Operátori eszközök</h2></div><span>külön modulok · közös vezérlés</span></div>
        <div className="operator-quick-grid">
          <Link href="/admin/dev"><TerminalSquare size={19} /><span><strong>Fejlesztési Központ</strong><small>Verziók, idő, task engine</small></span><ArrowUpRight size={15} /></Link>
          <Link href="/admin/szerver"><ServerCog size={19} /><span><strong>Infrastruktúra</strong><small>VPS és szolgáltatásállapot</small></span><ArrowUpRight size={15} /></Link>
          <Link href="/admin/release-kozpont"><GitBranch size={19} /><span><strong>Release Központ</strong><small>DEV → STAGING → PROD</small></span><ArrowUpRight size={15} /></Link>
          <button type="button" onClick={onOpenLicense}><KeyRound size={19} /><span><strong>Licencközpont</strong><small>Licencek és jogosultságok</small></span><ArrowUpRight size={15} /></button>
          <Link href="/drive/drop"><HardDrive size={19} /><span><strong>DIMPRO Drop</strong><small>Csomagok és hozzáférések</small></span><ArrowUpRight size={15} /></Link>
          <Link href="/admin/dev/rendszerstruktura"><Layers3 size={19} /><span><strong>Rendszerstruktúra</strong><small>DIMPRO modul- és szolgáltatástérkép</small></span><ArrowUpRight size={15} /></Link>
        </div>
      </section>

      <section className="operator-panel operator-portfolio-panel">
        <DevPortfolioOverview projects={devProjects} versions={devVersions} workSessions={devWorkSessions} compact showHeading={false} />
      </section>

      <footer className="operator-footer">
        <div><Boxes size={15} /><span>Canonical DEV · integration/prod-v1212-benjadmin-m35</span></div>
        <div><Clock3 size={15} /><span>Frissítve: {formatDateTime(state?.updatedAt || orchestration?.checkedAt)}</span></div>
        <button type="button" onClick={onLogout}><LogOut size={15} /> Kijelentkezés</button>
      </footer>
    </section>
  );
}
