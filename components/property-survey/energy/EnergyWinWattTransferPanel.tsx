"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileCheck2, PackageCheck, Search, ShieldAlert } from "lucide-react";
import type { WinWattTrialFeedbackResult, WinWattTrialMetricSeed, WinWattTrialWorkspace } from "@/components/energy/domain/energyWinWattTrialTypes";
import { EnergyWinWattTrialPanel } from "@/components/property-survey/energy/EnergyWinWattTrialPanel";
import {
  winWattFieldReadinessLabels,
  winWattTargetVerificationLabels,
  winWattTransferModeLabels,
  winWattTransferRequirementLabels,
  type WinWattFieldMapResult,
  type WinWattFieldReadinessStatus,
} from "@/components/energy/domain/energyWinWattTransferTypes";

type Props = {
  result: WinWattFieldMapResult;
  trialWorkspace: WinWattTrialWorkspace;
  trialResult: WinWattTrialFeedbackResult;
  trialMetricSeeds: WinWattTrialMetricSeed[];
  exporting?: boolean;
  onExportWorkbook: () => void;
  onExportTrialPackage: () => void;
  onTrialWorkspaceChange: (workspace: WinWattTrialWorkspace) => void;
};

type Filter = "all" | WinWattFieldReadinessStatus;

const filterLabels: Record<Filter, string> = {
  all: "Minden mező",
  ready: "Átadásra kész",
  reviewRequired: "Ellenőrzendő",
  blocked: "Blokkolt",
  notApplicable: "Nem alkalmazandó",
};

function readinessTone(status: WinWattFieldReadinessStatus) {
  if (status === "ready") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "blocked") return "border-rose-300 bg-rose-50 text-rose-800";
  if (status === "reviewRequired") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-950" : tone === "bad" ? "border-rose-300 bg-rose-50 text-rose-900" : "border-[var(--survey-border)] bg-[var(--survey-panel)] text-[var(--survey-text)]";
  return <div className={`rounded-xl border p-3 ${toneClass}`}><div className="text-[9px] font-black uppercase tracking-[0.08em]">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>;
}

export function EnergyWinWattTransferPanel({ result, trialWorkspace, trialResult, trialMetricSeeds, exporting = false, onExportWorkbook, onExportTrialPackage, onTrialWorkspaceChange }: Props) {
  const [view, setView] = useState<"readiness" | "trial">("readiness");
  const [filter, setFilter] = useState<Filter>("all");
  const [tableId, setTableId] = useState("all");
  const [query, setQuery] = useState("");
  const filteredFields = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("hu-HU");
    return result.fields.filter((field) => {
      if (filter !== "all" && field.readiness !== filter) return false;
      if (tableId !== "all" && field.sourceTableId !== tableId) return false;
      if (!normalized) return true;
      return [field.sourceTableLabel, field.sourceColumnLabel, field.sourcePath, field.targetGroupLabel, field.targetFieldKey, field.targetFieldLabel, field.readinessMessage]
        .some((value) => String(value || "").toLocaleLowerCase("hu-HU").includes(normalized));
    });
  }, [filter, query, result.fields, tableId]);

  const blockingMessages = result.validationMessages.filter((message) => message.severity === "blocking");
  const warningMessages = result.validationMessages.filter((message) => message.severity === "warning");

  return <div className="grid gap-4" data-energy-winwatt-transfer="true">
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-2">
      <button type="button" data-winwatt-transfer-view="readiness" onClick={() => setView("readiness")} className={`min-h-11 rounded-xl px-3 text-xs font-black ${view === "readiness" ? "bg-cyan-700 text-white" : "bg-[var(--survey-panel)] text-[var(--survey-text)]"}`}>Átadási készültség</button>
      <button type="button" data-winwatt-transfer-view="trial" onClick={() => setView("trial")} className={`min-h-11 rounded-xl px-3 text-xs font-black ${view === "trial" ? "bg-violet-700 text-white" : "bg-[var(--survey-panel)] text-[var(--survey-text)]"}`}>Próbanapló {trialResult.totals.sessionCount ? `(${trialResult.totals.sessionCount})` : ""}</button>
    </div>
    {view === "trial" ? <EnergyWinWattTrialPanel workspace={trialWorkspace} result={trialResult} fieldMap={result} metricSeeds={trialMetricSeeds} onChange={onTrialWorkspaceChange} /> : <div className="grid gap-4" data-winwatt-readiness-view="true">
    <div className={`rounded-2xl border p-4 ${result.readyForTrialTransfer ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-rose-300 bg-rose-50 text-rose-950"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white ${result.readyForTrialTransfer ? "bg-emerald-700" : "bg-rose-700"}`}>{result.readyForTrialTransfer ? <PackageCheck size={21} /> : <ShieldAlert size={21} />}</span>
          <div><div className="text-base font-black">WinWatt mezőtérkép és próbaátadás</div><div className="mt-1 max-w-4xl text-xs font-semibold leading-5">A DIMPRO mezők forrását, céladatcsoportját, mértékegységét és átadási készültségét ellenőrzi. Nem használ kitalált WinWatt belső mezőazonosítókat; a pontos célfeliratokat valós próbaátadás során kell igazolni.</div></div>
        </div>
        <span data-winwatt-trial-readiness className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${result.readyForTrialTransfer ? "border-emerald-400 bg-white text-emerald-800" : "border-rose-400 bg-white text-rose-800"}`}>{result.readyForTrialTransfer ? "Próbaátadás indítható" : `${result.totals.blockedFieldCount} blokkolt mező`}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={exporting} onClick={onExportWorkbook} className="survey-action-secondary disabled:opacity-50"><Download size={16} /> {exporting ? "Excel készül…" : "20 lapos Excel"}</button>
        <button type="button" disabled={exporting} onClick={onExportTrialPackage} data-export-winwatt-trial-package className="survey-action-primary disabled:opacity-50"><PackageCheck size={16} /> {result.readyForTrialTransfer ? "Próbaátadási ZIP" : "Diagnosztikai ZIP"}</button>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric label="Adatcsoport" value={result.totals.tableCount} />
      <Metric label="Leképezett mező" value={result.totals.mappedFieldCount} />
      <Metric label="Átadási rekord" value={result.totals.transferRecordCount} />
      <Metric label="Átadásra kész" value={result.totals.readyFieldCount} tone="good" />
      <Metric label="Ellenőrzendő" value={result.totals.reviewFieldCount} tone="warn" />
      <Metric label="Blokkolt" value={result.totals.blockedFieldCount} tone={result.totals.blockedFieldCount ? "bad" : "good"} />
    </div>

    <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 lg:grid-cols-[220px_220px_minmax(240px,1fr)]">
      <select aria-label="WinWatt mezőtérkép készültségi szűrő" value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="h-11 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-xs font-black text-[var(--survey-text)]">{Object.entries(filterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="WinWatt mezőtérkép adatcsoport" value={tableId} onChange={(event) => setTableId(event.target.value)} className="h-11 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-xs font-black text-[var(--survey-text)]"><option value="all">Minden adatcsoport</option>{result.tables.map((table) => <option key={table.tableId} value={table.tableId}>{table.tableLabel}</option>)}</select>
      <label className="flex h-11 items-center gap-2 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3"><Search size={15} className="text-[var(--survey-muted)]" /><input aria-label="Keresés a WinWatt mezőtérképben" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Forrásmező, célmező vagy célkulcs…" className="min-w-0 flex-1 bg-transparent text-xs font-bold text-[var(--survey-text)] outline-none" /></label>
    </div>

    <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="grid content-start gap-2 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-2">
        {result.tables.map((table) => <button type="button" key={table.tableId} data-winwatt-table-readiness={table.readiness} onClick={() => setTableId(table.tableId)} className={`rounded-xl border p-3 text-left ${tableId === table.tableId ? "border-cyan-400 bg-cyan-50 text-slate-950" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]"}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-black">{table.tableLabel}</span><span className={`rounded-full border px-2 py-0.5 text-[8px] font-black ${readinessTone(table.readiness)}`}>{winWattFieldReadinessLabels[table.readiness]}</span></div><div className="mt-2 grid grid-cols-3 gap-1 text-center text-[9px] font-black"><span className="rounded bg-emerald-50 px-1 py-1 text-emerald-800">{table.readyFieldCount} kész</span><span className="rounded bg-amber-50 px-1 py-1 text-amber-900">{table.reviewFieldCount} ellenőrzés</span><span className="rounded bg-rose-50 px-1 py-1 text-rose-800">{table.blockedFieldCount} blokkolt</span></div></button>)}
      </aside>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--survey-border)] p-3"><div><div className="text-sm font-black text-[var(--survey-text)]">Mezőszintű átadási szerződés</div><div className="mt-1 text-[10px] font-semibold text-[var(--survey-muted)]">{filteredFields.length} / {result.fields.length} mező</div></div><FileCheck2 size={20} className="text-cyan-700" /></div>
        <div className="max-h-[70vh] overflow-auto" data-winwatt-field-map-scroll>
          <table className="min-w-[1180px] border-collapse text-left text-[10px]">
            <thead className="sticky top-0 z-20 bg-slate-100 text-slate-800"><tr>{["Forrásadat", "Forrásútvonal", "Céladatcsoport", "Célkulcs / felirat", "Egység", "Kötelezőség", "Átadás", "Célellenőrzés", "Készültség", "Lefedettség"].map((label) => <th key={label} className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2.5 font-black uppercase tracking-[0.05em]">{label}</th>)}</tr></thead>
            <tbody>{filteredFields.map((field, index) => <tr key={field.id} className={index % 2 ? "bg-[var(--survey-panel-strong)]" : "bg-[var(--survey-panel)]"} data-winwatt-field-status={field.readiness}><td className="sticky left-0 z-10 border-b border-r border-[var(--survey-border)] bg-inherit px-3 py-2 font-black"><div>{field.sourceTableLabel}</div><div className="mt-1 text-[9px] font-semibold text-[var(--survey-muted)]">{field.sourceColumnLabel}</div></td><td className="border-b border-r border-[var(--survey-border)] px-3 py-2 font-mono text-[9px]">{field.sourcePath}</td><td className="border-b border-r border-[var(--survey-border)] px-3 py-2 font-semibold">{field.targetGroupLabel}</td><td className="border-b border-r border-[var(--survey-border)] px-3 py-2"><div className="font-mono text-[9px]">{field.targetFieldKey}</div><div className="mt-1 font-bold">{field.targetFieldLabel}</div></td><td className="border-b border-r border-[var(--survey-border)] px-3 py-2 font-bold">{field.targetUnit || field.sourceUnit || "–"}</td><td className="border-b border-r border-[var(--survey-border)] px-3 py-2">{winWattTransferRequirementLabels[field.requirement]}</td><td className="border-b border-r border-[var(--survey-border)] px-3 py-2">{winWattTransferModeLabels[field.transferMode]}</td><td className="border-b border-r border-[var(--survey-border)] px-3 py-2">{winWattTargetVerificationLabels[field.targetVerification]}</td><td className="border-b border-r border-[var(--survey-border)] px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black ${readinessTone(field.readiness)}`}>{winWattFieldReadinessLabels[field.readiness]}</span><div className="mt-1 max-w-[300px] whitespace-normal text-[9px] font-semibold leading-4 text-[var(--survey-muted)]">{field.readinessMessage}</div></td><td className="border-b border-r border-[var(--survey-border)] px-3 py-2 font-bold">{field.populatedCount}/{field.recordCount}<div className="mt-1 text-[9px] text-[var(--survey-muted)]">hiányzó: {field.missingCount} · hibás: {field.invalidCount}</div></td></tr>)}</tbody>
          </table>
          {!filteredFields.length ? <div className="p-8 text-center text-xs font-bold text-[var(--survey-muted)]">Nincs a szűrésnek megfelelő mező.</div> : null}
        </div>
      </section>
    </div>

    <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4">
      <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black text-[var(--survey-text)]">Átadás előtti ellenőrzési lista</div><div className="mt-1 text-[10px] font-semibold text-[var(--survey-muted)]">{blockingMessages.length} blokkoló · {warningMessages.length} ellenőrzendő</div></div>{blockingMessages.length ? <AlertTriangle size={20} className="text-rose-600" /> : <CheckCircle2 size={20} className="text-emerald-600" />}</div>
      <div className="mt-3 grid gap-2">{result.validationMessages.slice(0, 40).map((message) => <div key={message.id} className={`rounded-xl border p-3 text-xs font-bold leading-5 ${message.severity === "blocking" ? "border-rose-300 bg-rose-50 text-rose-900" : message.severity === "warning" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}><div className="text-[9px] font-black uppercase">{message.code}</div><div className="mt-1">{message.message}</div></div>)}</div>
    </div>

    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">{result.disclaimer}</div>
  </div>}
  </div>;
}
