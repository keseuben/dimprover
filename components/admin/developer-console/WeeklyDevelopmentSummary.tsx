"use client";

import { BarChart3, ChevronDown, ChevronUp, Clock3, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WeeklyDevelopmentSummary as Summary } from "./types";
import styles from "./DeveloperConsole.module.css";

function adminHeaders() {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { "x-dimpro-license-admin-key": key };
}

function shortTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function WeeklyDevelopmentSummary({ selectedProjectId }: { selectedProjectId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = selectedProjectId ? `?projectId=${encodeURIComponent(selectedProjectId)}` : "";
      const response = await fetch(`/api/dev/console/weekly-summary${query}`, { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; summary?: Summary; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.summary) throw new Error(payload?.error || "A heti fejlesztési összesítő nem tölthető be.");
      setSummary(payload.summary);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A heti fejlesztési összesítő nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const topContexts = useMemo(() => summary?.contexts.slice(0, 6) || [], [summary]);

  return <section className={styles.weeklySummary} data-testid="benjadmin-weekly-development-summary" data-ready={summary?.ready ? "true" : "false"} data-expanded={expanded ? "true" : "false"} data-project-id={summary?.projectId || "all"}>
    <header className={styles.weeklySummaryHeader}>
      <button type="button" className={styles.weeklySummaryToggle} data-testid="benjadmin-weekly-summary-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <BarChart3 size={15} />
        <span><strong>HETI FEJLESZTÉSI ÖSSZESÍTŐ</strong><small>{summary?.period.label || "Aktuális naptári hét"}</small></span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      <button type="button" className={styles.weeklySummaryRefresh} title="Heti összesítő frissítése" disabled={loading} onClick={() => void load()}><RefreshCw size={13} /></button>
    </header>
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
      <div className={styles.weeklyWorkerStrip} data-testid="benjadmin-weekly-summary-workers">
        <UsersRound size={12} />
        {summary.workers.length ? summary.workers.map((worker) => <span key={worker.code} data-worker-code={worker.code}><strong>{worker.code}</strong><b>{worker.activityCount}</b><small>6/{worker.latestStage}</small></span>) : <small>Még nincs worker-aktivitás ezen a héten.</small>}
      </div>
      <div className={styles.weeklyContextList} data-testid="benjadmin-weekly-summary-contexts">
        {topContexts.map((context) => <article key={context.key} data-work-stage={context.latestStage} data-context-key={context.key}>
          <div><span>{context.projectName} <b>›</b> {context.mainModule} <b>›</b> {context.moduleName} <b>›</b> {context.submoduleName}</span><strong>6/{context.latestStage}</strong></div>
          <p>{context.workItem}</p>
          <small><Clock3 size={10} /> {shortTime(context.latestAt)} · {context.activityCount} aktivitás · {context.workers.join(" + ") || "rendszer"} · {context.latestAction}</small>
        </article>)}
        {!topContexts.length ? <p className={styles.weeklySummaryEmpty}>Ezen a héten még nincs kontextushoz köthető fejlesztési aktivitás.</p> : null}
      </div>
      <footer><span>Build {summary.stats.builds} · teszt {summary.stats.tests}{summary.truncated ? " · RÉSZLEGES NÉZET" : ""}</span><span><ShieldCheck size={10} /> {summary.period.timezone} · PROD DENY</span></footer>
    </div> : null}
  </section>;
}
