"use client";

import { Activity, ArrowRightLeft, Clock3, Code2, FileCode2, FileDiff, FlaskConical, Hammer, History, Radio, X } from "lucide-react";
import { useMemo, useState } from "react";
import { resolveTaskDevelopmentContext } from "@/app/lib/dev-center/development-context";
import BenjadminAvatar, { memberName } from "./BenjadminAvatar";
import DeveloperMessage from "./DeveloperMessage";
import type { ConsoleAuthor, ConsoleLiveState, ConsoleMessage } from "./types";
import styles from "./DeveloperConsole.module.css";

type WorkerCode = "ARMINAI" | "JAZMINAI" | "OUTMINAI";
type Filter = "ALL" | "CODE" | "FILES" | "TESTS" | "BUILD";

const workerAuthor: Record<WorkerCode, ConsoleAuthor> = {
  ARMINAI: "ARMINAI",
  JAZMINAI: "JAZMINAI",
  OUTMINAI: "OUTMINAI",
};

function compactDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

function matchesFilter(message: ConsoleMessage, filter: Filter) {
  if (filter === "ALL") return true;
  if (filter === "CODE") return ["CODE_ACTIVITY", "TERMINAL_ACTIVITY", "COMMIT"].includes(message.kind);
  if (filter === "FILES") return ["FILE_CHANGE", "DIFF"].includes(message.kind);
  if (filter === "TESTS") return ["TEST_RESULT", "ERROR", "WARNING"].includes(message.kind);
  return ["BUILD_EVENT", "RELEASE"].includes(message.kind);
}

export default function WorkerActivityDrawer({ workerCode, onClose, messages, live, selectedProjectId }: {
  workerCode: WorkerCode | null;
  onClose: () => void;
  messages: ConsoleMessage[];
  live: ConsoleLiveState | null;
  selectedProjectId: string;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const author = workerCode ? workerAuthor[workerCode] : null;
  const worker = workerCode ? live?.workers.find((item) => item.code === workerCode) : null;
  const session = worker ? live?.sessions.find((item) => item.worker_id === worker.id && item.status !== "closed") : null;
  const activeTask = session?.task_id
    ? live?.tasks.find((item) => item.id === session.task_id) || null
    : worker ? live?.tasks.find((item) => (item.assigned_worker_id === worker.id || item.requested_worker_id === worker.id) && !["completed", "cancelled"].includes(item.status)) || null : null;
  const build = activeTask ? live?.builds.find((item) => item.task_id === activeTask.id || (session?.id && item.session_id === session.id)) : null;
  const autoPresence = workerCode ? live?.workerPresence?.find((item) => item.workerCode === workerCode && item.active) || null : null;
  const activeContext = activeTask ? resolveTaskDevelopmentContext({ projectId: activeTask.project_id || null, title: activeTask.title, description: activeTask.description || null, status: activeTask.status, scope: activeTask.scope, metadata: activeTask.metadata || {} }) : null;
  const presenceHistory = workerCode ? (live?.workerPresenceHistory || []).filter((item) => item.workerCode === workerCode).slice(0, 12) : [];
  const transitions = workerCode ? (live?.workerTransitions || []).filter((item) => item.fromWorkerCode === workerCode || item.toWorkerCode === workerCode).slice(0, 10) : [];
  const workerLabel = (code: string) => live?.workers.find((item) => item.code === code)?.name || code;

  const activity = useMemo(() => {
    if (!author) return [];
    return messages
      .filter((message) => message.author === author)
      .filter((message) => !selectedProjectId || !message.projectId || message.projectId === selectedProjectId)
      .filter((message) => matchesFilter(message, filter))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [author, filter, messages, selectedProjectId]);

  if (!workerCode || !author) return null;
  const status = activeTask?.status === "blocked" ? "blocked" : activeTask || autoPresence ? "working" : "idle";
  return (
    <div className={styles.drawerLayer} role="presentation">
      <button type="button" className={styles.drawerBackdrop} aria-label="Worker aktivitás bezárása" onClick={onClose} />
      <aside className={`${styles.drawer} ${styles.drawerWide} ${styles.workerActivityDrawer}`} aria-label={`${memberName(author)} részletes kódolási napló`} data-worker-code={workerCode}>
        <header className={styles.drawerHeader}>
          <div><span>WORKER KÓDOLÁSI CSEVEGÉS</span><strong>{memberName(author)} · részletes SANITIZED aktivitás</strong></div>
          <button type="button" onClick={onClose} aria-label="Bezárás"><X size={18} /></button>
        </header>
        <div className={styles.drawerBody}>
          <section className={styles.workerActivityHero} data-worker-code={workerCode}>
            <BenjadminAvatar member={author} size="head" status={status} eager />
            <div>
              <strong>{worker?.name || memberName(author)}</strong>
              <span>{activeTask ? `DOLGOZIK · ${activeTask.status.toUpperCase()}` : autoPresence ? "DOLGOZIK · AUTO" : "INAKTÍV"}</span>
              <p>{activeTask?.title || autoPresence?.summary || "Nincs aktív fejlesztési task."}</p>
            </div>
            <div className={styles.workerActivityHeroFacts}>
              <span><Radio size={12} /> {session?.handshake_stage || (autoPresence ? `AUTO · ${autoPresence.phase.toUpperCase()}` : "Nincs aktív session")}</span>
              <span><Hammer size={12} /> {build ? `${build.run_type || "build"}: ${build.status}` : autoPresence?.operation ? `${autoPresence.operation}: aktív` : "Build: nincs"}</span>
              <span><Code2 size={12} /> {activeTask?.branch_name || autoPresence?.branch || autoPresence?.inferredBy || "Branch: —"}</span>
            </div>
          </section>

          {activeContext ? <section className={styles.workerContextCompact} data-context-location="drawer" data-work-stage={activeContext.workStageIndex}>
            <span>{activeContext.mainModule} <b>›</b> {activeContext.projectName} <b>›</b> {activeContext.moduleName} <b>›</b> {activeContext.submoduleName}</span>
            <strong>6/{activeContext.workStageIndex} · {activeContext.workStageLabel}</strong>
            <small>{activeContext.workItem}</small>
          </section> : null}

          <section className={styles.workerActivityRetention}>
            <History size={14} />
            <div><strong>LIVE → SESSION → HISTORY</strong><span>Az aktuális események részletesek; a korábbi munkamenetek napi/heti archívumban maradnak kereshetők. A tartós kódforrás a Git/Diff.</span></div>
          </section>

          <section className={styles.workerPresenceHistory} data-testid="benjadmin-worker-presence-history" data-history-count={presenceHistory.length}>
            <header><History size={13} /><strong>WORKER PRESENCE ÉLETCIKLUS</strong><span>{presenceHistory.length} esemény</span></header>
            <div className={styles.workerPresenceTimeline}>
              {presenceHistory.length ? presenceHistory.map((presence) => <article key={presence.id} data-lifecycle-state={presence.lifecycleState}>
                <div><strong>{presence.lifecycleState}</strong><time dateTime={presence.detectedAt || presence.createdAt}><Clock3 size={10} /> {compactDateTime(presence.detectedAt || presence.createdAt)}</time></div>
                <span>{presence.mainModule || "—"} › {presence.moduleName || "—"} › {presence.submoduleName || "—"}</span>
                <p>{presence.workItem || presence.summary}</p>
                <small>{presence.phase.toUpperCase()} · {presence.inferredBy || "ismeretlen forrás"}{presence.confidence ? ` · ${presence.confidence}` : ""}{presence.endReason ? ` · ${presence.endReason}` : ""}</small>
              </article>) : <p className={styles.workerPresenceEmpty}>Még nincs tartós presence-életciklus ehhez a workerhez.</p>}
            </div>
          </section>

          <section className={styles.workerTransitionHistory} data-testid="benjadmin-worker-transition-history" data-transition-count={transitions.length}>
            <header><ArrowRightLeft size={13} /><strong>WORKER ÁTADÁSOK</strong><span>{transitions.length} átadás</span></header>
            {transitions.length ? transitions.map((transition) => <article key={transition.id}>
              <div><b>{workerLabel(transition.fromWorkerCode)}</b><ArrowRightLeft size={11} /><b>{workerLabel(transition.toWorkerCode)}</b><time dateTime={transition.changedAt}>{compactDateTime(transition.changedAt)}</time></div>
              <span>{transition.mainModule} › {transition.moduleName} › {transition.submoduleName}</span>
              <small>{transition.workItem} · {transition.reason}</small>
            </article>) : <p className={styles.workerPresenceEmpty}>Ehhez a workerhez még nincs azonos kontextusú átadás.</p>}
          </section>

          <div className={styles.workerActivityFilters} role="tablist" aria-label="Worker aktivitás szűrő">
            <button type="button" data-active={filter === "ALL"} onClick={() => setFilter("ALL")}><Activity size={12} /> Minden</button>
            <button type="button" data-active={filter === "CODE"} onClick={() => setFilter("CODE")}><Code2 size={12} /> Kód</button>
            <button type="button" data-active={filter === "FILES"} onClick={() => setFilter("FILES")}><FileCode2 size={12} /> Fájl / <FileDiff size={12} /> Diff</button>
            <button type="button" data-active={filter === "TESTS"} onClick={() => setFilter("TESTS")}><FlaskConical size={12} /> Teszt</button>
            <button type="button" data-active={filter === "BUILD"} onClick={() => setFilter("BUILD")}><Hammer size={12} /> Build</button>
          </div>

          <section className={styles.workerActivityFeed} data-testid="benjadmin-worker-activity-feed">
            {activity.length ? activity.map((message) => <DeveloperMessage key={message.id} message={message} />) : (
              <div className={styles.workerActivityEmpty}><Code2 size={28} /><strong>Még nincs részletes worker-esemény ebben a nézetben.</strong><span>A következő kódolási futások analysis / coding / file / diff / test / build eseményei itt jelennek meg.</span></div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
