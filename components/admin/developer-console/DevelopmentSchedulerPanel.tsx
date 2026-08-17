"use client";

import { CalendarClock, CirclePause, CirclePlay, Clock3, MoonStar, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./DeveloperConsole.module.css";

type Schedule = {
  id: string; projectId: string; title: string; status: "active" | "paused" | "completed" | "cancelled";
  timezone: string; cadenceMinutes: number; startAt: string; endAt: string | null; nextRunAt: string;
  lastRunAt: string | null; lastSuccessAt: string | null; runCount: number; missedRunCount: number;
  maxRuns: number | null; preferredWorkerCode: string | null; metadata: Record<string, unknown>;
};
type Run = {
  id: string; scheduleId: string; slotAt: string; status: string; triggerSource: string; taskId: string | null;
  workerCode: string | null; attemptCount: number; summary: string; metadata: Record<string, unknown>;
};
type Snapshot = {
  ready: boolean; errorCode?: string; heartbeatMode?: string; externalWakeMode?: string;
  schedules: Schedule[]; runs: Run[]; generatedAt: string;
};

function adminHeaders(json = false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { ...(json ? { "content-type": "application/json" } : {}), "x-dimpro-license-admin-key": key };
}
function stamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}
function runLabel(status?: string) {
  return status === "ready_for_pull" ? "ChatGPT pullra kész"
    : status === "worker_active" ? "Worker aktív"
      : status === "completed" ? "Külső felvétel észlelve"
        : status === "no_task" ? "Nincs indítható task"
          : status === "failed" ? "Hiba · retry vár"
            : status === "skipped" ? "Slot kihagyva"
              : status === "running" ? "Feldolgozás"
                : "Még nincs futás";
}
function overnightPreset() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(23, 0, 0, 0);
  if (start.getTime() <= now.getTime()) start.setDate(start.getDate() + 1);
  const visibleEnd = new Date(start);
  visibleEnd.setDate(visibleEnd.getDate() + 1);
  visibleEnd.setHours(7, 0, 0, 0);
  const engineEnd = new Date(visibleEnd);
  engineEnd.setMinutes(1); // 07:00 slot is még lefuthat; az ablak 07:01-kor zár.
  return { startAt: start.toISOString(), endAt: engineEnd.toISOString(), visibleEnd };
}

export default function DevelopmentSchedulerPanel({ selectedProjectId }: { selectedProjectId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!selectedProjectId) { setSnapshot(null); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/dev/console/scheduler?projectId=${encodeURIComponent(selectedProjectId)}`, { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; scheduler?: Snapshot; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.scheduler) throw new Error(payload?.error || "A scheduler állapota nem tölthető be.");
      setSnapshot(payload.scheduler);
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A scheduler állapota nem tölthető be."); }
    finally { setLoading(false); }
  }, [selectedProjectId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const active = useMemo(() => snapshot?.schedules.find((item) => item.status === "active")
    || snapshot?.schedules.find((item) => item.status === "paused")
    || snapshot?.schedules[0] || null, [snapshot]);
  const latestRun = useMemo(() => active ? snapshot?.runs.find((item) => item.scheduleId === active.id) || null : null, [active, snapshot]);
  const externalWakeMissCount = Number(active?.metadata?.externalWakeMissCount || 0);
  const preset = overnightPreset();

  async function action(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/dev/console/scheduler", { method: "POST", headers: adminHeaders(true), body: JSON.stringify(body) });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A scheduler művelet sikertelen.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A scheduler művelet sikertelen."); }
    finally { setBusy(false); }
  }

  return <section className={styles.schedulerPanel} data-testid="benjadmin-development-scheduler" data-ready={snapshot?.ready ? "true" : "false"}>
    <header className={styles.schedulerHeader}>
      <div><MoonStar size={16} /><span>ÉJSZAKAI FEJLESZTÉS</span></div>
      <button type="button" title="Frissítés" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={13} /></button>
    </header>
    {!selectedProjectId ? <p className={styles.schedulerEmpty}>Válassz projektet az ütemezéshez.</p> :
      snapshot && !snapshot.ready ? <div className={styles.schedulerSchemaPending}><ShieldCheck size={14} /><span>Scheduler V1 telepítés előtt · {snapshot.errorCode || "schema pending"}</span></div> :
        active ? <>
          <div className={styles.schedulerMain}>
            <div><strong>{active.title}</strong><span data-scheduler-status={active.status}>{active.status === "active" ? "AKTÍV" : active.status === "paused" ? "SZÜNETEL" : active.status.toUpperCase()}</span></div>
            <p><CalendarClock size={13} /> {stamp(active.startAt)} → {active.endAt ? stamp(new Date(new Date(active.endAt).getTime() - 60_000).toISOString()) : "folyamatos"} · {active.cadenceMinutes} percenként</p>
          </div>
          <div className={styles.schedulerFacts}>
            <span><Clock3 size={12} /> Következő: <b>{active.status === "active" ? stamp(active.nextRunAt) : "szünetel"}</b></span>
            <span>Futás: <b>{active.runCount}{active.maxRuns ? `/${active.maxRuns}` : ""}</b></span>
            <span>Kimaradt slot: <b>{active.missedRunCount}</b></span>
            <span data-wake-miss={externalWakeMissCount ? "true" : "false"}>Külső wake hiány: <b>{externalWakeMissCount}</b></span>
          </div>
          <div className={styles.schedulerLatest} data-run-status={latestRun?.status || "none"}>
            <strong>{runLabel(latestRun?.status)}</strong>
            <span>{latestRun?.summary || "A következő órás slotra vár."}</span>
            {latestRun?.workerCode ? <small>{latestRun.workerCode} · {stamp(latestRun.slotAt)}</small> : <small>{stamp(latestRun?.slotAt)}</small>}
          </div>
          <div className={styles.schedulerActions}>
            {active.status === "active" ? <button type="button" disabled={busy} onClick={() => void action({ action: "PAUSE", scheduleId: active.id })}><CirclePause size={12} /> Szünet</button> : null}
            {active.status === "paused" ? <button type="button" disabled={busy} onClick={() => void action({ action: "RESUME", scheduleId: active.id })}><CirclePlay size={12} /> Folytatás</button> : null}
            {["active", "paused"].includes(active.status) ? <button type="button" disabled={busy} onClick={() => void action({ action: "CANCEL", scheduleId: active.id })}><XCircle size={12} /> Leállítás</button> : null}
          </div>
        </> : <div className={styles.schedulerPreset}>
          <strong>Ma éjszakára nincs aktív fejlesztési terv.</strong>
          <span>BENJADMIN óránként előkészíti a következő taskot. A ChatGPT Scheduled Task marad a külső Plus/MCP ébresztő.</span>
          <button type="button" disabled={busy || !snapshot?.ready} data-testid="benjadmin-overnight-preset" onClick={() => void action({
            action: "CREATE", projectId: selectedProjectId, title: "Éjszakai fejlesztési lánc",
            startAt: preset.startAt, endAt: preset.endAt, cadenceMinutes: 60, maxRuns: 9, missedRunPolicy: "catch_up_once", timezone: "Europe/Budapest",
          })}><MoonStar size={13} /> 23:00–07:00 · óránként</button>
        </div>}
    <div className={styles.schedulerModes}><span>MONITOR 60S</span><span>PLUS SCHEDULED TASK</span><span>PROD DENY</span></div>
    {error ? <p className={styles.schedulerError}>{error}</p> : null}
  </section>;
}
