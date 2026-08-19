"use client";

import { ArrowRightLeft, BarChart3, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Gauge, LockKeyhole, Minus, RefreshCw, RotateCcw, ShieldCheck, TimerReset, TrendingDown, TrendingUp, TriangleAlert, UsersRound, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WeeklyDevelopmentSummary as Summary } from "./types";
import styles from "./DeveloperConsole.module.css";

type WeeklyContext = Summary["contexts"][number];

function adminHeaders() {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { "x-dimpro-license-admin-key": key };
}

function shortTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function durationLabel(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes)) return "—";
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe} p`;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest ? `${hours} ó ${rest} p` : `${hours} ó`;
}

function mondayDateKey(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function readInitialQuery() {
  if (typeof window === "undefined") return { week: "", worker: "ALL", stage: 0 };
  const params = new URLSearchParams(window.location.search);
  const stage = Number(params.get("weeklyStage") || 0);
  return {
    week: mondayDateKey(params.get("week")?.trim() || ""),
    worker: params.get("weeklyWorker")?.trim().toUpperCase() || "ALL",
    stage: Number.isFinite(stage) && stage >= 1 && stage <= 6 ? Math.round(stage) : 0,
  };
}

function writeQuery(values: { week?: string; worker?: string; stage?: number }) {
  const url = new URL(window.location.href);
  if (values.week !== undefined) {
    if (values.week) url.searchParams.set("week", values.week);
    else url.searchParams.delete("week");
  }
  if (values.worker !== undefined) {
    if (values.worker && values.worker !== "ALL") url.searchParams.set("weeklyWorker", values.worker);
    else url.searchParams.delete("weeklyWorker");
  }
  if (values.stage !== undefined) {
    if (values.stage) url.searchParams.set("weeklyStage", String(values.stage));
    else url.searchParams.delete("weeklyStage");
  }
  window.history.replaceState(window.history.state, "", url);
}

export default function WeeklyDevelopmentSummary({ selectedProjectId, onOpenContext }: {
  selectedProjectId: string;
  onOpenContext?: (context: WeeklyContext, weekKey: string) => void;
}) {
  const initial = useMemo(() => readInitialQuery(), []);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [weekKey, setWeekKey] = useState(initial.week);
  const [workerFilter, setWorkerFilter] = useState(initial.worker);
  const [stageFilter, setStageFilter] = useState(initial.stage);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (selectedProjectId) query.set("projectId", selectedProjectId);
      if (weekKey) query.set("week", weekKey);
      const suffix = query.size ? `?${query.toString()}` : "";
      const response = await fetch(`/api/dev/console/weekly-summary${suffix}`, { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; summary?: Summary; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.summary) throw new Error(payload?.error || "A heti fejlesztési összesítő nem tölthető be.");
      setSummary(payload.summary);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A heti fejlesztési összesítő nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, weekKey]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const availableWorkers = useMemo(() => summary?.workers.map((item) => item.code) || [], [summary]);
  useEffect(() => {
    if (workerFilter === "ALL" || availableWorkers.includes(workerFilter)) return;
    setWorkerFilter("ALL");
    writeQuery({ worker: "ALL" });
  }, [availableWorkers, workerFilter]);

  const filteredContexts = useMemo(() => {
    const contexts = summary?.contexts || [];
    return contexts.filter((context) => {
      if (workerFilter !== "ALL" && !context.workers.includes(workerFilter)) return false;
      if (stageFilter && Number(context.stageCounts[String(stageFilter)] || 0) <= 0) return false;
      return true;
    });
  }, [stageFilter, summary, workerFilter]);
  const topContexts = filteredContexts.slice(0, 12);

  const summaryProjectId = summary?.projectId || "";
  const readyForSelection = Boolean(summary?.ready
    && summaryProjectId === selectedProjectId
    && (!weekKey || summary.period.weekKey === weekKey));

  function selectWeek(value: string) {
    const normalized = mondayDateKey(value);
    const currentWeekKey = summary?.period.currentWeekKey || "";
    const safeWeekKey = currentWeekKey && normalized > currentWeekKey ? currentWeekKey : normalized;
    setWeekKey(safeWeekKey);
    writeQuery({ week: safeWeekKey });
  }

  function goCurrentWeek() {
    setWeekKey("");
    writeQuery({ week: "" });
  }

  function selectWorker(code: string) {
    const next = workerFilter === code ? "ALL" : code;
    setWorkerFilter(next);
    writeQuery({ worker: next });
  }

  function selectStage(stage: number) {
    const next = stageFilter === stage ? 0 : stage;
    setStageFilter(next);
    writeQuery({ stage: next });
  }

  return <section
    className={styles.weeklySummary}
    data-testid="benjadmin-weekly-development-summary"
    data-ready={readyForSelection ? "true" : "false"}
    data-expanded={expanded ? "true" : "false"}
    data-project-id={summary?.projectId || "all"}
    data-week-key={summary?.period.weekKey || weekKey || ""}
    data-worker-filter={workerFilter}
    data-stage-filter={stageFilter || "all"}
  >
    <header className={styles.weeklySummaryHeader}>
      <button type="button" className={styles.weeklySummaryToggle} data-testid="benjadmin-weekly-summary-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <BarChart3 size={15} />
        <span><strong>HETI FEJLESZTÉSI ÖSSZESÍTŐ</strong><small>{summary?.period.label || "Naptári hét"}</small></span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      <button type="button" className={styles.weeklySummaryRefresh} title="Heti összesítő frissítése" disabled={loading} onClick={() => void load()}><RefreshCw size={13} /></button>
    </header>

    {expanded ? <div className={styles.weeklySummaryToolbar} data-testid="benjadmin-weekly-summary-toolbar">
      <button type="button" title="Előző hét" disabled={!summary} onClick={() => summary && selectWeek(summary.period.previousWeekKey)}><ChevronLeft size={13} /></button>
      <label title="Válassz egy napot; a rendszer az adott hét hétfőjére igazítja."><CalendarRange size={12} /><input type="date" aria-label="Heti összesítő hét kiválasztása" value={summary?.period.weekKey || weekKey} onChange={(event) => selectWeek(event.target.value)} /></label>
      <button type="button" className={styles.weeklyCurrentButton} data-active={summary?.period.isCurrentWeek ? "true" : "false"} disabled={!summary?.period || summary.period.isCurrentWeek} onClick={goCurrentWeek}><RotateCcw size={11} /> Aktuális hét</button>
      <button type="button" title="Következő hét" disabled={!summary || summary.period.isCurrentWeek} onClick={() => summary && selectWeek(summary.period.nextWeekKey)}><ChevronRight size={13} /></button>
    </div> : null}

    {error ? <p className={styles.weeklySummaryError}>{error}</p> : null}
    {expanded && summary ? <div className={styles.weeklySummaryBody}>
      <div className={styles.weeklySummaryStats} data-testid="benjadmin-weekly-summary-stats">
        <span><b>{summary.stats.activities}</b> aktivitás</span>
        <span><b>{summary.stats.contexts}</b> munkarész</span>
        <span><b>{summary.stats.workers}</b> worker</span>
        <span><b>{summary.stats.openTasks}</b> nyitott</span>
        <span><b>{summary.stats.completedTasks}</b> lezárt</span>
        <span data-alert={summary.stats.blockedTasks || summary.stats.errors ? "true" : "false"}><b>{summary.stats.blockedTasks}</b> blokkolt · <b>{summary.stats.errors}</b> hiba</span>
      </div>

      <section className={styles.weeklyFlowAnalytics} data-testid="benjadmin-weekly-flow-analytics" data-scheduler-ready={summary.flowAnalytics.schedulerReady ? "true" : "false"}>
        <header><Workflow size={12} /><strong>HETI FEJLESZTÉSI FOLYAMAT</strong><span>Scheduler + worker + 6/x</span></header>
        <div className={styles.weeklyFlowMetrics}>
          <article data-flow-kind="scheduler"><TimerReset size={13} /><div><span>Scheduler futás</span><strong>{summary.flowAnalytics.schedulerRuns.total}</strong><small>{summary.flowAnalytics.schedulerRuns.completed} kész · {summary.flowAnalytics.schedulerRuns.failed} hibás · {summary.flowAnalytics.schedulerRuns.retries} retry</small></div></article>
          <article data-flow-kind="handoff"><ArrowRightLeft size={13} /><div><span>Worker átadás</span><strong>{summary.flowAnalytics.handoffs}</strong><small>azonos task / munkarész</small></div></article>
          <article data-flow-kind="waiting" data-alert={summary.flowAnalytics.buildLockWaits || summary.flowAnalytics.waitingForWorker ? "true" : "false"}><LockKeyhole size={13} /><div><span>Várakozás</span><strong>{summary.flowAnalytics.buildLockWaits + summary.flowAnalytics.waitingForWorker}</strong><small>{summary.flowAnalytics.buildLockWaits} build lock · {summary.flowAnalytics.waitingForWorker} worker</small></div></article>
          <article data-flow-kind="failure" data-alert={summary.flowAnalytics.taskFailures || summary.flowAnalytics.schedulerRuns.failed ? "true" : "false"}><TriangleAlert size={13} /><div><span>Elakadás</span><strong>{summary.flowAnalytics.taskFailures + summary.flowAnalytics.schedulerRuns.failed}</strong><small>{summary.flowAnalytics.taskFailures} task · {summary.flowAnalytics.schedulerRuns.failed} scheduler</small></div></article>
        </div>
        <div className={styles.weeklyFlowStages} data-testid="benjadmin-weekly-flow-stage">
          <span>6/x lefedettség</span>
          {[1, 2, 3, 4, 5, 6].map((stage) => <b key={stage} data-flow-stage={stage} data-active={Number(summary.flowAnalytics.stageCounts[String(stage)] || 0) > 0 ? "true" : "false"}>6/{stage}<small>{summary.flowAnalytics.stageCounts[String(stage)] || 0}</small></b>)}
        </div>
        {summary.flowAnalytics.transitions.length ? <div className={styles.weeklyFlowTransitions} data-testid="benjadmin-weekly-flow-transitions">
          <span>Átadások</span>
          {summary.flowAnalytics.transitions.slice(0, 3).map((item, index) => <b key={item.changedAt + "-" + index}><strong>{item.fromWorkerCode}</strong><ArrowRightLeft size={9} /><strong>{item.toWorkerCode}</strong><small>{item.workItem}</small></b>)}
        </div> : null}
        {summary.flowAnalytics.handoffTiming.available ? <section className={styles.weeklyHandoffTiming} data-testid="benjadmin-weekly-handoff-timing">
          <header><Clock3 size={11} /><strong>Átadási idő / lead time</strong><span>megfigyelt jelenléti ablakok</span></header>
          <div className={styles.weeklyHandoffTimingMetrics}>
            <article data-handoff-timing="average"><span>Átlagos átadási rés</span><strong>{durationLabel(summary.flowAnalytics.handoffTiming.averageGapMinutes)}</strong><small>{summary.flowAnalytics.handoffTiming.observedHandoffs} mért átadás</small></article>
            <article data-handoff-timing="median"><span>Medián átadási rés</span><strong>{durationLabel(summary.flowAnalytics.handoffTiming.medianGapMinutes)}</strong><small>{summary.flowAnalytics.handoffTiming.zeroGapCount} azonnali / átfedő</small></article>
            <article data-handoff-timing="maximum"><span>Leghosszabb átadási rés</span><strong>{durationLabel(summary.flowAnalytics.handoffTiming.maxGapMinutes)}</strong><small>worker → worker</small></article>
            <article data-handoff-timing="build-lock"><span>Build-lock várakozás</span><strong>{durationLabel(summary.flowAnalytics.handoffTiming.buildLockWaitMinutes)}</strong><small>{summary.flowAnalytics.handoffTiming.buildLockWaitEvents} mért ablak</small></article>
          </div>
          {summary.flowAnalytics.handoffTiming.bottleneck.kind ? <aside data-bottleneck-kind={summary.flowAnalytics.handoffTiming.bottleneck.kind}>
            <TriangleAlert size={10} /><div><strong>{summary.flowAnalytics.handoffTiming.bottleneck.label}</strong><span>{durationLabel(summary.flowAnalytics.handoffTiming.bottleneck.minutes)} · {summary.flowAnalytics.handoffTiming.bottleneck.workerCode || "RENDSZER"}{summary.flowAnalytics.handoffTiming.bottleneck.workItem ? ` · ${summary.flowAnalytics.handoffTiming.bottleneck.workItem}` : ""}</span></div>
          </aside> : null}
          {summary.flowAnalytics.handoffTiming.details.length ? <div className={styles.weeklyHandoffTimingDetails}>
            {summary.flowAnalytics.handoffTiming.details.slice(0, 4).map((item, index) => <b key={item.changedAt + "-" + index} data-handoff-gap={item.gapMinutes}><strong>{item.fromWorkerCode}</strong><ArrowRightLeft size={9} /><strong>{item.toWorkerCode}</strong><span>{durationLabel(item.gapMinutes)}</span><small>{item.workItem}</small></b>)}
          </div> : null}
        </section> : null}
        {summary.flowAnalytics.blockers.length ? <div className={styles.weeklyFlowBlockers} data-testid="benjadmin-weekly-flow-blockers">
          <header><TriangleAlert size={11} /><strong>Elakadási okok</strong><span>{summary.flowAnalytics.blockers.length}</span></header>
          {summary.flowAnalytics.blockers.slice(0, 4).map((item, index) => <article key={item.kind + "-" + item.at + "-" + index} data-blocker-kind={item.kind}><b>{item.label}</b><span>{item.detail}</span><small>{item.workerCode || "RENDSZER"} · {shortTime(item.at)}</small></article>)}
        </div> : null}
        {summary.flowAnalytics.trend.available ? <section className={styles.weeklyFlowTrend} data-testid="benjadmin-weekly-flow-trend" data-previous-week={summary.flowAnalytics.trend.previousWeekKey}>
          <header><TrendingUp size={11} /><strong>Előző héthez képest</strong><span>{summary.flowAnalytics.trend.previousWeekKey}</span></header>
          <div>
            {summary.flowAnalytics.trend.metrics.map((item) => <article key={item.key} data-trend-key={item.key} data-direction={item.direction} data-tone={item.tone}>
              <span>{item.label}</span><strong>{item.current}</strong><small>{item.direction === "up" ? <TrendingUp size={9} /> : item.direction === "down" ? <TrendingDown size={9} /> : <Minus size={9} />}{item.delta > 0 ? "+" : ""}{item.delta}{item.deltaPercent === null ? " · új" : ` · ${item.deltaPercent > 0 ? "+" : ""}${item.deltaPercent}%`}</small>
            </article>)}
          </div>
        </section> : null}
        {summary.flowAnalytics.workerLoad.length ? <section className={styles.weeklyWorkerLoad} data-testid="benjadmin-weekly-worker-load">
          <header><Gauge size={11} /><strong>Worker terhelés</strong><span>aktivitásmegoszlás + elakadási jelzés</span></header>
          <div>
            {summary.flowAnalytics.workerLoad.slice(0, 6).map((worker) => <article key={worker.code} data-worker-load={worker.code} data-signal={worker.signal}>
              <div><strong>{worker.code}</strong><b>{worker.loadSharePercent}%</b></div>
              <progress max={100} value={worker.loadSharePercent} aria-label={`${worker.code} heti aktivitásmegoszlás`} />
              <small>{worker.activityCount} akt · {worker.contextCount} rész · {worker.handoffCount} átadás · {worker.waitCount + worker.blockerCount} jelzés{worker.activityDelta === null ? "" : ` · előző héthez ${worker.activityDelta > 0 ? "+" : ""}${worker.activityDelta}`}</small>
            </article>)}
          </div>
        </section> : null}
      </section>

      <div className={styles.weeklyFilterRow} data-testid="benjadmin-weekly-summary-filters">
        <div className={styles.weeklyWorkerStrip}>
          <UsersRound size={12} />
          {summary.workers.length ? summary.workers.map((worker) => <button type="button" key={worker.code} data-worker-code={worker.code} data-active={workerFilter === worker.code ? "true" : "false"} onClick={() => selectWorker(worker.code)}>
            <strong>{worker.code}</strong><b>{worker.activityCount}</b><small>6/{worker.latestStage}</small>
          </button>) : <small>Még nincs worker-aktivitás ezen a héten.</small>}
        </div>
        <div className={styles.weeklyStageFilters} aria-label="Heti 6/x fázis szűrő">
          {[1, 2, 3, 4, 5, 6].map((stage) => <button type="button" key={stage} data-stage={stage} data-active={stageFilter === stage ? "true" : "false"} onClick={() => selectStage(stage)}>6/{stage}</button>)}
        </div>
      </div>

      <div className={styles.weeklyContextList} data-testid="benjadmin-weekly-summary-contexts" data-filtered-count={filteredContexts.length}>
        {topContexts.map((context) => <button type="button" className={styles.weeklyContextCard} key={context.key} data-work-stage={context.latestStage} data-context-key={context.key} onClick={() => onOpenContext?.(context, summary.period.weekKey)}>
          <div><span>{context.projectName} <b>›</b> {context.mainModule} <b>›</b> {context.moduleName} <b>›</b> {context.submoduleName}</span><strong>6/{context.latestStage}</strong></div>
          <p>{context.workItem}</p>
          <small><Clock3 size={10} /> {shortTime(context.latestAt)} · {context.activityCount} aktivitás · {context.workers.join(" + ") || "rendszer"} · {context.latestAction}</small>
        </button>)}
        {!topContexts.length ? <p className={styles.weeklySummaryEmpty}>{summary.contexts.length ? "A kiválasztott worker / 6-x fázis szerint nincs találat." : "Ezen a héten még nincs kontextushoz köthető fejlesztési aktivitás."}</p> : null}
      </div>
      <footer>
        <span>Megjelenítve {topContexts.length}/{summary.contexts.length} · Build {summary.stats.builds} · teszt {summary.stats.tests}{summary.truncated ? " · RÉSZLEGES NÉZET" : ""}</span>
        <span><ShieldCheck size={10} /> {summary.period.timezone} · PROD DENY</span>
      </footer>
    </div> : null}
  </section>;
}
