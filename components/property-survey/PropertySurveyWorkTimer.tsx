"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Pause, Play, Square, TimerReset, X } from "lucide-react";
import {
  finishPropertySurveyWorkSession,
  formatPropertySurveyWorkDuration,
  getPropertySurveyWorkTimerSummary,
  patchPropertySurveyWorkSession,
  pausePropertySurveyWorkSession,
  resumePropertySurveyWorkSession,
  startPropertySurveyWorkSession,
  switchPropertySurveyWorkStep,
  type PropertySurveyWorkTimerWorkspace,
} from "@/components/property-survey/propertySurveyWorkTimer";

type Props = {
  workspace: PropertySurveyWorkTimerWorkspace;
  activeStepId: string;
  activeStepLabel: string;
  projectName: string;
  surveyName: string;
  compact?: boolean;
  onChange: (workspace: PropertySurveyWorkTimerWorkspace) => void;
};

function getDefaultDeviceLabel() {
  if (typeof navigator === "undefined") return "";
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  return coarse ? "Tablet / mobil böngésző" : "Asztali böngésző";
}

export function PropertySurveyWorkTimer({ workspace, activeStepId, activeStepLabel, projectName, surveyName, compact = false, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date().toISOString());
  const summary = useMemo(() => getPropertySurveyWorkTimerSummary(workspace, now), [workspace, now]);
  const activeSession = summary.activeSession;

  useEffect(() => {
    if (workspace.status !== "running") return;
    const interval = window.setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => window.clearInterval(interval);
  }, [workspace.status]);

  useEffect(() => {
    if (workspace.status !== "running") return;
    const next = switchPropertySurveyWorkStep(workspace, activeStepId);
    if (next.updatedAt !== workspace.updatedAt) onChange(next);
  }, [activeStepId, onChange, workspace]);

  function start() {
    onChange(startPropertySurveyWorkSession(workspace, activeStepId, { deviceLabel: getDefaultDeviceLabel() }));
    setNow(new Date().toISOString());
    setOpen(true);
  }

  function togglePause() {
    onChange(workspace.status === "running" ? pausePropertySurveyWorkSession(workspace) : resumePropertySurveyWorkSession(workspace, activeStepId));
    setNow(new Date().toISOString());
  }

  function finish() {
    onChange(finishPropertySurveyWorkSession(workspace));
    setNow(new Date().toISOString());
  }

  const statusLabel = workspace.status === "running" ? "Fut" : workspace.status === "paused" ? "Szünet" : "Munka indítása";

  return <div className="relative survey-no-print" data-survey-work-timer>
    <button
      type="button"
      data-survey-work-timer-toggle
      onClick={() => workspace.status === "idle" ? start() : setOpen((current) => !current)}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-[10px] font-black uppercase tracking-[0.05em] shadow-sm transition ${workspace.status === "running" ? "border-emerald-400 bg-emerald-600 text-white" : workspace.status === "paused" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]"}`}
      title={workspace.status === "idle" ? "Munkaidőmérés indítása" : "Munkaidőmérő megnyitása"}
    >
      {workspace.status === "running" ? <Clock3 size={16} className="animate-pulse" /> : <Play size={16} />}
      <span className={compact ? "hidden sm:inline" : ""}>{workspace.status === "idle" ? statusLabel : formatPropertySurveyWorkDuration(summary.currentSeconds)}</span>
      {compact && workspace.status !== "idle" ? <span className="sm:hidden">{formatPropertySurveyWorkDuration(summary.currentSeconds).slice(0, 5)}</span> : null}
    </button>

    {open ? <div data-survey-work-timer-panel className="absolute right-0 top-[calc(100%+8px)] z-[220] w-[min(380px,calc(100vw-24px))] rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4 text-[var(--survey-text)] shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--survey-border)] pb-3">
        <div><div className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--survey-accent)]">Munkaidőmérő</div><div className="mt-1 text-base font-black">{surveyName}</div><div className="mt-1 text-[10px] font-semibold text-[var(--survey-muted)]">{projectName} · {activeStepLabel}</div></div>
        <button type="button" onClick={() => setOpen(false)} className="survey-icon-button" aria-label="Stopper bezárása"><X size={15} /></button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div data-survey-work-timer-summary="current" className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3"><div className="text-[8px] font-black uppercase text-[var(--survey-muted)]">Aktuális</div><div className="mt-1 text-base font-black tabular-nums">{formatPropertySurveyWorkDuration(summary.currentSeconds)}</div></div>
        <div data-survey-work-timer-summary="today" className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3"><div className="text-[8px] font-black uppercase text-[var(--survey-muted)]">Ma</div><div className="mt-1 text-base font-black tabular-nums">{formatPropertySurveyWorkDuration(summary.todaySeconds)}</div></div>
        <div data-survey-work-timer-summary="survey" className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3"><div className="text-[8px] font-black uppercase text-[var(--survey-muted)]">Felmérés</div><div className="mt-1 text-base font-black tabular-nums">{formatPropertySurveyWorkDuration(summary.totalSeconds)}</div></div>
      </div>

      <div className="mt-3 flex gap-2">
        {workspace.status === "idle" ? <button type="button" data-survey-work-timer-action="start" onClick={start} className="survey-action-primary flex-1"><Play size={16} /> Munka indítása</button> : <>
          <button type="button" data-survey-work-timer-action={workspace.status === "running" ? "pause" : "resume"} onClick={togglePause} className="survey-action-secondary flex-1">{workspace.status === "running" ? <Pause size={16} /> : <Play size={16} />}{workspace.status === "running" ? "Szünet" : "Folytatás"}</button>
          <button type="button" data-survey-work-timer-action="finish" onClick={finish} className="survey-action-danger flex-1"><Square size={15} /> Lezárás</button>
        </>}
      </div>

      {activeSession ? <div className="mt-4 grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
        <label><span className="mb-1 block text-[9px] font-black uppercase text-[var(--survey-muted)]">Operátor</span><input className="h-10 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 text-sm font-bold" value={activeSession.operatorName} onChange={(event) => onChange(patchPropertySurveyWorkSession(workspace, activeSession.id, { operatorName: event.target.value }))} placeholder="Név" /></label>
        <label><span className="mb-1 block text-[9px] font-black uppercase text-[var(--survey-muted)]">Eszköz</span><input className="h-10 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 text-sm font-bold" value={activeSession.deviceLabel} onChange={(event) => onChange(patchPropertySurveyWorkSession(workspace, activeSession.id, { deviceLabel: event.target.value }))} placeholder="Tablet / laptop" /></label>
        <label><span className="mb-1 flex items-center gap-1 text-[9px] font-black uppercase text-[var(--survey-muted)]"><TimerReset size={12} /> Kézi korrekció (perc)</span><input type="number" min="0" step="1" className="h-10 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 text-sm font-bold" value={Math.round(activeSession.manualAdjustmentSeconds / 60)} onChange={(event) => onChange(patchPropertySurveyWorkSession(workspace, activeSession.id, { manualAdjustmentSeconds: Math.max(0, Number(event.target.value) || 0) * 60 }))} /></label>
        <label><span className="mb-1 block text-[9px] font-black uppercase text-[var(--survey-muted)]">Megjegyzés</span><textarea rows={2} className="w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 py-2 text-sm font-semibold" value={activeSession.note} onChange={(event) => onChange(patchPropertySurveyWorkSession(workspace, activeSession.id, { note: event.target.value }))} placeholder="Pl. helyszíni felmérés, WinWatt előkészítés" /></label>
      </div> : null}

      <div className="mt-4 border-t border-[var(--survey-border)] pt-3">
        <div className="flex items-center justify-between text-[9px] font-black uppercase text-[var(--survey-muted)]"><span>Korábbi munkamenetek</span><span>{summary.sessionCount} db</span></div>
        <div className="mt-2 grid max-h-32 gap-2 overflow-y-auto">
          {[...workspace.sessions].reverse().slice(0, 5).map((session) => <div key={session.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 py-2 text-xs"><div className="min-w-0"><div className="truncate font-black">{session.note || (session.status === "completed" ? "Lezárt munkamenet" : "Aktív munkamenet")}</div><div className="mt-0.5 text-[9px] font-semibold text-[var(--survey-muted)]">{new Date(session.startedAt).toLocaleString("hu-HU")}</div></div><span className="shrink-0 font-black tabular-nums">{formatPropertySurveyWorkDuration(getPropertySurveyWorkTimerSummary({ ...workspace, activeSessionId: session.status === "completed" ? undefined : session.id, status: session.status === "running" ? "running" : session.status === "paused" ? "paused" : "idle", sessions: [session] }, now).totalSeconds)}</span></div>)}
        </div>
      </div>
    </div> : null}
  </div>;
}
