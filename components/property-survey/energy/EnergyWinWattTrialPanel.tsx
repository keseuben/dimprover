"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCopy, Clock3, FlaskConical, Hand, PauseCircle, Play, Plus, RefreshCw, SkipForward, Trash2, XCircle } from "lucide-react";
import type { WinWattFieldMapResult } from "@/components/energy/domain/energyWinWattTransferTypes";
import {
  createWinWattTrialSession,
  finishWinWattTrialField,
  getWinWattTrialFieldElapsedSeconds,
  startWinWattTrialField,
  winWattTrialComparisonStatusLabels,
  winWattTrialFieldStatusLabels,
  winWattTrialInputMethodLabels,
  winWattTrialSessionStatusLabels,
  type WinWattTrialComparisonStatus,
  type WinWattTrialFeedbackResult,
  type WinWattTrialFieldResult,
  type WinWattTrialFieldStatus,
  type WinWattTrialInputMethod,
  type WinWattTrialMetricComparison,
  type WinWattTrialMetricSeed,
  type WinWattTrialSession,
  type WinWattTrialSessionStatus,
  type WinWattTrialWorkspace,
} from "@/components/energy/domain/energyWinWattTrialTypes";

type Props = {
  workspace: WinWattTrialWorkspace;
  result: WinWattTrialFeedbackResult;
  fieldMap: WinWattFieldMapResult;
  metricSeeds: WinWattTrialMetricSeed[];
  onChange: (workspace: WinWattTrialWorkspace) => void;
};

type FieldFilter = "all" | WinWattTrialFieldStatus;

const inputClass = "h-10 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-xs font-bold text-[var(--survey-text)] outline-none focus:border-cyan-500";
const textareaClass = "min-h-20 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 text-xs font-bold text-[var(--survey-text)] outline-none focus:border-cyan-500";
const labelClass = "mb-1 block text-[9px] font-black uppercase tracking-[0.08em] text-[var(--survey-muted)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className={labelClass}>{label}</span>{children}</label>;
}

function parseOptionalNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatNumber(value?: number) {
  return value === undefined ? "" : String(value).replace(".", ",");
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function OptionalNumberInput({ value, onCommit, ariaLabel, integer = false }: { value?: number; onCommit: (value?: number) => void; ariaLabel: string; integer?: boolean }) {
  const [draft, setDraft] = useState(formatNumber(value));
  useEffect(() => setDraft(formatNumber(value)), [value]);
  function commit() {
    const parsed = parseOptionalNumber(draft);
    const next = parsed === undefined ? undefined : integer ? Math.max(0, Math.round(parsed)) : parsed;
    onCommit(next);
    setDraft(formatNumber(next));
  }
  return <input aria-label={ariaLabel} inputMode={integer ? "numeric" : "decimal"} className={inputClass} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}

function fieldTone(status: WinWattTrialFieldStatus) {
  if (status === "matched") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "targetAdjusted" || status === "unitAdjusted" || status === "manualOnly") return "border-amber-300 bg-amber-50 text-amber-900";
  if (status === "blocked") return "border-rose-300 bg-rose-50 text-rose-800";
  if (status === "skipped") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-cyan-200 bg-cyan-50 text-cyan-800";
}

function comparisonTone(status: WinWattTrialComparisonStatus) {
  if (status === "withinTolerance") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "outsideTolerance") return "border-rose-300 bg-rose-50 text-rose-800";
  if (status === "notComparable") return "border-slate-300 bg-slate-100 text-slate-700";
  return "border-amber-300 bg-amber-50 text-amber-900";
}

function calculateComparisonStatus(metric: WinWattTrialMetricComparison, winWattValue?: number): WinWattTrialComparisonStatus {
  if (winWattValue === undefined) return "notCompared";
  if (metric.dimproValue === undefined) return "notComparable";
  const absoluteDifference = Math.abs(winWattValue - metric.dimproValue);
  const percentDifference = Math.abs(metric.dimproValue) > 0 ? absoluteDifference / Math.abs(metric.dimproValue) * 100 : absoluteDifference === 0 ? 0 : Number.POSITIVE_INFINITY;
  const hasAbsoluteTolerance = metric.toleranceAbsolute !== undefined;
  const hasPercentTolerance = metric.tolerancePercent !== undefined;
  if (!hasAbsoluteTolerance && !hasPercentTolerance) return absoluteDifference === 0 ? "withinTolerance" : "outsideTolerance";
  const withinAbsolute = hasAbsoluteTolerance && absoluteDifference <= Number(metric.toleranceAbsolute);
  const withinPercent = hasPercentTolerance && percentDifference <= Number(metric.tolerancePercent);
  return withinAbsolute || withinPercent ? "withinTolerance" : "outsideTolerance";
}

function MetricCard({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "good" | "warn" | "bad" }) {
  const className = tone === "good" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-950" : tone === "bad" ? "border-rose-300 bg-rose-50 text-rose-900" : "border-[var(--survey-border)] bg-[var(--survey-panel)] text-[var(--survey-text)]";
  return <div className={`rounded-xl border p-3 ${className}`}><div className="text-[9px] font-black uppercase tracking-[0.08em]">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>;
}

export function EnergyWinWattTrialPanel({ workspace, result, fieldMap, metricSeeds, onChange }: Props) {
  const activeSession = workspace.sessions.find((session) => session.id === workspace.activeSessionId) || workspace.sessions[0];
  const activeSummary = result.sessionSummaries.find((summary) => summary.sessionId === activeSession?.id);
  const [fieldFilter, setFieldFilter] = useState<FieldFilter>("all");
  const [tableId, setTableId] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedFieldMapId, setSelectedFieldMapId] = useState<string>("");
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "empty" | "error">("idle");
  const [clockTick, setClockTick] = useState(() => Date.now());

  const fieldMapById = useMemo(() => new Map(fieldMap.fields.map((field) => [field.id, field])), [fieldMap.fields]);
  const fieldResultByMapId = useMemo(() => new Map((activeSession?.fieldResults || []).map((field) => [field.fieldMapId, field])), [activeSession?.fieldResults]);
  const filteredFields = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("hu-HU");
    return fieldMap.fields.filter((field) => {
      const trial = fieldResultByMapId.get(field.id);
      const status = trial?.status || "notTested";
      if (fieldFilter !== "all" && status !== fieldFilter) return false;
      if (tableId !== "all" && field.sourceTableId !== tableId) return false;
      if (!normalized) return true;
      return [field.sourceTableLabel, field.sourceColumnLabel, field.targetGroupLabel, trial?.targetWindow, trial?.targetTab, trial?.targetFieldLabel, trial?.note]
        .some((value) => String(value || "").toLocaleLowerCase("hu-HU").includes(normalized));
    });
  }, [fieldFilter, fieldMap.fields, fieldResultByMapId, query, tableId]);
  const selectedField = fieldMapById.get(selectedFieldMapId || activeSession?.activeFieldMapId || "") || filteredFields[0] || fieldMap.fields[0];
  const selectedTrial = selectedField ? fieldResultByMapId.get(selectedField.id) : undefined;
  const selectedSourceRecords = useMemo(() => selectedField ? fieldMap.records.filter((record) => record.sourceTableId === selectedField.sourceTableId && record.sourceColumnKey === selectedField.sourceColumnKey && record.value !== null && record.value !== "") : [], [fieldMap.records, selectedField]);
  const selectedSourceValues = useMemo(() => [...new Set(selectedSourceRecords.map((record) => String(record.value)))], [selectedSourceRecords]);
  const selectedSourceText = selectedSourceValues.join("\n");
  const selectedElapsedSeconds = selectedTrial ? getWinWattTrialFieldElapsedSeconds(selectedTrial, clockTick) : 0;
  const blockedFields = useMemo(() => (activeSession?.fieldResults || []).filter((field) => field.status === "blocked"), [activeSession?.fieldResults]);
  const sessionLocked = activeSession?.status === "completed";

  useEffect(() => {
    if (!selectedTrial?.entryStartedAt) return;
    setClockTick(Date.now());
    const timer = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [selectedTrial?.entryStartedAt, selectedTrial?.fieldMapId]);

  function commit(next: WinWattTrialWorkspace) {
    onChange({ ...next, updatedAt: new Date().toISOString() });
  }

  function addSession() {
    const session = createWinWattTrialSession({ fieldMap, metricSeeds });
    commit({ ...workspace, activeSessionId: session.id, sessions: [...workspace.sessions, session] });
    setSelectedFieldMapId(fieldMap.fields.find((field) => field.readiness !== "notApplicable")?.id || fieldMap.fields[0]?.id || "");
  }

  function updateSession(sessionId: string, patch: Partial<WinWattTrialSession>) {
    commit({
      ...workspace,
      sessions: workspace.sessions.map((session) => session.id === sessionId ? { ...session, ...patch, updatedAt: new Date().toISOString() } : session),
    });
  }

  function updateField(fieldMapId: string, patch: Partial<WinWattTrialFieldResult>) {
    if (!activeSession) return;
    const verifiedStatus = patch.status === "matched" || patch.status === "targetAdjusted" || patch.status === "unitAdjusted" || patch.status === "manualOnly";
    updateSession(activeSession.id, {
      status: activeSession.status === "draft" ? "inProgress" : activeSession.status,
      startedAt: activeSession.startedAt || new Date().toISOString(),
      fieldResults: activeSession.fieldResults.map((field) => field.fieldMapId === fieldMapId ? { ...field, ...patch, verifiedAt: verifiedStatus ? new Date().toISOString() : field.verifiedAt } : field),
    });
  }

  function updateMetric(metricId: string, patch: Partial<WinWattTrialMetricComparison>) {
    if (!activeSession) return;
    updateSession(activeSession.id, { resultComparisons: activeSession.resultComparisons.map((metric) => metric.id === metricId ? { ...metric, ...patch } : metric) });
  }

  function selectSession(sessionId: string) {
    const session = workspace.sessions.find((item) => item.id === sessionId);
    commit({ ...workspace, activeSessionId: sessionId });
    setSelectedFieldMapId(session?.activeFieldMapId || session?.fieldResults.find((field) => field.status === "notTested")?.fieldMapId || session?.fieldResults[0]?.fieldMapId || "");
    setCopyState("idle");
  }

  function deleteSession(sessionId: string) {
    const sessions = workspace.sessions.filter((session) => session.id !== sessionId);
    const nextSession = sessions[0];
    commit({ ...workspace, sessions, activeSessionId: nextSession?.id });
    setSelectedFieldMapId(nextSession?.activeFieldMapId || nextSession?.fieldResults.find((field) => field.status === "notTested")?.fieldMapId || nextSession?.fieldResults[0]?.fieldMapId || "");
    setCopyState("idle");
  }

  function selectTrialField(fieldMapId: string) {
    const field = fieldMapById.get(fieldMapId);
    setSelectedFieldMapId(fieldMapId);
    setCopyState("idle");
    if (field) setTableId(field.sourceTableId);
    if (activeSession && activeSession.activeFieldMapId !== fieldMapId) updateSession(activeSession.id, { activeFieldMapId: fieldMapId });
  }

  function getNextUntestedField(currentFieldMapId?: string) {
    if (!activeSession) return undefined;
    const applicable = fieldMap.fields.filter((field) => field.readiness !== "notApplicable");
    const startIndex = Math.max(-1, applicable.findIndex((field) => field.id === currentFieldMapId));
    for (let offset = 1; offset <= applicable.length; offset += 1) {
      const candidate = applicable[(startIndex + offset) % applicable.length];
      if ((fieldResultByMapId.get(candidate.id)?.status || "notTested") === "notTested") return candidate;
    }
    return undefined;
  }

  function selectNextUntested() {
    const next = getNextUntestedField(selectedField?.id);
    if (next) selectTrialField(next.id);
  }

  function startSelectedField() {
    if (!activeSession || !selectedField || !selectedTrial) return;
    const startedAt = new Date().toISOString();
    const nextOrder = selectedTrial.entryOrder || Math.max(0, ...activeSession.fieldResults.map((field) => field.entryOrder || 0)) + 1;
    updateSession(activeSession.id, {
      activeFieldMapId: selectedField.id,
      status: activeSession.status === "draft" ? "inProgress" : activeSession.status,
      startedAt: activeSession.startedAt || startedAt,
      fieldResults: activeSession.fieldResults.map((field) => field.fieldMapId === selectedField.id ? { ...startWinWattTrialField(field, startedAt), entryOrder: nextOrder } : field),
    });
    setClockTick(Date.now());
  }

  function pauseSelectedField() {
    if (!activeSession || !selectedField || !selectedTrial?.entryStartedAt) return;
    const pausedAt = new Date().toISOString();
    updateSession(activeSession.id, {
      fieldResults: activeSession.fieldResults.map((field) => field.fieldMapId === selectedField.id ? {
        ...field,
        durationSeconds: Number(getWinWattTrialFieldElapsedSeconds(field, pausedAt).toFixed(1)),
        entryStartedAt: undefined,
      } : field),
    });
  }

  function restartSelectedFieldTimer() {
    if (!activeSession || !selectedField || !selectedTrial) return;
    const startedAt = new Date().toISOString();
    updateSession(activeSession.id, {
      activeFieldMapId: selectedField.id,
      status: activeSession.status === "draft" ? "inProgress" : activeSession.status,
      startedAt: activeSession.startedAt || startedAt,
      fieldResults: activeSession.fieldResults.map((field) => field.fieldMapId === selectedField.id ? { ...field, durationSeconds: 0, entryStartedAt: startedAt, entryCompletedAt: undefined } : field),
    });
    setClockTick(Date.now());
  }

  async function copySelectedSourceValues() {
    if (!activeSession || !selectedField || !selectedTrial || !selectedSourceText) {
      setCopyState("empty");
      return;
    }
    try {
      await copyTextToClipboard(selectedSourceText);
      const startedAt = new Date().toISOString();
      const nextOrder = selectedTrial.entryOrder || Math.max(0, ...activeSession.fieldResults.map((field) => field.entryOrder || 0)) + 1;
      const prepared = selectedTrial.entryStartedAt ? selectedTrial : startWinWattTrialField(selectedTrial, startedAt);
      updateSession(activeSession.id, {
        activeFieldMapId: selectedField.id,
        status: activeSession.status === "draft" ? "inProgress" : activeSession.status,
        startedAt: activeSession.startedAt || startedAt,
        fieldResults: activeSession.fieldResults.map((field) => field.fieldMapId === selectedField.id ? { ...prepared, inputMethod: "copyPaste", entryOrder: nextOrder } : field),
      });
      setCopyState("copied");
      setClockTick(Date.now());
    } catch {
      setCopyState("error");
    }
  }

  function completeSelectedField(status: WinWattTrialFieldStatus) {
    if (!activeSession || !selectedField || !selectedTrial) return;
    const finishedAt = new Date().toISOString();
    const prepared = selectedTrial.entryStartedAt ? selectedTrial : startWinWattTrialField(selectedTrial, finishedAt);
    const completed = finishWinWattTrialField(prepared, status, finishedAt);
    const inputMethod = status === "manualOnly" ? "typing" : completed.inputMethod;
    const next = autoAdvance ? getNextUntestedField(selectedField.id) : undefined;
    updateSession(activeSession.id, {
      activeFieldMapId: next?.id || selectedField.id,
      status: activeSession.status === "draft" ? "inProgress" : activeSession.status,
      startedAt: activeSession.startedAt || finishedAt,
      fieldResults: activeSession.fieldResults.map((field) => field.fieldMapId === selectedField.id ? { ...completed, inputMethod } : field),
    });
    if (next) {
      setSelectedFieldMapId(next.id);
      setTableId(next.sourceTableId);
    }
    setCopyState("idle");
  }

  function setSessionStatus(status: WinWattTrialSessionStatus) {
    if (!activeSession) return;
    if (status === "completed" && !activeSummary?.readyToComplete) return;
    updateSession(activeSession.id, {
      status,
      startedAt: status === "inProgress" ? activeSession.startedAt || new Date().toISOString() : activeSession.startedAt,
      completedAt: status === "completed" ? new Date().toISOString() : status === "draft" || status === "inProgress" ? undefined : activeSession.completedAt,
    });
  }

  return <div className="grid gap-4" data-winwatt-trial-panel="true">
    <div className="rounded-2xl border border-violet-300 bg-violet-50 p-4 text-violet-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-700 text-white"><FlaskConical size={21} /></span><div><div className="text-base font-black">WinWatt próbaátadási munkamenetek</div><div className="mt-1 max-w-4xl text-xs font-semibold leading-5">A tényleges WinWatt-asztali bevitel tapasztalatait mezőnként rögzíti. A célablakok, feliratok és egységek csak a felhasználói visszaigazolás után kapnak próbában igazolt állapotot.</div></div></div>
        <button type="button" data-create-winwatt-trial onClick={addSession} className="survey-action-primary"><Plus size={16} /> Új próba</button>
      </div>
    </div>

    {!activeSession ? <div className="rounded-2xl border border-dashed border-[var(--survey-border)] p-8 text-center"><div className="text-sm font-black text-[var(--survey-text)]">Még nincs próbaátadási munkamenet</div><div className="mt-2 text-xs font-semibold text-[var(--survey-muted)]">Hozz létre egy munkamenetet, majd a WinWatt asztali programban végzett bevitel közben rögzítsd a célmezőket és eltéréseket.</div></div> : <>
      <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 lg:grid-cols-[260px_minmax(0,1fr)_auto] lg:items-end">
        <Field label="Próba munkamenet"><select data-winwatt-trial-session className={inputClass} value={activeSession.id} onChange={(event) => selectSession(event.target.value)}>{workspace.sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}</select></Field>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Megnevezés"><input className={inputClass} value={activeSession.title} onChange={(event) => updateSession(activeSession.id, { title: event.target.value })} /></Field><Field label="WinWatt verzió"><input aria-label="Próba WinWatt verzió" className={inputClass} value={activeSession.winWattVersion} onChange={(event) => updateSession(activeSession.id, { winWattVersion: event.target.value })} placeholder="Pl. 9.54" /></Field><Field label="Operátor"><input aria-label="Próba operátor" className={inputClass} value={activeSession.operatorName} onChange={(event) => updateSession(activeSession.id, { operatorName: event.target.value })} /></Field><Field label="Munkaállomás"><input aria-label="Próba munkaállomás" className={inputClass} value={activeSession.workstation} onChange={(event) => updateSession(activeSession.id, { workstation: event.target.value })} /></Field></div>
        <button type="button" onClick={() => deleteSession(activeSession.id)} className="survey-action-secondary text-rose-700"><Trash2 size={15} /> Törlés</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Haladás" value={`${activeSummary?.progressPercent || 0}%`} />
        <MetricCard label="Próbált mező" value={activeSummary?.testedFieldCount || 0} />
        <MetricCard label="Visszaigazolt" value={activeSummary?.verifiedFieldCount || 0} tone="good" />
        <MetricCard label="Pontosított" value={activeSummary?.adjustedFieldCount || 0} tone="warn" />
        <MetricCard label="Blokkolt" value={activeSummary?.blockedFieldCount || 0} tone={activeSummary?.blockedFieldCount ? "bad" : "good"} />
        <MetricCard label="Rögzített idő" value={`${Math.round((activeSummary?.durationSeconds || 0) / 60)} perc`} />
      </div>


      <section data-winwatt-guided-trial="true" className="grid gap-4 rounded-2xl border border-violet-300 bg-gradient-to-br from-violet-50 to-cyan-50 p-4 text-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-[9px] font-black uppercase tracking-[0.12em] text-violet-700">Vezetett WinWatt-próba</div><div className="mt-1 text-base font-black">Aktuális mező végigvezetése</div><div className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-600">Másold át a DIMPRO értéket a WinWattba, ellenőrizd a célablakot és a mezőfeliratot, majd zárd le a mezőt egy gyors státusszal. A mezőidő automatikusan mérhető.</div></div>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 text-[10px] font-black"><input data-winwatt-guided-auto-advance type="checkbox" checked={autoAdvance} onChange={(event) => setAutoAdvance(event.target.checked)} className="h-5 w-5 accent-violet-700" /> Automatikus továbblépés</label>
        </div>

        {selectedField && selectedTrial ? <div data-winwatt-guided-current={selectedField.id} className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid gap-3 rounded-2xl border border-white/80 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="text-[9px] font-black uppercase tracking-[0.09em] text-violet-700">{selectedField.sourceTableLabel}</div><div className="mt-1 text-xl font-black">{selectedField.sourceColumnLabel}</div><div className="mt-1 break-all font-mono text-[9px] text-slate-500">{selectedField.sourcePath}</div></div><span className={`rounded-full border px-3 py-1 text-[9px] font-black ${fieldTone(selectedTrial.status)}`}>{winWattTrialFieldStatusLabels[selectedTrial.status]}</span></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-500">Tervezett WinWatt cél</div><div className="mt-1 text-sm font-black">{selectedTrial.targetWindow || selectedField.targetGroupLabel}</div><div className="mt-1 text-xs font-semibold text-slate-600">{selectedTrial.targetTab || "Célfül még nincs visszaigazolva"} · {selectedTrial.targetFieldLabel || selectedField.targetFieldLabel}</div></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-500">DIMPRO forrásérték</div>{selectedSourceValues.length ? <><div className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-words font-mono text-xs font-black">{selectedSourceValues.slice(0, 6).join("\n")}</div><div className="mt-1 text-[9px] font-semibold text-slate-500">{selectedSourceRecords.length} rekord · {selectedSourceValues.length} különböző érték</div></> : <div className="mt-1 text-xs font-bold text-amber-700">Nincs másolható, kitöltött forrásérték.</div>}</div></div>
            <div className="flex flex-wrap gap-2"><button type="button" data-winwatt-guided-copy disabled={sessionLocked || !selectedSourceText} onClick={() => void copySelectedSourceValues()} className="survey-action-primary disabled:cursor-not-allowed disabled:opacity-45"><ClipboardCopy size={16} /> DIMPRO érték másolása</button>{selectedTrial.entryStartedAt ? <button type="button" data-winwatt-guided-action="pause" disabled={sessionLocked} onClick={pauseSelectedField} className="survey-action-secondary"><PauseCircle size={16} /> Időmérés szünet</button> : <button type="button" data-winwatt-guided-action="start" disabled={sessionLocked} onClick={startSelectedField} className="survey-action-secondary"><Play size={16} /> Mezőpróba indítása</button>}<button type="button" data-winwatt-guided-action="restart" disabled={sessionLocked} onClick={restartSelectedFieldTimer} className="survey-action-secondary"><RefreshCw size={16} /> Idő újraindítása</button><button type="button" data-winwatt-guided-next onClick={selectNextUntested} className="survey-action-secondary"><ArrowRight size={16} /> Következő hiányzó</button></div>
            {copyState !== "idle" ? <div data-winwatt-guided-copy-state={copyState} className={`rounded-xl border px-3 py-2 text-xs font-black ${copyState === "copied" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : copyState === "empty" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-rose-300 bg-rose-50 text-rose-800"}`}>{copyState === "copied" ? "A DIMPRO érték a vágólapra került, az időmérés fut." : copyState === "empty" ? "Ehhez a mezőhöz nincs másolható DIMPRO forrásérték." : "A vágólapra másolás nem sikerült; az érték kézzel kijelölhető."}</div> : null}
          </div>

          <div className="grid content-start gap-3 rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-center"><div className="text-[8px] font-black uppercase tracking-[0.1em] text-violet-700">Aktuális mezőidő</div><div data-winwatt-guided-elapsed className="mt-1 font-mono text-3xl font-black text-violet-950">{formatDuration(selectedElapsedSeconds)}</div><div className="mt-1 text-[9px] font-bold text-violet-700">{selectedTrial.entryStartedAt ? "Időmérés folyamatban" : selectedTrial.durationSeconds ? "Rögzített idő" : "Még nem indult el"}</div></div>
            <div className="text-[9px] font-black uppercase tracking-[0.09em] text-slate-500">Gyors lezárás</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" data-winwatt-guided-status="matched" disabled={sessionLocked} onClick={() => completeSelectedField("matched")} className="min-h-12 rounded-xl border border-emerald-300 bg-emerald-50 px-2 text-[10px] font-black text-emerald-800 disabled:opacity-45"><CheckCircle2 size={16} className="mx-auto mb-1" /> Egyezik</button>
              <button type="button" data-winwatt-guided-status="targetAdjusted" disabled={sessionLocked} onClick={() => completeSelectedField("targetAdjusted")} className="min-h-12 rounded-xl border border-amber-300 bg-amber-50 px-2 text-[10px] font-black text-amber-900 disabled:opacity-45"><AlertTriangle size={16} className="mx-auto mb-1" /> Cél pontosítva</button>
              <button type="button" data-winwatt-guided-status="unitAdjusted" disabled={sessionLocked} onClick={() => completeSelectedField("unitAdjusted")} className="min-h-12 rounded-xl border border-amber-300 bg-amber-50 px-2 text-[10px] font-black text-amber-900 disabled:opacity-45"><RefreshCw size={16} className="mx-auto mb-1" /> Egység pontosítva</button>
              <button type="button" data-winwatt-guided-status="manualOnly" disabled={sessionLocked} onClick={() => completeSelectedField("manualOnly")} className="min-h-12 rounded-xl border border-sky-300 bg-sky-50 px-2 text-[10px] font-black text-sky-900 disabled:opacity-45"><Hand size={16} className="mx-auto mb-1" /> Csak kézi</button>
              <button type="button" data-winwatt-guided-status="skipped" disabled={sessionLocked} onClick={() => completeSelectedField("skipped")} className="min-h-12 rounded-xl border border-slate-300 bg-slate-100 px-2 text-[10px] font-black text-slate-700 disabled:opacity-45"><SkipForward size={16} className="mx-auto mb-1" /> Kihagyott</button>
              <button type="button" data-winwatt-guided-status="blocked" disabled={sessionLocked} onClick={() => completeSelectedField("blocked")} className="min-h-12 rounded-xl border border-rose-300 bg-rose-50 px-2 text-[10px] font-black text-rose-800 disabled:opacity-45"><XCircle size={16} className="mx-auto mb-1" /> Blokkolt</button>
            </div>
          </div>
        </div> : null}

        {blockedFields.length ? <details data-winwatt-guided-blocked-list className="rounded-xl border border-rose-300 bg-rose-50"><summary className="cursor-pointer px-3 py-3 text-xs font-black text-rose-900">Blokkolt mezők ({blockedFields.length})</summary><div className="grid gap-2 border-t border-rose-200 p-3">{blockedFields.map((field) => { const mapField = fieldMapById.get(field.fieldMapId); return <button key={field.id} type="button" onClick={() => selectTrialField(field.fieldMapId)} className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-left text-xs font-black text-rose-900"><AlertTriangle size={14} className="mr-2 inline" />{mapField?.sourceTableLabel || field.sourceTableId} · {mapField?.sourceColumnLabel || field.sourceColumnKey}<span className="mt-1 block text-[9px] font-semibold text-rose-700">{field.note || "A blokkolás oka még nincs megadva."}</span></button>; })}</div></details> : null}
      </section>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3">
        <span className="text-[9px] font-black uppercase tracking-[0.08em] text-[var(--survey-muted)]">Munkamenet állapota</span>
        {(Object.entries(winWattTrialSessionStatusLabels) as Array<[WinWattTrialSessionStatus, string]>).map(([value, label]) => { const disabled = value === "completed" && !activeSummary?.readyToComplete; return <button key={value} type="button" data-winwatt-trial-status={value} disabled={disabled} title={disabled ? "A lezáráshoz minden alkalmazandó mezőt próbálni kell, blokkolt mező nélkül." : undefined} onClick={() => setSessionStatus(value)} className={`min-h-10 rounded-xl border px-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-45 ${activeSession.status === value ? "border-violet-500 bg-violet-700 text-white" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]"}`}>{label}</button>; })}
        <button type="button" data-winwatt-trial-next-untested onClick={selectNextUntested} className="survey-action-primary ml-auto">Következő még nem próbált <ArrowRight size={16} /></button>
      </div>

      <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 lg:grid-cols-[220px_220px_minmax(220px,1fr)]">
        <select aria-label="Próbanapló állapotszűrő" className={inputClass} value={fieldFilter} onChange={(event) => setFieldFilter(event.target.value as FieldFilter)}><option value="all">Minden próbaállapot</option>{(Object.entries(winWattTrialFieldStatusLabels) as Array<[WinWattTrialFieldStatus, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Próbanapló adatcsoport" className={inputClass} value={tableId} onChange={(event) => setTableId(event.target.value)}><option value="all">Minden adatcsoport</option>{fieldMap.tables.map((table) => <option key={table.tableId} value={table.tableId}>{table.tableLabel}</option>)}</select>
        <input aria-label="Keresés a WinWatt próbanaplóban" className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Forrásmező, célablak, célfelirat vagy megjegyzés…" />
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside data-winwatt-trial-field-list className="max-h-[72vh] overflow-y-auto rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-2">
          <div className="mb-2 px-2 text-[10px] font-black uppercase text-[var(--survey-muted)]">{filteredFields.length} mező</div>
          <div className="grid gap-2">{filteredFields.map((field) => { const trial = fieldResultByMapId.get(field.id); const status = trial?.status || "notTested"; return <button key={field.id} type="button" data-winwatt-trial-field={field.id} onClick={() => selectTrialField(field.id)} className={`rounded-xl border p-3 text-left ${selectedField?.id === field.id ? "border-violet-400 bg-violet-50 text-slate-950" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]"}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-xs font-black">{field.sourceColumnLabel}</div><div className="mt-1 truncate text-[9px] font-semibold text-[var(--survey-muted)]">{field.sourceTableLabel} → {trial?.targetFieldLabel || field.targetFieldLabel}</div></div><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black ${fieldTone(status)}`}>{winWattTrialFieldStatusLabels[status]}</span></div></button>; })}</div>
        </aside>

        <section data-winwatt-trial-field-editor className="min-w-0 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4">
          {selectedField && selectedTrial ? <div className="grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--survey-border)] pb-4"><div><div className="text-[9px] font-black uppercase tracking-[0.08em] text-violet-700">{selectedField.sourceTableLabel}</div><div className="mt-1 text-lg font-black text-[var(--survey-text)]">{selectedField.sourceColumnLabel}</div><div className="mt-1 font-mono text-[9px] text-[var(--survey-muted)]">{selectedField.sourcePath}</div></div><span className={`rounded-full border px-3 py-1 text-[9px] font-black ${fieldTone(selectedTrial.status)}`}>{winWattTrialFieldStatusLabels[selectedTrial.status]}</span></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Próbaállapot"><select aria-label="Mező próbaállapota" className={inputClass} value={selectedTrial.status} onChange={(event) => updateField(selectedField.id, { status: event.target.value as WinWattTrialFieldStatus })}>{(Object.entries(winWattTrialFieldStatusLabels) as Array<[WinWattTrialFieldStatus, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Beviteli mód"><select aria-label="Mező beviteli módja" className={inputClass} value={selectedTrial.inputMethod} onChange={(event) => updateField(selectedField.id, { inputMethod: event.target.value as WinWattTrialInputMethod })}>{(Object.entries(winWattTrialInputMethodLabels) as Array<[WinWattTrialInputMethod, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Beviteli sorrend"><OptionalNumberInput ariaLabel="Mező beviteli sorrendje" integer value={selectedTrial.entryOrder} onCommit={(entryOrder) => updateField(selectedField.id, { entryOrder })} /></Field><Field label="Idő (másodperc)"><OptionalNumberInput ariaLabel="Mező beviteli ideje" value={selectedTrial.durationSeconds} onCommit={(durationSeconds) => updateField(selectedField.id, { durationSeconds })} /></Field></div>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="WinWatt célablak"><input aria-label="WinWatt célablak" className={inputClass} value={selectedTrial.targetWindow} onChange={(event) => updateField(selectedField.id, { targetWindow: event.target.value })} /></Field><Field label="WinWatt célfül"><input aria-label="WinWatt célfül" className={inputClass} value={selectedTrial.targetTab} onChange={(event) => updateField(selectedField.id, { targetTab: event.target.value })} /></Field><Field label="Pontos célfelirat"><input aria-label="WinWatt pontos célfelirat" className={inputClass} value={selectedTrial.targetFieldLabel} onChange={(event) => updateField(selectedField.id, { targetFieldLabel: event.target.value })} /></Field><Field label="Pontos mértékegység"><input aria-label="WinWatt pontos mértékegység" className={inputClass} value={selectedTrial.targetUnit} onChange={(event) => updateField(selectedField.id, { targetUnit: event.target.value })} /></Field></div>
            <Field label="WinWattban látott vagy bevitt érték"><input aria-label="WinWattban látott érték" className={inputClass} value={selectedTrial.observedValue} onChange={(event) => updateField(selectedField.id, { observedValue: event.target.value })} /></Field>
            <Field label="Próbamegjegyzés"><textarea aria-label="Mező próbamegjegyzése" className={textareaClass} value={selectedTrial.note} onChange={(event) => updateField(selectedField.id, { note: event.target.value })} placeholder="Eltérő ablaknév, mezősorrend, mértékegység, másolási nehézség vagy hiba…" /></Field>
          </div> : <div className="p-8 text-center text-xs font-bold text-[var(--survey-muted)]">Nincs kiválasztott mező.</div>}
        </section>
      </div>

      <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black text-[var(--survey-text)]">DIMPRO–WinWatt eredmény-összevetés</div><div className="mt-1 text-[10px] font-semibold leading-4 text-[var(--survey-muted)]">A DIMPRO által már számított mutatók mellett rögzíthető a WinWatt eredmény. Éves energetikai mutatónál a DIMPRO mező üres marad, amíg nincs validált havi motor.</div></div><Clock3 size={19} className="text-violet-700" /></div>
        <div className="mt-4 grid gap-3">{activeSession.resultComparisons.map((metric) => {
          const difference = metric.dimproValue !== undefined && metric.winWattValue !== undefined ? metric.winWattValue - metric.dimproValue : undefined;
          const percent = difference !== undefined && metric.dimproValue ? difference / Math.abs(metric.dimproValue) * 100 : undefined;
          return <div key={metric.id} data-winwatt-trial-metric={metric.metricKey} className="grid gap-3 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 lg:grid-cols-[minmax(180px,1fr)_150px_150px_150px_minmax(180px,1fr)] lg:items-end"><div><div className="text-xs font-black text-[var(--survey-text)]">{metric.label}</div><div className="mt-1 text-[9px] font-semibold text-[var(--survey-muted)]">{metric.unit} · absz. tűrés: {metric.toleranceAbsolute ?? "–"} · relatív tűrés: {metric.tolerancePercent ?? "–"}%</div></div><Field label="DIMPRO"><input readOnly className={inputClass} value={formatNumber(metric.dimproValue)} /></Field><Field label="WinWatt"><OptionalNumberInput ariaLabel={`${metric.label} WinWatt érték`} value={metric.winWattValue} onCommit={(winWattValue) => updateMetric(metric.id, { winWattValue, status: calculateComparisonStatus(metric, winWattValue) })} /></Field><div className={`min-h-10 rounded-xl border px-3 py-2 text-center text-[10px] font-black ${comparisonTone(metric.status)}`}><div>{winWattTrialComparisonStatusLabels[metric.status]}</div>{difference !== undefined ? <div className="mt-1 text-[9px]">Δ {difference.toFixed(4).replace(".", ",")} {metric.unit}{percent !== undefined ? ` · ${percent.toFixed(2).replace(".", ",")}%` : ""}</div> : null}</div><Field label="Megjegyzés"><input aria-label={`${metric.label} összevetési megjegyzés`} className={inputClass} value={metric.note} onChange={(event) => updateMetric(metric.id, { note: event.target.value })} /></Field></div>;
        })}</div>
      </div>

      <Field label="Munkamenet összefoglaló megjegyzés"><textarea aria-label="Próba munkamenet megjegyzése" className={textareaClass} value={activeSession.note} onChange={(event) => updateSession(activeSession.id, { note: event.target.value })} /></Field>
      <div className={`rounded-xl border p-3 text-xs font-bold leading-5 ${activeSummary?.readyToComplete ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-950"}`}>{activeSummary?.readyToComplete ? <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} /> Minden alkalmazandó mező próbastátuszt kapott, blokkolt mező nincs. A munkamenet lezárható.</span> : `A lezáráshoz még ${activeSummary?.notTestedFieldCount || 0} mező próbája hiányzik, blokkolt mező: ${activeSummary?.blockedFieldCount || 0}.`}</div>
    </>}

    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">{result.disclaimer}</div>
  </div>;
}
