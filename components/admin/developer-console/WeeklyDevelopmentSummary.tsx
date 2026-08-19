"use client";

import { ArrowRightLeft, BarChart3, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Download, FileCode2, FileJson2, Gauge, LockKeyhole, Minus, RefreshCw, RotateCcw, Share2, ShieldCheck, TimerReset, TrendingDown, TrendingUp, TriangleAlert, UsersRound, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WeeklyDevelopmentSummary as Summary, WeeklyPortfolio, WeeklyTrendHistory } from "./types";
import styles from "./DeveloperConsole.module.css";

type WeeklyContext = Summary["contexts"][number];
type FlowDetailKind = keyof Summary["flowAnalytics"]["drillDown"];
type TrendMetric = "score" | "activities" | "completed" | "waiting" | "errors";

const FLOW_DETAIL_LABELS: Record<FlowDetailKind, string> = {
  scheduler: "Scheduler futások",
  handoff: "Worker átadások",
  waiting: "Várakozások",
  failure: "Elakadások",
};

const TREND_METRIC_LABELS: Record<TrendMetric, string> = { score: "Flow-score", activities: "Aktivitás", completed: "Lezárt", waiting: "Várakozás", errors: "Hiba" };

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

export default function WeeklyDevelopmentSummary({ selectedProjectId, onOpenContext, onSelectProject }: {
  selectedProjectId: string;
  onOpenContext?: (context: WeeklyContext, weekKey: string) => void;
  onSelectProject?: (projectId: string) => void;
}) {
  const initial = useMemo(() => readInitialQuery(), []);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [weekKey, setWeekKey] = useState(initial.week);
  const [workerFilter, setWorkerFilter] = useState(initial.worker);
  const [stageFilter, setStageFilter] = useState(initial.stage);
  const [flowDetailKind, setFlowDetailKind] = useState<FlowDetailKind | null>(null);
  const [reportExporting, setReportExporting] = useState<"" | "pdf" | "html" | "json" | "share">("");
  const [trendHistory, setTrendHistory] = useState<WeeklyTrendHistory | null>(null);
  const [trendHistoryLoading, setTrendHistoryLoading] = useState(false);
  const [trendHistoryError, setTrendHistoryError] = useState("");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("score");
  const [portfolio, setPortfolio] = useState<WeeklyPortfolio | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState("");

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

  const loadTrendHistory = useCallback(async () => {
    setTrendHistoryLoading(true);
    try {
      const query = new URLSearchParams({ weeks: "8" });
      if (selectedProjectId) query.set("projectId", selectedProjectId);
      if (weekKey) query.set("week", weekKey);
      const response = await fetch(`/api/dev/console/weekly-trend-history?${query.toString()}`, { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; history?: WeeklyTrendHistory; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.history) throw new Error(payload?.error || "A többhetes fejlesztési trend nem tölthető be.");
      setTrendHistory(payload.history);
      setTrendHistoryError("");
    } catch (caught) {
      setTrendHistoryError(caught instanceof Error ? caught.message : "A többhetes fejlesztési trend nem tölthető be.");
    } finally {
      setTrendHistoryLoading(false);
    }
  }, [selectedProjectId, weekKey]);

  useEffect(() => {
    void loadTrendHistory();
    const timer = window.setInterval(() => void loadTrendHistory(), 300_000);
    return () => window.clearInterval(timer);
  }, [loadTrendHistory]);

  const loadPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    try {
      const query = new URLSearchParams();
      if (weekKey) query.set("week", weekKey);
      const suffix = query.size ? "?" + query.toString() : "";
      const response = await fetch("/api/dev/console/weekly-portfolio" + suffix, { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; portfolio?: WeeklyPortfolio; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.portfolio) throw new Error(payload?.error || "A heti fejlesztési portfólió nem tölthető be.");
      setPortfolio(payload.portfolio);
      setPortfolioError("");
    } catch (caught) {
      setPortfolioError(caught instanceof Error ? caught.message : "A heti fejlesztési portfólió nem tölthető be.");
    } finally {
      setPortfolioLoading(false);
    }
  }, [weekKey]);

  useEffect(() => {
    void loadPortfolio();
    const timer = window.setInterval(() => void loadPortfolio(), 300_000);
    return () => window.clearInterval(timer);
  }, [loadPortfolio]);

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
  const flowDetailItems = flowDetailKind && summary ? summary.flowAnalytics.drillDown[flowDetailKind] : [];
  const trendChart = useMemo(() => {
    const points = trendHistory?.points || [];
    const values = points.map((point) => point[trendMetric]);
    const maxValue = trendMetric === "score" ? 100 : Math.max(1, ...values);
    const width = 640;
    const height = 150;
    const left = 32;
    const right = 12;
    const top = 14;
    const bottom = 24;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    const coordinates = points.map((point, index) => {
      const value = point[trendMetric];
      const x = points.length <= 1 ? left + chartWidth / 2 : left + (index / (points.length - 1)) * chartWidth;
      const y = top + (1 - Math.min(maxValue, Math.max(0, value)) / maxValue) * chartHeight;
      return { ...point, value, x, y };
    });
    return { width, height, left, top, bottom, chartHeight, maxValue, coordinates, polyline: coordinates.map((point) => `${point.x},${point.y}`).join(" ") };
  }, [trendHistory, trendMetric]);

  const portfolioTargetWeek = weekKey || summary?.period.weekKey || "";
  const portfolioReadyForSelection = Boolean(portfolio?.ready && (!portfolioTargetWeek || portfolio.period.weekKey === portfolioTargetWeek));
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

  function reportExportUrl(format: "pdf" | "html" | "json") {
    const query = new URLSearchParams({ format });
    if (selectedProjectId) query.set("projectId", selectedProjectId);
    const reportWeek = summary?.period.weekKey || weekKey;
    if (reportWeek) query.set("week", reportWeek);
    return `/api/dev/console/weekly-report-export?${query.toString()}`;
  }

  function reportFileName(response: Response, fallback: string) {
    const disposition = response.headers.get("content-disposition") || "";
    const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (utf8) {
      try { return decodeURIComponent(utf8); } catch { return fallback; }
    }
    return disposition.match(/filename="([^"]+)"/i)?.[1] || fallback;
  }

  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async function fetchReport(format: "pdf" | "html" | "json") {
    const response = await fetch(reportExportUrl(format), { headers: adminHeaders(), cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error || "A heti vezetői riport exportja nem sikerült.");
    }
    return response;
  }

  async function exportReport(format: "pdf" | "html" | "json") {
    setReportExporting(format);
    try {
      const response = await fetchReport(format);
      const blob = await response.blob();
      const fallback = `BENJADMIN-heti-riport-${summary?.period.weekKey || weekKey || "aktualis"}.${format}`;
      downloadBlob(blob, reportFileName(response, fallback));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A heti vezetői riport exportja nem sikerült.");
    } finally {
      setReportExporting("");
    }
  }

  async function shareReport() {
    setReportExporting("share");
    try {
      const response = await fetchReport("pdf");
      const blob = await response.blob();
      const fileName = reportFileName(response, `BENJADMIN-heti-riport-${summary?.period.weekKey || weekKey || "aktualis"}.pdf`);
      const file = new File([blob], fileName, { type: "application/pdf" });
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: "BENJADMIN heti vezetői riport", text: summary?.managementSummary.headline || "Heti fejlesztési vezetői riport", files: [file] });
      } else {
        downloadBlob(blob, fileName);
      }
      setError("");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "A heti vezetői riport megosztása nem sikerült.");
    } finally {
      setReportExporting("");
    }
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
      <button type="button" className={styles.weeklySummaryRefresh} title="Heti összesítő frissítése" disabled={loading || trendHistoryLoading || portfolioLoading} onClick={() => { void load(); void loadTrendHistory(); void loadPortfolio(); }}><RefreshCw size={13} /></button>
    </header>

    {expanded ? <div className={styles.weeklySummaryToolbar} data-testid="benjadmin-weekly-summary-toolbar">
      <button type="button" title="Előző hét" disabled={!summary} onClick={() => summary && selectWeek(summary.period.previousWeekKey)}><ChevronLeft size={13} /></button>
      <label title="Válassz egy napot; a rendszer az adott hét hétfőjére igazítja."><CalendarRange size={12} /><input type="date" aria-label="Heti összesítő hét kiválasztása" value={summary?.period.weekKey || weekKey} onChange={(event) => selectWeek(event.target.value)} /></label>
      <button type="button" className={styles.weeklyCurrentButton} data-active={summary?.period.isCurrentWeek ? "true" : "false"} disabled={!summary?.period || summary.period.isCurrentWeek} onClick={goCurrentWeek}><RotateCcw size={11} /> Aktuális hét</button>
      <button type="button" title="Következő hét" disabled={!summary || summary.period.isCurrentWeek} onClick={() => summary && selectWeek(summary.period.nextWeekKey)}><ChevronRight size={13} /></button>
      <div className={styles.weeklyReportActions} data-testid="benjadmin-weekly-report-actions">
        <button type="button" title="Vezetői heti riport letöltése PDF-ben" disabled={!summary || Boolean(reportExporting)} data-report-format="pdf" onClick={() => void exportReport("pdf")}><Download size={11} /> PDF</button>
        <button type="button" title="Vezetői heti riport letöltése HTML-ben" disabled={!summary || Boolean(reportExporting)} data-report-format="html" onClick={() => void exportReport("html")}><FileCode2 size={11} /> HTML</button>
        <button type="button" title="Vezetői heti riport adatainak letöltése JSON-ban" disabled={!summary || Boolean(reportExporting)} data-report-format="json" onClick={() => void exportReport("json")}><FileJson2 size={11} /> JSON</button>
        <button type="button" title="Vezetői heti riport megosztása" disabled={!summary || Boolean(reportExporting)} data-report-action="share" onClick={() => void shareReport()}><Share2 size={11} /> {reportExporting === "share" ? "Megosztás…" : "Megosztás"}</button>
      </div>
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

      <section className={styles.weeklyPortfolio} data-testid="benjadmin-weekly-portfolio" data-ready={portfolioReadyForSelection ? "true" : "false"} data-week-key={portfolioReadyForSelection ? portfolio?.period.weekKey || summary.period.weekKey : portfolioTargetWeek || summary.period.weekKey} data-project-count={portfolio?.totals.projects || 0}>
        <header><BarChart3 size={12} /><strong>PROJEKTPORTFÓLIÓ · HETI ÖSSZEVETÉS</strong><span>{portfolio?.period.label || summary.period.label}{portfolioLoading ? " · frissítés…" : ""}</span></header>
        {portfolioReadyForSelection && portfolio ? <div className={styles.weeklyPortfolioTotals}>
          <article><span>Projekt</span><strong>{portfolio.totals.projects}</strong><small>{portfolio.totals.workers} aktív worker</small></article>
          <article><span>Átlag score</span><strong>{portfolio.totals.averageScore}/100</strong><small>{portfolio.totals.stable} stabil</small></article>
          <article data-alert={portfolio.totals.critical || portfolio.totals.watch ? "true" : "false"}><span>Figyelendő</span><strong>{portfolio.totals.watch}</strong><small>{portfolio.totals.critical} beavatkozás</small></article>
          <article data-alert={portfolio.totals.errors || portfolio.totals.waiting ? "true" : "false"}><span>Jelzés</span><strong>{portfolio.totals.errors + portfolio.totals.waiting}</strong><small>{portfolio.totals.errors} hiba · {portfolio.totals.waiting} várakozás</small></article>
          <article><span>Lezárt</span><strong>{portfolio.totals.completed}</strong><small>{portfolio.totals.activities} aktivitás</small></article>
        </div> : null}
        {portfolioError ? <p className={styles.weeklyPortfolioError}>{portfolioError}</p> : null}
        {portfolioReadyForSelection && portfolio?.projects.length ? <div className={styles.weeklyPortfolioList}>
          {portfolio.projects.map((project) => <button type="button" key={project.projectId} data-portfolio-project={project.projectId} data-rank={project.rank} data-status={project.managementStatus} data-selected={selectedProjectId === project.projectId ? "true" : "false"} onClick={() => onSelectProject?.(project.projectId)}>
            <span className={styles.weeklyPortfolioRank}>{project.rank}</span>
            <div className={styles.weeklyPortfolioProject}>
              <strong>{project.projectName}</strong>
              <span>{project.managementStatus === "critical" ? "BEAVATKOZÁS" : project.managementStatus === "watch" ? "FIGYELENDŐ" : "STABIL"} · {project.headline}</span>
              <small>{project.primaryRisk || "Nincs kiemelt heti kockázat."}</small>
            </div>
            <b className={styles.weeklyPortfolioScore}>{project.score}<small>/100</small></b>
            <div className={styles.weeklyPortfolioMetrics}>
              <span><b>{project.activities}</b> akt.</span>
              <span><b>{project.completed}</b> lezárt</span>
              <span data-alert={project.blocked ? "true" : "false"}><b>{project.blocked}</b> blokkolt</span>
              <span data-alert={project.waiting ? "true" : "false"}><b>{project.waiting}</b> vár.</span>
              <span data-alert={project.errors ? "true" : "false"}><b>{project.errors}</b> hiba</span>
              <span><b>{project.workers}</b> worker</span>
            </div>
          </button>)}
        </div> : <p className={styles.weeklySummaryEmpty}>{portfolioLoading || !portfolioReadyForSelection ? "A heti projektportfólió betöltése…" : "Nincs aktív projekt a heti portfólióban."}</p>}
      </section>

      <section className={styles.weeklyManagementSummary} data-testid="benjadmin-weekly-management-summary" data-status={summary.managementSummary.status} data-score={summary.managementSummary.score}>
        <header>
          <Gauge size={12} /><strong>VEZETŐI HETI ÖSSZEFOGLALÓ</strong>
          <span data-management-status={summary.managementSummary.status}>{summary.managementSummary.status === "critical" ? "BEAVATKOZÁS" : summary.managementSummary.status === "watch" ? "FIGYELENDŐ" : "STABIL"} · {summary.managementSummary.score}/100</span>
        </header>
        <div className={styles.weeklyManagementHeadline}>
          <div><strong>{summary.managementSummary.headline}</strong><p>{summary.managementSummary.narrative}</p></div>
          <progress max={100} value={summary.managementSummary.score} aria-label={`Heti fejlesztési flow score: ${summary.managementSummary.score} / 100`} />
        </div>
        <div className={styles.weeklyManagementIndicators} data-testid="benjadmin-weekly-management-indicators">
          <span><b>{summary.managementSummary.indicators.completed}</b> lezárt</span>
          <span data-alert={summary.managementSummary.indicators.failures ? "true" : "false"}><b>{summary.managementSummary.indicators.failures}</b> hiba</span>
          <span data-alert={summary.managementSummary.indicators.waiting ? "true" : "false"}><b>{summary.managementSummary.indicators.waiting}</b> várakozás</span>
          <span><b>{summary.managementSummary.indicators.activeWorkers}</b> worker</span>
          <span><b>{durationLabel(summary.managementSummary.indicators.handoffGapMinutes)}</b> max átadás</span>
        </div>
        <div className={styles.weeklyManagementColumns}>
          <section data-management-group="positive">
            <header><ShieldCheck size={10} /><strong>Pozitívumok</strong></header>
            {summary.managementSummary.positives.map((item, index) => <p key={`positive-${index}`}>{item}</p>)}
          </section>
          <section data-management-group="risk">
            <header><TriangleAlert size={10} /><strong>Figyelmet igényel</strong></header>
            {summary.managementSummary.risks.length ? summary.managementSummary.risks.map((item, index) => <article key={`${item.kind}-${index}`} data-risk-kind={item.kind} data-severity={item.severity}><b>{item.label}</b><span>{item.detail}</span></article>) : <p>Nincs kiemelt heti kockázati jelzés.</p>}
          </section>
          <section data-management-group="action">
            <header><TrendingUp size={10} /><strong>Következő vezetői teendő</strong></header>
            {summary.managementSummary.nextActions.map((item, index) => <p key={`action-${index}`}>{index + 1}. {item}</p>)}
          </section>
        </div>
      </section>

      <section className={styles.weeklyTrendHistory} data-testid="benjadmin-weekly-trend-history" data-ready={trendHistory?.ready ? "true" : "false"} data-weeks={trendHistory?.weeks || 8} data-anchor-week={trendHistory?.anchorWeekKey || summary.period.weekKey} data-metric={trendMetric}>
        <header><TrendingUp size={12} /><strong>8 HETES VEZETŐI TREND</strong><span>{trendHistory?.anchorWeekKey || summary.period.weekKey}{trendHistoryLoading ? " · frissítés…" : ""}</span></header>
        <div className={styles.weeklyTrendMetricTabs} role="group" aria-label="Többhetes trend mutató">
          {(Object.keys(TREND_METRIC_LABELS) as TrendMetric[]).map((metric) => <button type="button" key={metric} data-trend-metric={metric} data-active={trendMetric === metric ? "true" : "false"} aria-pressed={trendMetric === metric} onClick={() => setTrendMetric(metric)}>{TREND_METRIC_LABELS[metric]}</button>)}
        </div>
        {trendHistoryError ? <p className={styles.weeklyTrendHistoryError}>{trendHistoryError}</p> : null}
        {trendHistory?.points.length ? <div className={styles.weeklyTrendChartWrap}>
          <svg className={styles.weeklyTrendChart} viewBox={`0 0 ${trendChart.width} ${trendChart.height}`} role="img" aria-label={`${TREND_METRIC_LABELS[trendMetric]} nyolchetes trendgrafikon`}>
            {[0, 0.5, 1].map((ratio) => <line key={ratio} x1={trendChart.left} x2={trendChart.width - 12} y1={trendChart.top + ratio * trendChart.chartHeight} y2={trendChart.top + ratio * trendChart.chartHeight} data-grid-line="true" />)}
            <text x={2} y={trendChart.top + 4}>{trendChart.maxValue}</text>
            <text x={8} y={trendChart.top + trendChart.chartHeight + 4}>0</text>
            <polyline points={trendChart.polyline} data-trend-line="true" />
            {trendChart.coordinates.map((point) => <g key={point.weekKey} data-week-point={point.weekKey} data-status={point.status} data-current={point.isCurrentWeek ? "true" : "false"}>
              <circle cx={point.x} cy={point.y} r={point.isCurrentWeek ? 5 : 4}><title>{point.label}: {point.value}</title></circle>
              <text x={point.x} y={trendChart.height - 5} textAnchor="middle">{point.weekKey.slice(5)}</text>
            </g>)}
          </svg>
          <div className={styles.weeklyTrendPointGrid}>
            {trendChart.coordinates.map((point) => <article key={point.weekKey} data-status={point.status} data-current={point.isCurrentWeek ? "true" : "false"}>
              <span>{point.weekKey.slice(5)}</span><strong>{point.value}</strong><small>{point.score}/100 · {point.activities} akt · {point.errors} hiba</small>
            </article>)}
          </div>
        </div> : <p className={styles.weeklySummaryEmpty}>{trendHistoryLoading ? "A többhetes trend betöltése…" : "Nincs többhetes trendadat."}</p>}
      </section>

      <section className={styles.weeklyFlowAnalytics} data-testid="benjadmin-weekly-flow-analytics" data-scheduler-ready={summary.flowAnalytics.schedulerReady ? "true" : "false"}>
        <header><Workflow size={12} /><strong>HETI FEJLESZTÉSI FOLYAMAT</strong><span>Scheduler + worker + 6/x</span></header>
        <div className={styles.weeklyFlowMetrics}>
          <button type="button" data-flow-kind="scheduler" data-selected={flowDetailKind === "scheduler" ? "true" : "false"} aria-pressed={flowDetailKind === "scheduler"} onClick={() => setFlowDetailKind((current) => current === "scheduler" ? null : "scheduler")}><TimerReset size={13} /><div><span>Scheduler futás</span><strong>{summary.flowAnalytics.schedulerRuns.total}</strong><small>{summary.flowAnalytics.schedulerRuns.completed} kész · {summary.flowAnalytics.schedulerRuns.failed} hibás · {summary.flowAnalytics.schedulerRuns.retries} retry</small></div></button>
          <button type="button" data-flow-kind="handoff" data-selected={flowDetailKind === "handoff" ? "true" : "false"} aria-pressed={flowDetailKind === "handoff"} onClick={() => setFlowDetailKind((current) => current === "handoff" ? null : "handoff")}><ArrowRightLeft size={13} /><div><span>Worker átadás</span><strong>{summary.flowAnalytics.handoffs}</strong><small>azonos task / munkarész</small></div></button>
          <button type="button" data-flow-kind="waiting" data-selected={flowDetailKind === "waiting" ? "true" : "false"} aria-pressed={flowDetailKind === "waiting"} data-alert={summary.flowAnalytics.buildLockWaits || summary.flowAnalytics.waitingForWorker ? "true" : "false"} onClick={() => setFlowDetailKind((current) => current === "waiting" ? null : "waiting")}><LockKeyhole size={13} /><div><span>Várakozás</span><strong>{summary.flowAnalytics.buildLockWaits + summary.flowAnalytics.waitingForWorker}</strong><small>{summary.flowAnalytics.buildLockWaits} build lock · {summary.flowAnalytics.waitingForWorker} worker</small></div></button>
          <button type="button" data-flow-kind="failure" data-selected={flowDetailKind === "failure" ? "true" : "false"} aria-pressed={flowDetailKind === "failure"} data-alert={summary.flowAnalytics.taskFailures || summary.flowAnalytics.schedulerRuns.failed ? "true" : "false"} onClick={() => setFlowDetailKind((current) => current === "failure" ? null : "failure")}><TriangleAlert size={13} /><div><span>Elakadás</span><strong>{summary.flowAnalytics.taskFailures + summary.flowAnalytics.schedulerRuns.failed}</strong><small>{summary.flowAnalytics.taskFailures} task · {summary.flowAnalytics.schedulerRuns.failed} scheduler</small></div></button>
        </div>
        {flowDetailKind ? <section className={styles.weeklyFlowDrillDown} data-testid="benjadmin-weekly-flow-drilldown" data-detail-kind={flowDetailKind}>
          <header><BarChart3 size={11} /><strong>{FLOW_DETAIL_LABELS[flowDetailKind]}</strong><span>{flowDetailItems.length} esemény</span><button type="button" aria-label="Flow részletek bezárása" onClick={() => setFlowDetailKind(null)}>×</button></header>
          {flowDetailItems.length ? <div>
            {flowDetailItems.map((item) => <article key={item.id} data-drilldown-event={item.kind}>
              <b>{item.label}</b><span>{item.detail}</span>
              <small>{item.fromWorkerCode && item.toWorkerCode ? `${item.fromWorkerCode} → ${item.toWorkerCode}` : item.workerCode || "RENDSZER"} · {shortTime(item.at)}{item.status ? ` · ${item.status}` : ""}{item.attemptCount && item.attemptCount > 1 ? ` · ${item.attemptCount}. próbálkozás` : ""}{item.workItem ? ` · ${item.workItem}` : ""}</small>
            </article>)}
          </div> : <p>Nincs rögzített esemény ebben a kategóriában.</p>}
        </section> : null}
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
