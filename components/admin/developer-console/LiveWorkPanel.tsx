"use client";

import { AlertTriangle, ArrowRightLeft, BellRing, CheckCircle2, ClipboardCopy, Clock3, Code2, FlaskConical, GitCommitHorizontal, Hammer, History, Inbox, ListChecks, Play, Radio, ShieldCheck, UserRoundCog, XCircle } from "lucide-react";
import { useEffect } from "react";
import { resolveTaskDevelopmentContext } from "@/app/lib/dev-center/development-context";
import BenjadminAvatar from "./BenjadminAvatar";
import DevelopmentSchedulerPanel from "./DevelopmentSchedulerPanel";
import type { ConsoleAuthor, ConsoleLiveState, LiveTask, RuntimeContext } from "./types";
import TerminalHubCard from "./TerminalHubCard";
import styles from "./DeveloperConsole.module.css";

type WorkerCode = "ARMINAI" | "JAZMINAI" | "OUTMINAI";

const workers: Array<{ code: WorkerCode; author: ConsoleAuthor; fallbackName: string }> = [
  { code: "ARMINAI", author: "ARMINAI", fallbackName: "Ármin-AI" },
  { code: "JAZMINAI", author: "JAZMINAI", fallbackName: "Jázmin-AI" },
  { code: "OUTMINAI", author: "OUTMINAI", fallbackName: "Outmin-AI" },
];

function elapsed(now: number, value?: string | null) {
  if (!value) return "—";
  const start = new Date(value).getTime();
  if (!Number.isFinite(start)) return "—";
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}


function workerStatus(task: LiveTask | null, presence: ConsoleLiveState["workerPresence"][number] | null) {
  if (task?.status === "blocked") return { status: "blocked" as const, label: "BLOKKOLVA" };
  if (presence?.active) return { status: "working" as const, label: task ? "DOLGOZIK" : "DOLGOZIK · AUTO" };
  if (!task) return { status: "idle" as const, label: "INAKTÍV" };
  if (["queued", "ready"].includes(task.status)) return { status: "waiting" as const, label: "VÁRAKOZIK" };
  return { status: "working" as const, label: "DOLGOZIK" };
}

function presenceStage(phase: string) {
  const value = phase.toLowerCase();
  if (["analysis", "planning", "prepare", "preparation", "discovery"].includes(value)) return { index: 1, label: "ELEMZÉS / ELŐKÉSZÍTÉS" };
  if (["test", "testing"].includes(value)) return { index: 3, label: "TESZTELÉS" };
  if (["review", "fix", "verification"].includes(value)) return { index: 4, label: "ELLENŐRZÉS / JAVÍTÁS" };
  if (["build", "commit", "release"].includes(value)) return { index: 5, label: "BUILD / KIADÁS" };
  if (["complete", "completed", "close", "closing", "handoff"].includes(value)) return { index: 6, label: "LEZÁRÁS / ÁTADÁS" };
  return { index: 2, label: "FEJLESZTÉS" };
}

function PresenceContext({ presence }: { presence: ConsoleLiveState["workerPresence"][number] }) {
  const stage = presenceStage(presence.phase);
  return <div className={styles.workerContextCompact} data-context-location="worker" data-work-stage={stage.index} data-auto-presence="true">
    <span>{presence.mainModule || "Automatikus észlelés"} <b>›</b> {presence.moduleName || presence.phase.toUpperCase()} <b>›</b> {presence.submoduleName || presence.inferredBy}</span>
    <strong>6/{stage.index} · {stage.label}</strong>
    <small>{presence.workItem || presence.summary}</small>
  </div>;
}

function taskOwner(task: LiveTask, live: ConsoleLiveState | null) {
  const id = task.assigned_worker_id || task.requested_worker_id;
  return live?.workers.find((worker) => worker.id === id)?.name || "Nincs felelős";
}

function metadataNumber(task: LiveTask, key: string) {
  const value = Number(task.metadata?.[key]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function metadataText(task: LiveTask, key: string) {
  const value = task.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}


function metadataRecord(task: LiveTask, key: string) {
  const value = task.metadata?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function durationLabel(minutes: number | null) {
  if (!minutes) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} p`;
  return rest ? `${hours} ó ${rest} p` : `${hours} ó`;
}

function finishLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function etaDistanceLabel(now: number, expectedFinishAt: string | null) {
  if (!expectedFinishAt) return { state: "unknown" as const, label: "hátralévő idő: —", minutes: null as number | null };
  const target = new Date(expectedFinishAt).getTime();
  if (!Number.isFinite(target)) return { state: "unknown" as const, label: "hátralévő idő: —", minutes: null as number | null };
  const deltaMinutes = Math.ceil((target - now) / 60000);
  const absoluteMinutes = Math.abs(deltaMinutes);
  const distance = durationLabel(absoluteMinutes || 1);
  if (deltaMinutes < 0) return { state: "overdue" as const, label: `késés ${distance}`, minutes: deltaMinutes };
  if (deltaMinutes <= 15) return { state: "due-soon" as const, label: `még ${distance}`, minutes: deltaMinutes };
  return { state: "on-track" as const, label: `még ${distance}`, minutes: deltaMinutes };
}

function estimateRangeLabel(minMinutes: number | null, maxMinutes: number | null) {
  if (!minMinutes && !maxMinutes) return "becslési tartomány: —";
  if (minMinutes && maxMinutes && minMinutes !== maxMinutes) return `becslés ${durationLabel(minMinutes)}–${durationLabel(maxMinutes)}`;
  return `becslés ${durationLabel(minMinutes || maxMinutes)}`;
}

function liveTaskContext(task: LiveTask) {
  return resolveTaskDevelopmentContext({
    projectId: task.project_id || null,
    title: task.title,
    description: task.description || null,
    status: task.status,
    scope: task.scope,
    metadata: task.metadata || {},
  });
}

function CompactTaskContext({ task, location }: { task: LiveTask; location: "worker" | "inbox" }) {
  const context = liveTaskContext(task);
  return <div className={location === "worker" ? styles.workerContextCompact : styles.inboxContextCompact} data-context-location={location} data-work-stage={context.workStageIndex}>
    <span>{context.mainModule} <b>›</b> {context.moduleName} <b>›</b> {context.submoduleName}</span>
    <strong>6/{context.workStageIndex} · {context.workStageLabel}</strong>
    <small>{context.workItem}</small>
  </div>;
}

export default function LiveWorkPanel({ live, now, context, selectedProjectId, focusedTaskId, busyTaskId, onTaskAction, onOpenTerminalHub, onOpenWorkerActivity }: {
  live: ConsoleLiveState | null;
  now: number;
  context: RuntimeContext | null;
  selectedProjectId: string;
  focusedTaskId: string;
  busyTaskId: string | null;
  onTaskAction: (taskId: string, action: "ROUTE" | "ACCEPT_SUGGESTION" | "ESTIMATE" | "START" | "HANDOFF" | "RUNNING" | "RESULT_PENDING" | "RESULT_REPORT" | "TESTING" | "COMPLETE" | "FAIL", payload?: { workerCode?: string; estimateMinutes?: number; note?: string; summary?: string; commit?: string; buildId?: string; tests?: string; docs?: string; nextStep?: string }) => Promise<void>;
  onOpenTerminalHub: () => void;
  onOpenWorkerActivity: (code: WorkerCode) => void;
}) {
  const tasks = live?.tasks || [];
  const sessions = live?.sessions || [];
  const builds = live?.builds || [];
  const pendingApprovals = (live?.approvals || []).filter((item) => item.status === "pending");
  const genericQueue = tasks.filter((task) => !task.requested_worker_id && !task.assigned_worker_id && ["queued", "ready"].includes(task.status));
  const activeSessionTaskIds = new Set(sessions.filter((session) => session.status !== "closed" && session.task_id).map((session) => session.task_id as string));
  const projectTasks = tasks
    .filter((task) => (!selectedProjectId || task.project_id === selectedProjectId)
      && (task.id === focusedTaskId || ["queued", "ready", "blocked"].includes(task.status) || activeSessionTaskIds.has(task.id)))
    .sort((a, b) => Number(b.id === focusedTaskId) - Number(a.id === focusedTaskId) || Number(b.priority || 0) - Number(a.priority || 0) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
    .slice(0, 8);
  useEffect(() => {
    if (!focusedTaskId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`benjadmin-task-${focusedTaskId}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedTaskId, selectedProjectId]);

  const inboxTasks = tasks
    .filter((task) => (!selectedProjectId || task.project_id === selectedProjectId)
      && Boolean(task.requested_worker_id || task.assigned_worker_id)
      && !["completed", "cancelled"].includes(task.status))
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));

  async function copyHandoffAndMark(task: LiveTask) {
    const prompt = metadataText(task, "handoffPrompt");
    if (!prompt) {
      window.alert("Ehhez a taskhoz még nincs elkészített ChatGPT/MCP átadó prompt. Indítsd újra a routingot vagy a feladatot V1.1 alatt.");
      return;
    }
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      window.prompt("Másold ki a ChatGPT/MCP átadó promptot:", prompt);
      return;
    }
    await onTaskAction(task.id, "HANDOFF");
  }

  return (
    <aside className={styles.livePanel} aria-label="Élő fejlesztési munka">
      <header><Code2 size={17} /><div><span>ÉLŐ MUNKA</span><strong>Worker / task / build</strong></div></header>
      <section className={styles.benAiCoordinator}>
        <BenjadminAvatar member="BENAI" size="task" status={genericQueue.length ? "waiting" : "idle"} eager />
        <div><strong>Ben-AI</strong><span>KOORDINÁTOR · {context?.aiBridge?.mode === "OPENAI_RESPONSES" ? "API HÍD" : "KÉZI CHATGPT HÍD"}</span><p>{genericQueue.length ? `${genericQueue.length} kiosztásra váró általános task` : context?.aiBridge?.executorConfigured ? "A végrehajtó híd konfigurálva." : "Natív worker executor még nincs bekötve."}</p></div>
      </section>
      <DevelopmentSchedulerPanel selectedProjectId={selectedProjectId} />
      <div className={styles.workerCards}>
        {workers.map((item) => {
          const worker = live?.workers.find((candidate) => candidate.code === item.code);
          const session = sessions.find((candidate) => candidate.worker_id === worker?.id && candidate.status !== "closed");
          const task = session?.task_id
            ? tasks.find((candidate) => candidate.id === session.task_id) || null
            : tasks.find((candidate) => (candidate.assigned_worker_id === worker?.id || candidate.requested_worker_id === worker?.id) && ["queued", "ready", "blocked"].includes(candidate.status)) || null;
          const build = builds.find((candidate) => candidate.task_id === task?.id || (session?.id && candidate.session_id === session.id));
          const presence = live?.workerPresence?.find((candidate) => candidate.workerCode === item.code && candidate.active) || null;
          const presenceHistory = (live?.workerPresenceHistory || []).filter((candidate) => candidate.workerCode === item.code).slice(0, 8);
          const latestPresence = presenceHistory[0] || null;
          const transitions = (live?.workerTransitions || []).filter((candidate) => candidate.fromWorkerCode === item.code || candidate.toWorkerCode === item.code).slice(0, 8);
          const state = workerStatus(task, presence);
          return (
            <article key={item.code} data-worker-code={item.code} data-auto-presence={presence && !task ? "true" : "false"} className={`${styles.workerCard} ${state.status === "blocked" ? styles.workerBlocked : ""}`}>
              <div className={styles.workerHead}><BenjadminAvatar member={item.author} size="task" status={state.status} eager /><div><strong>{worker?.name || item.fallbackName}</strong><span>{state.label} {session ? `· ${elapsed(now, session.opened_at)}` : presence?.lastSeenAt ? `· ${elapsed(now, presence.lastSeenAt)}` : ""}</span></div></div>
              <p>{task?.title || presence?.summary || "Nincs aktív feladat."}</p>
              {task ? <CompactTaskContext task={task} location="worker" /> : presence ? <PresenceContext presence={presence} /> : null}
              <div className={styles.workerFacts}>
                <span><Clock3 size={13} /> {session?.handshake_stage || (presence ? `AUTO · ${presence.phase.toUpperCase()}` : "Nincs aktív session")}</span>
                <span><Hammer size={13} /> {build ? (build.run_type || "build") + ": " + build.status : presence?.operation ? `${presence.operation}: aktív` : "Build: nincs"}</span>
                <span><GitCommitHorizontal size={13} /> {build?.git_commit ? build.git_commit.slice(0, 10) : task?.branch_name || presence?.branch || presence?.inferredBy || "Git: —"}</span>
              </div>
              <div className={styles.workerLifecycleFacts} data-presence-history-count={presenceHistory.length} data-worker-transition-count={transitions.length}>
                <span><History size={11} /> {presenceHistory.length} presence esemény</span>
                <span><ArrowRightLeft size={11} /> {transitions.length} worker-átadás</span>
                {latestPresence ? <span data-lifecycle-state={latestPresence.lifecycleState}>{latestPresence.lifecycleState}{latestPresence.endReason ? ` · ${latestPresence.endReason}` : ""}</span> : null}
              </div>
              <button type="button" className={styles.workerActivityOpen} data-worker-activity-open={item.code} onClick={() => onOpenWorkerActivity(item.code)}><Code2 size={12} /> Részletes kódolási csevegés</button>
            </article>
          );
        })}
      </div>
      <section className={styles.aiWorkerInbox} aria-label="Worker Inbox" data-testid="benjadmin-worker-inbox">
        <div className={styles.railSectionTitle}><Inbox size={14} /> WORKER INBOX</div>
        <div className={styles.aiWorkerInboxGrid}>
          {workers.map((item) => {
            const worker = live?.workers.find((candidate) => candidate.code === item.code);
            const owned = worker ? inboxTasks.filter((task) => task.requested_worker_id === worker.id || task.assigned_worker_id === worker.id) : [];
            return <article key={`inbox-${item.code}`} data-worker-code={item.code}>
              <header><BenjadminAvatar member={item.author} size="chat" status={owned.length ? "waiting" : "idle"} /><div><strong>{worker?.name || item.fallbackName}</strong><span>{owned.length} nyitott task</span></div></header>
              <div>
                {owned.slice(0, 3).map((task) => <div key={task.id} className={styles.aiWorkerInboxTask} data-task-id={task.id}>
                  <div><span>{task.title}</span><small>{metadataText(task, "bridgeState") || metadataText(task, "workflowState") || task.status.toUpperCase()}</small></div>
                  <CompactTaskContext task={task} location="inbox" />
                </div>)}
                {!owned.length ? <p><span>Nincs várakozó feladat.</span><small>INBOX ÜRES</small></p> : null}
              </div>
            </article>;
          })}
        </div>
      </section>
      <section className={styles.aiDeveloperSpace}>
        <div className={styles.railSectionTitle}><UserRoundCog size={14} /> AI FEJLESZTŐI TÉR</div>
        <div className={styles.aiDeveloperSpaceLegend}><span>ownership</span><span>routing</span><span>indítás</span><span>ETA</span><span><BellRing size={11} /> értesítés</span></div>
        <div className={styles.aiDeveloperTaskList}>
          {projectTasks.map((task) => {
            const estimate = metadataNumber(task, "estimateMinutes");
            const estimateMin = metadataNumber(task, "estimateMinMinutes");
            const estimateMax = metadataNumber(task, "estimateMaxMinutes");
            const expectedFinishAt = metadataText(task, "expectedFinishAt");
            const etaDistance = etaDistanceLabel(now, expectedFinishAt);
            const started = ["claimed", "in_progress", "testing"].includes(task.status);
            const routed = Boolean(task.requested_worker_id || task.assigned_worker_id);
            const bridgeState = metadataText(task, "bridgeState") || (started ? "WAITING_HANDOFF" : null);
            const handoffSanitized = task.metadata?.handoffSanitized === true;
            const bridgeResult = metadataRecord(task, "bridgeResult");
            const resultHistory = Array.isArray(task.metadata?.bridgeResultHistory) ? task.metadata.bridgeResultHistory.length : 0;
            const suggestedWorker = metadataRecord(task, "coordinatorSuggestedWorker");
            const preferenceState = metadataText(task, "coordinatorPreferenceState");
            const plusPulledAt = metadataText(task, "plusBridgePulledAt");
            const plusWorkerName = metadataText(task, "plusBridgeWorkerName");
            const plusSessionId = metadataText(task, "plusBridgeSessionId");
            const plusPullCount = metadataNumber(task, "plusBridgePullCount");
            const chainState = metadataText(task, "coordinatorChainState");
            const chainPreparedAt = metadataText(task, "coordinatorChainPreparedAt");
            const chainWorkerName = metadataText(task, "coordinatorChainWorkerName");
            const busy = busyTaskId === task.id;
            const focused = task.id === focusedTaskId;
            return (
              <article id={`benjadmin-task-${task.id}`} key={task.id} data-status={task.status} data-task-id={task.id} data-focused={focused ? "true" : "false"} data-bridge-state={bridgeState || "ROUTING"} data-plus-pulled-at={plusPulledAt || ""}>
                <header><div><strong>{task.title}</strong><span>{taskOwner(task, live)} · {task.status.toUpperCase()}</span></div><b>{durationLabel(estimate)}</b></header>
                <div className={styles.aiDeveloperTaskFacts}>
                  {focused ? <span className={styles.aiTaskFocusBadge} data-testid="benjadmin-task-focus"><BellRing size={10} /> Értesítésből megnyitva</span> : null}
                  <span><Clock3 size={11} /> ETA {expectedFinishAt ? finishLabel(expectedFinishAt) : "indítás után"}</span>
                  <span className={styles.aiEtaLive} data-eta-state={etaDistance.state} data-testid="benjadmin-live-eta">{etaDistance.label}</span>
                  <span className={styles.aiEtaRange}>{estimateRangeLabel(estimateMin, estimateMax)}</span>
                  <span>{metadataText(task, "executionGate") || metadataText(task, "workflowState") || "QUEUE"}</span>
                  <span className={styles.aiBridgeState}><Radio size={10} /> {bridgeState || "ROUTING"}</span>
                </div>
                {chainState === "READY_FOR_PLUS_PULL" && chainPreparedAt && !plusPulledAt ? <div className={styles.aiNextTaskState} data-testid="benjadmin-next-task-state"><strong><ListChecks size={11} /> ChatGPT pullra kész</strong><span>{finishLabel(chainPreparedAt)}</span>{chainWorkerName ? <span>{chainWorkerName}</span> : null}<small>Folytasd. → felvétel</small></div> : null}
                {plusPulledAt ? <div className={styles.aiPlusPullState} data-testid="benjadmin-plus-pull-state"><strong><Radio size={11} /> ChatGPT felvette</strong><span>{finishLabel(plusPulledAt)}</span>{plusWorkerName ? <span>{plusWorkerName}</span> : null}{plusSessionId ? <code>{plusSessionId.slice(0, 18)}</code> : null}{plusPullCount && plusPullCount > 1 ? <small>{plusPullCount}. pull</small> : null}</div> : null}
                {handoffSanitized ? <p className={styles.aiDeveloperTaskWarning}>Az átadó prompt érzékeny adatot észlelt és maszkolta. Nyers titkot ne adj át AI-nak.</p> : null}
                {task.blocked_reason ? <p className={styles.aiDeveloperTaskError}>{task.blocked_reason}</p> : null}
                {preferenceState && preferenceState !== "PREFERRED_ACCEPTED" ? <div className={styles.aiCoordinatorSuggestion} data-testid="benjadmin-worker-suggestion"><strong>Ben-AI</strong><span>{preferenceState === "PREFERRED_BUSY" ? "A választott kódoló jelenleg foglalt." : "A választott kódoló most nem választható."}</span>{suggestedWorker?.workerName ? <><small>Javasolt következő kódoló: {String(suggestedWorker.workerName)}</small><button type="button" disabled={busy} onClick={() => void onTaskAction(task.id, "ACCEPT_SUGGESTION")}>Javaslat elfogadása</button></> : <small>Nincs jelenleg szabad és jogosult alternatíva.</small>}</div> : null}
                {bridgeResult ? <div className={styles.aiBridgeResult} data-testid="benjadmin-bridge-result"><strong>CHATGPT EREDMÉNY · V{String(bridgeResult.version || resultHistory || 1)}</strong><p>{String(bridgeResult.summary || "Eredmény rögzítve.")}</p><div>{bridgeResult.commit ? <span>commit {String(bridgeResult.commit).slice(0, 12)}</span> : null}{bridgeResult.buildId ? <span>build {String(bridgeResult.buildId)}</span> : null}{bridgeResult.tests ? <span>teszt: {String(bridgeResult.tests)}</span> : null}{bridgeResult.docs ? <span>docs: {String(bridgeResult.docs)}</span> : null}</div>{bridgeResult.nextStep ? <small>Következő: {String(bridgeResult.nextStep)}</small> : null}</div> : null}
                <div className={styles.aiDeveloperTaskActions}>
                  {!routed ? <span className={styles.aiAutoRouteWaiting}>Ben-AI · automatikus kiosztásra vár</span> : null}
                  {routed && chainState !== "READY_FOR_PLUS_PULL" && ["queued", "ready"].includes(task.status) ? <button type="button" className={styles.aiDeveloperStartButton} disabled={busy} onClick={() => void onTaskAction(task.id, "START")}><Play size={11} /> Indítás</button> : null}
                  {started && bridgeState === "WAITING_HANDOFF" ? <button type="button" className={styles.aiBridgeHandoffButton} data-action="HANDOFF" disabled={busy} onClick={() => void copyHandoffAndMark(task)}><ClipboardCopy size={11} /> Átadó másolása</button> : null}
                  {started && bridgeState === "HANDED_OFF" ? <button type="button" className={styles.aiBridgeRunningButton} data-action="RUNNING" disabled={busy} onClick={() => void onTaskAction(task.id, "RUNNING")}><Radio size={11} /> Chat elindult</button> : null}
                  {started && bridgeState === "RUNNING" ? <button type="button" data-action="RESULT_PENDING" disabled={busy} onClick={() => void onTaskAction(task.id, "RESULT_PENDING")}><CheckCircle2 size={11} /> Eredmény jött</button> : null}
                  {started && bridgeState === "RESULT_PENDING" && task.status !== "testing" ? <button type="button" data-action="TESTING" disabled={busy} onClick={() => void onTaskAction(task.id, "TESTING")}><FlaskConical size={11} /> Teszt</button> : null}
                  {routed && !["completed", "cancelled"].includes(task.status) ? <>
                    <button type="button" disabled={busy || !estimate} title="Becslés -30 perc" onClick={() => void onTaskAction(task.id, "ESTIMATE", { estimateMinutes: Math.max(15, (estimate || 60) - 30) })}>−30p</button>
                    <button type="button" disabled={busy} title="Becslés +30 perc" onClick={() => void onTaskAction(task.id, "ESTIMATE", { estimateMinutes: (estimate || 60) + 30 })}>+30p</button>
                  </> : null}
                  {task.status === "testing" ? <button type="button" className={styles.aiDeveloperDoneButton} disabled={busy} onClick={() => void onTaskAction(task.id, "COMPLETE")}><CheckCircle2 size={11} /> Kész</button> : null}
                  {started || task.status === "testing" ? <button type="button" className={styles.aiDeveloperFailButton} disabled={busy} onClick={() => { const note = window.prompt("Mi a blokkoló hiba / ok?") || ""; if (note.trim()) void onTaskAction(task.id, "FAIL", { note }); }}><XCircle size={11} /> Hiba</button> : null}
                </div>
              </article>
            );
          })}
          {!projectTasks.length ? <p className={styles.railEmpty}>A kiválasztott projektben nincs nyitott fejlesztési task.</p> : null}
        </div>
      </section>
      <section className={styles.executorReadinessBox} data-ready={context?.executorReadiness?.ready ? "true" : "false"}>
        <strong>VÉGREHAJTÓ KAPU</strong>
        <span>{context?.executorReadiness?.repositoryReady ? "Repo ✓" : "Repo ✕"} · {context?.executorReadiness?.baselineReady ? "Baseline ✓" : "Baseline ✕"} · {context?.executorReadiness?.providerConfigured ? "AI provider ✓" : "AI provider —"} · {context?.executorReadiness?.executorConfigured ? "Executor ✓" : "Executor —"}</span>
        <small>{context?.executorReadiness?.ready ? "Natív worker indításra kész." : context?.executorReadiness?.blockers?.[0] || "Végrehajtási állapot ellenőrzése…"}</small>
      </section>
      <TerminalHubCard onOpen={onOpenTerminalHub} />
      <section className={`${styles.approvalBox} ${pendingApprovals.length ? styles.approvalWaiting : ""}`}>
        {pendingApprovals.length ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
        <div><strong>{pendingApprovals.length ? `${pendingApprovals.length} döntés / jóváhagyás vár` : "Nincs függő jóváhagyás"}</strong><span>{pendingApprovals.length ? "BENJADMIN beavatkozás szükséges." : "A Control Plane approval queue tiszta."}</span></div>
      </section>
      <section className={styles.latestBuilds}>
        <div className={styles.railSectionTitle}><ListChecks size={14} /> LEGUTÓBBI ELLENŐRZÉSEK</div>
        {(builds || []).slice(0, 6).map((build) => <div key={build.id}><span className={build.status === "passed" ? styles.buildPass : build.status === "failed" ? styles.buildFail : styles.buildRunning}>{build.status === "passed" ? <CheckCircle2 size={12} /> : build.status === "failed" ? <AlertTriangle size={12} /> : <Hammer size={12} />}</span><strong>{build.run_type || "build"}</strong><small>{build.summary || build.build_id || build.status}</small></div>)}
        {!builds.length ? <p className={styles.railEmpty}>Nincs build/teszt adat.</p> : null}
      </section>
    </aside>
  );
}
