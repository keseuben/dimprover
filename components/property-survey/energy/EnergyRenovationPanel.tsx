"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ClipboardList, Filter, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  energyDataStatusLabels,
  type EnergyDataStatus,
  type EnergyWorkspaceMode,
} from "@/components/energy/domain/energyFieldWorkflowTypes";
import type { EnergyRenovationComparisonSetResult } from "@/components/energy/domain/energyRenovationComparisonTypes";
import {
  createEnergyRenovationMeasure,
  createProposalRenovationScenario,
  energyRenovationCategoryLabels,
  energyRenovationEffectLabels,
  getRenovationMeasureTemplates,
  type EnergyRenovationMeasure,
  type EnergyRenovationMeasureCategory,
  type EnergyRenovationScenario,
  type EnergyRenovationWorkspace,
} from "@/components/energy/domain/energyRenovationTypes";
import { EnergyRenovationComparisonPanel } from "@/components/property-survey/energy/EnergyRenovationComparisonPanel";
import {
  EnergyAdvancedDetails,
  EnergyFieldHelp,
  EnergyFieldIntro,
  EnergyFieldStatusBadge,
  EnergyRequiredLabel,
} from "@/components/property-survey/energy/EnergyFieldUi";

type Props = {
  workspace: EnergyRenovationWorkspace;
  comparison: EnergyRenovationComparisonSetResult;
  mode: EnergyWorkspaceMode;
  onChange: (workspace: EnergyRenovationWorkspace) => void;
  onGenerateSuggestions: () => { addedCount: number; updatedCount: number; suggestionCount: number };
};

type MeasureFilter = "all" | "included" | "incomplete";

const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";

function parseNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function DecimalOptionalInput({ value, onCommit, ariaLabel }: { value?: number; onCommit: (value?: number) => void; ariaLabel: string }) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value).replace(".", ","));
  useEffect(() => setDraft(value === undefined ? "" : String(value).replace(".", ",")), [value]);
  return <input aria-label={ariaLabel} inputMode="decimal" className={inputClass} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { const next = parseNumber(draft); onCommit(next); setDraft(next === undefined ? "" : String(next).replace(".", ",")); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}

function Field({ label, optional = false, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return <label><EnergyRequiredLabel optional={optional}>{label}</EnergyRequiredLabel>{children}</label>;
}

function getMeasureMissingFields(measure: EnergyRenovationMeasure) {
  const missing: string[] = [];
  if (!measure.title.trim()) missing.push("megnevezés");
  if (!measure.proposedDescription.trim()) missing.push("beavatkozás");
  if (!measure.sourceReference.trim()) missing.push("forrás");
  return missing;
}

export function EnergyRenovationPanel({ workspace, comparison, mode, onChange, onGenerateSuggestions }: Props) {
  const [templateCategory, setTemplateCategory] = useState<EnergyRenovationMeasureCategory>("externalWall");
  const [generationMessage, setGenerationMessage] = useState("");
  const [measureFilter, setMeasureFilter] = useState<MeasureFilter>("all");
  const templates = useMemo(() => getRenovationMeasureTemplates(), []);
  const expertMode = mode === "expert";
  const activeScenario = workspace.scenarios.find((scenario) => scenario.id === workspace.activeScenarioId)
    || workspace.scenarios.find((scenario) => scenario.kind === "proposal")
    || workspace.scenarios[0];
  const proposalScenarios = workspace.scenarios.filter((scenario) => scenario.kind === "proposal");
  const includedCount = activeScenario?.measures.filter((measure) => measure.included).length || 0;
  const incompleteMeasures = activeScenario?.measures.filter((measure) => measure.included && getMeasureMissingFields(measure).length > 0) || [];
  const incompleteCount = incompleteMeasures.length;
  const filteredMeasures = useMemo(() => {
    const measures = activeScenario?.measures || [];
    if (measureFilter === "included") return measures.filter((measure) => measure.included);
    if (measureFilter === "incomplete") return measures.filter((measure) => measure.included && getMeasureMissingFields(measure).length > 0);
    return measures;
  }, [activeScenario?.measures, measureFilter]);

  function commit(next: EnergyRenovationWorkspace) {
    onChange({ ...next, updatedAt: new Date().toISOString() });
  }
  function updateScenario(id: string, patch: Partial<EnergyRenovationScenario>) {
    commit({ ...workspace, scenarios: workspace.scenarios.map((scenario) => scenario.id === id ? { ...scenario, ...patch, updatedAt: new Date().toISOString() } : scenario) });
  }
  function addScenario() {
    const nextIndex = Math.max(1, ...proposalScenarios.map((scenario) => Number(scenario.code.match(/\d+/)?.[0]) || 0)) + 1;
    const scenario = createProposalRenovationScenario(nextIndex);
    commit({ ...workspace, activeScenarioId: scenario.id, scenarios: [...workspace.scenarios, scenario] });
  }
  function deleteScenario(id: string) {
    const scenario = workspace.scenarios.find((item) => item.id === id);
    if (!scenario || scenario.kind === "existing") return;
    const scenarios = workspace.scenarios.filter((item) => item.id !== id);
    const nextActive = scenarios.find((item) => item.kind === "proposal")?.id || "scenario-existing";
    commit({ ...workspace, activeScenarioId: nextActive, scenarios });
  }
  function addTemplate() {
    if (!activeScenario || activeScenario.kind !== "proposal") return;
    const template = templates.find((item) => item.category === templateCategory);
    if (!template) return;
    const measure = createEnergyRenovationMeasure(template.category, {
      title: template.title,
      proposedDescription: template.proposedDescription,
      effectLevel: template.effectLevel,
      unit: template.unit,
      dataStatus: "estimated",
      sourceReference: "Helyszíni szakmai javaslat – véglegesítés szükséges",
    });
    updateScenario(activeScenario.id, { measures: [...activeScenario.measures, measure], status: "reviewRequired" });
  }
  function updateMeasure(measureId: string, patch: Partial<EnergyRenovationMeasure>) {
    if (!activeScenario || activeScenario.kind !== "proposal") return;
    updateScenario(activeScenario.id, { measures: activeScenario.measures.map((measure) => measure.id === measureId ? { ...measure, ...patch, updatedAt: new Date().toISOString() } : measure), status: "reviewRequired" });
  }
  function deleteMeasure(measureId: string) {
    if (!activeScenario || activeScenario.kind !== "proposal") return;
    updateScenario(activeScenario.id, { measures: activeScenario.measures.filter((measure) => measure.id !== measureId), status: "reviewRequired" });
  }
  function generateSuggestions() {
    const result = onGenerateSuggestions();
    setGenerationMessage(`${result.suggestionCount} számított javaslat · ${result.addedCount} új · ${result.updatedCount} frissített`);
  }
  function openFirstIncomplete() {
    const first = incompleteMeasures[0];
    if (!first) return;
    setMeasureFilter("incomplete");
    window.setTimeout(() => {
      const details = document.querySelector<HTMLDetailsElement>(`[data-renovation-measure="${first.id}"]`);
      if (!details) return;
      details.open = true;
      details.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  return <div className="grid gap-4" data-energy-renovation-panel="true">
    <EnergyFieldIntro
      icon={<ClipboardList size={21} />}
      eyebrow="Terepi felújítási lépés"
      title="Felújítási változatok és javaslatok"
      description="A számításból készített javaslatokat először válaszd ki, majd minden beválasztott intézkedésnél ellenőrizd a tervezett beavatkozást és az adatforrást."
      status={incompleteCount ? `${incompleteCount} hiányos intézkedés` : includedCount ? `${includedCount} intézkedés előkészítve` : "Nincs beválasztott intézkedés"}
      statusTone={incompleteCount ? "warning" : includedCount ? "complete" : "neutral"}
    >
      <div className="flex flex-wrap gap-2"><button type="button" data-generate-renovation-suggestions onClick={generateSuggestions} className="survey-action-primary"><Sparkles size={17} /> Javaslatok a számításból</button>{incompleteCount ? <button type="button" data-open-first-incomplete-measure onClick={openFirstIncomplete} className="survey-action-secondary bg-white text-slate-950">Első hiányos megnyitása <ArrowRight size={16} /></button> : null}</div>
      {generationMessage ? <div className="mt-3 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-black">{generationMessage}</div> : null}
    </EnergyFieldIntro>

    <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">{workspace.scenarios.map((scenario) => {
        const scenarioIncomplete = scenario.measures.filter((measure) => measure.included && getMeasureMissingFields(measure).length > 0).length;
        return <button key={scenario.id} type="button" data-renovation-scenario={scenario.id} onClick={() => commit({ ...workspace, activeScenarioId: scenario.id })} className={`rounded-xl border px-3 py-3 text-left ${activeScenario?.id === scenario.id ? "border-cyan-400 bg-cyan-50 text-slate-950" : "border-[var(--survey-border)] bg-[var(--survey-panel-strong)] text-[var(--survey-text)]"}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-black">{scenario.code}</span>{scenarioIncomplete ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[8px] font-black text-amber-800">{scenarioIncomplete} hiányos</span> : <span className="text-[8px] font-black uppercase opacity-60">{scenario.kind === "existing" ? "Meglévő" : scenario.status}</span>}</div><div className="mt-1 truncate text-[10px] font-bold">{scenario.name}</div><div className="mt-1 text-[9px] font-semibold text-[var(--survey-muted)]">{scenario.measures.filter((measure) => measure.included).length}/{scenario.measures.length} beválasztva</div></button>;
      })}</div>
      <button type="button" data-add-renovation-scenario onClick={addScenario} className="survey-action-secondary"><Plus size={16} /> Új változat</button>
    </div>

    <EnergyRenovationComparisonPanel comparison={comparison} activeScenarioId={activeScenario?.id || workspace.activeScenarioId} mode={mode} />

    {activeScenario ? <div className="grid gap-4">
      <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.12em] text-cyan-700">Aktív változat · {activeScenario.code}</div><div className="mt-1 text-lg font-black text-[var(--survey-text)]">{activeScenario.name}</div><div className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-[var(--survey-muted)]">{activeScenario.description || "Ehhez a változathoz külön intézkedéslista és ellenőrzési státusz tartozik."}</div></div><EnergyFieldStatusBadge tone={incompleteCount ? "warning" : includedCount ? "complete" : "neutral"}>{activeScenario.kind === "existing" ? "Rögzített alapállapot" : incompleteCount ? "Kiegészítendő" : includedCount ? "Előkészítve" : "Vázlat"}</EnergyFieldStatusBadge></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3"><div className="text-[9px] font-black uppercase text-[var(--survey-muted)]">Összes intézkedés</div><div className="mt-1 text-2xl font-black text-[var(--survey-text)]">{activeScenario.measures.length}</div></div><div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-950"><div className="text-[9px] font-black uppercase">Beválasztva</div><div className="mt-1 text-2xl font-black">{includedCount}</div></div><div className={`rounded-xl border p-3 ${incompleteCount ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-300 bg-emerald-50 text-emerald-950"}`}><div className="text-[9px] font-black uppercase">Hiányos forrás / leírás</div><div className="mt-1 text-2xl font-black">{incompleteCount}</div></div></div>
      </div>

      <EnergyAdvancedDetails id="renovation-scenario" defaultOpen={expertMode} title="Változat részletes beállításai" description="Kód, megnevezés, státusz, részletes leírás és a változat törlése.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Változat kódja"><input className={inputClass} value={activeScenario.code} readOnly={activeScenario.kind === "existing"} onChange={(event) => updateScenario(activeScenario.id, { code: event.target.value })} /></Field><Field label="Megnevezés"><input className={inputClass} value={activeScenario.name} onChange={(event) => updateScenario(activeScenario.id, { name: event.target.value })} /></Field><Field label="Státusz"><select className={inputClass} value={activeScenario.status} disabled={activeScenario.kind === "existing"} onChange={(event) => updateScenario(activeScenario.id, { status: event.target.value as EnergyRenovationScenario["status"] })}><option value="draft">Vázlat</option><option value="reviewRequired">Szakmai ellenőrzés</option><option value="winwattReady">WinWatt-átadásra előkészítve</option><option value="validated">Validált</option></select></Field><div className="flex items-end">{activeScenario.kind === "proposal" && proposalScenarios.length > 1 ? <button type="button" onClick={() => deleteScenario(activeScenario.id)} className="survey-action-secondary w-full text-rose-700"><Trash2 size={16} /> Változat törlése</button> : <div className="w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 py-3 text-xs font-black text-[var(--survey-muted)]">{activeScenario.kind === "existing" ? "Rögzített alapállapot" : "Elsődleges helyszíni változat"}</div>}</div><div className="sm:col-span-2 xl:col-span-4"><Field label="Leírás"><textarea className="min-h-20 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 text-xs font-bold text-[var(--survey-text)]" value={activeScenario.description} onChange={(event) => updateScenario(activeScenario.id, { description: event.target.value })} /></Field></div></div>
      </EnergyAdvancedDetails>

      {activeScenario.kind === "proposal" ? <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-end"><Field label="Új intézkedéssablon"><select className={inputClass} value={templateCategory} onChange={(event) => setTemplateCategory(event.target.value as EnergyRenovationMeasureCategory)}>{templates.map((template) => <option key={template.category} value={template.category}>{template.title}</option>)}</select></Field><button type="button" data-add-renovation-measure onClick={addTemplate} className="survey-action-primary"><Plus size={16} /> Hozzáadás</button></div> : null}

      {activeScenario.kind === "existing" ? <EnergyFieldHelp>A meglévő állapot az alaprajz, rétegrendek, nyílászárók, zónák, gépészeti és megújuló adatok pillanatképe. Felújítási intézkedés csak tervezett változathoz kapcsolható.</EnergyFieldHelp> : null}

      {activeScenario.kind === "proposal" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3"><div className="flex items-center gap-2 text-xs font-black text-[var(--survey-text)]"><Filter size={16} className="text-cyan-700" /> Intézkedések szűrése</div><div className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-1">{([['all', `Mind (${activeScenario.measures.length})`], ['included', `Beválasztva (${includedCount})`], ['incomplete', `Hiányos (${incompleteCount})`]] as Array<[MeasureFilter, string]>).map(([value, label]) => <button key={value} type="button" data-renovation-filter={value} onClick={() => setMeasureFilter(value)} className={`min-h-9 rounded-lg px-2 text-[9px] font-black ${measureFilter === value ? "bg-cyan-700 text-white" : "text-[var(--survey-muted)]"}`}>{label}</button>)}</div></div> : null}

      {activeScenario.kind === "proposal" && !activeScenario.measures.length ? <div className="rounded-2xl border border-dashed border-[var(--survey-border)] p-8 text-center"><Sparkles size={28} className="mx-auto text-cyan-700" /><div className="mt-3 text-sm font-black text-[var(--survey-text)]">Még nincs felújítási intézkedés</div><div className="mt-2 text-xs font-semibold text-[var(--survey-muted)]">Generáld a javaslatokat a számításból, vagy adj hozzá sablont kézzel.</div></div> : null}

      {activeScenario.kind === "proposal" && activeScenario.measures.length > 0 && filteredMeasures.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--survey-border)] p-6 text-center text-xs font-bold text-[var(--survey-muted)]">A kiválasztott szűrésben nincs megjeleníthető intézkedés.</div> : null}

      {filteredMeasures.map((measure) => {
        const missing = getMeasureMissingFields(measure);
        return <details key={measure.id} data-renovation-measure={measure.id} data-renovation-measure-complete={missing.length === 0 ? "true" : "false"} className={`group rounded-2xl border bg-[var(--survey-panel)] ${measure.included ? missing.length ? "border-amber-300" : "border-cyan-300" : "border-[var(--survey-border)] opacity-75"}`}>
          <summary className="flex min-h-16 cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-3 marker:hidden">
            <div className="flex min-w-0 items-center gap-3"><label onClick={(event) => event.stopPropagation()} className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${measure.included ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-slate-300 bg-slate-100 text-slate-500"}`}><input type="checkbox" className="sr-only" checked={measure.included} onChange={(event) => updateMeasure(measure.id, { included: event.target.checked })} />{measure.included ? <Check size={18} /> : <span className="h-3 w-3 rounded border border-current" />}</label><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-700"><span>{energyRenovationCategoryLabels[measure.category]}</span><span>·</span><span>{energyRenovationEffectLabels[measure.effectLevel]}</span>{measure.included ? missing.length ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Hiányzik: {missing.join(", ")}</span> : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Alapadat rendben</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Nincs beválasztva</span>}</div><div className="mt-1 truncate text-sm font-black text-[var(--survey-text)]">{measure.title || "Névtelen intézkedés"}</div><div className="mt-1 line-clamp-1 text-[9px] font-semibold text-[var(--survey-muted)]">{measure.proposedDescription || "A tervezett beavatkozás még nincs megadva."}</div></div></div><span className="text-xl font-black text-cyan-700 transition group-open:rotate-45">+</span>
          </summary>
          <div className="grid gap-3 border-t border-[var(--survey-border)] p-3">
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3"><div className="text-[9px] font-black uppercase tracking-[0.1em] text-cyan-800">Helyszíni gyorsadatok</div><div className="mt-1 text-[10px] font-semibold text-cyan-900">A beválasztott intézkedéshez ezt a két mezőt mindig ellenőrizd.</div></div>
            <Field label="Tervezett beavatkozás"><textarea className="min-h-24 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 text-xs font-bold text-[var(--survey-text)]" value={measure.proposedDescription} onChange={(event) => updateMeasure(measure.id, { proposedDescription: event.target.value })} /></Field>
            <Field label="Adatforrás / ellenőrzési hivatkozás"><input className={inputClass} value={measure.sourceReference} onChange={(event) => updateMeasure(measure.id, { sourceReference: event.target.value })} placeholder="Helyszíni mérés, termékadatlap, számítási motor, WinWatt" /></Field>
            <EnergyAdvancedDetails id={`renovation-measure-${measure.id}`} defaultOpen={expertMode} title="Intézkedés részletes műszaki adatai" description="Kategória, hatásszint, meglévő állapot, célérték, mértékegység és kockázati megjegyzés.">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Kategória"><select className={inputClass} value={measure.category} onChange={(event) => updateMeasure(measure.id, { category: event.target.value as EnergyRenovationMeasureCategory })}>{Object.entries(energyRenovationCategoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="Megnevezés"><input className={inputClass} value={measure.title} onChange={(event) => updateMeasure(measure.id, { title: event.target.value })} /></Field><Field label="Várható hatás"><select className={inputClass} value={measure.effectLevel} onChange={(event) => updateMeasure(measure.id, { effectLevel: event.target.value as EnergyRenovationMeasure["effectLevel"] })}>{Object.entries(energyRenovationEffectLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="Adatstátusz"><select className={inputClass} value={measure.dataStatus} onChange={(event) => updateMeasure(measure.id, { dataStatus: event.target.value as EnergyDataStatus })}>{Object.entries(energyDataStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field></div>
              <div className="mt-3"><Field label="Meglévő állapot" optional><textarea className="min-h-20 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 text-xs font-bold text-[var(--survey-text)]" value={measure.existingDescription} onChange={(event) => updateMeasure(measure.id, { existingDescription: event.target.value })} /></Field></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="Jelenlegi érték" optional><DecimalOptionalInput ariaLabel={`${measure.title} jelenlegi érték`} value={measure.currentValue} onCommit={(value) => updateMeasure(measure.id, { currentValue: value })} /></Field><Field label="Célérték" optional><DecimalOptionalInput ariaLabel={`${measure.title} célérték`} value={measure.targetValue} onCommit={(value) => updateMeasure(measure.id, { targetValue: value })} /></Field><Field label="Mértékegység" optional><input className={inputClass} value={measure.unit || ""} onChange={(event) => updateMeasure(measure.id, { unit: event.target.value })} /></Field></div>
              <div className="mt-3"><Field label="Megjegyzés / kockázat" optional><textarea className="min-h-16 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 text-xs font-bold text-[var(--survey-text)]" value={measure.note} onChange={(event) => updateMeasure(measure.id, { note: event.target.value })} /></Field></div>
            </EnergyAdvancedDetails>
            <button type="button" onClick={() => deleteMeasure(measure.id)} className="survey-action-secondary justify-self-start text-rose-700"><Trash2 size={15} /> Intézkedés törlése</button>
          </div>
        </details>;
      })}
    </div> : null}

    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">A helyszíni felújítási javaslat tájékoztató és tervezés-előkészítő dokumentum. Nem minősül kivitelezői ajánlatnak, részletes kiviteli tervnek vagy hiteles energetikai tanúsítványnak.</div>
  </div>;
}
