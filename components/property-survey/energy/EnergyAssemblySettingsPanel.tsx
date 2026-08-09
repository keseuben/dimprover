"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Construction, ShieldCheck } from "lucide-react";
import type { EnergyAssemblyThermalResult } from "@/components/energy/domain/energyAssemblyTypes";
import { huEkm20231101AssemblyRequirements } from "@/components/energy/regulations/HU_EKM_2023_11_01/requirements";
import type { SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";

const inputClass = "h-10 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 text-xs font-bold text-[var(--survey-text)] outline-none focus:border-cyan-500";
const labelClass = "mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-[var(--survey-muted)]";

function format(value: number | null, digits = 3) {
  return value === null ? "–" : value.toLocaleString("hu-HU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function complianceLabel(value: EnergyAssemblyThermalResult["compliance"]) {
  if (value === "compliant") return "Megfelel";
  if (value === "notCompliant") return "Nem felel meg";
  if (value === "groundCalculationRequired") return "Talajszámítás szükséges";
  if (value === "notApplicable") return "Nem alkalmazandó";
  return "Nem számítható";
}

function complianceTone(value: EnergyAssemblyThermalResult["compliance"]) {
  if (value === "compliant") return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (value === "notCompliant" || value === "notCalculated") return "border-rose-300 bg-rose-50 text-rose-950";
  return "border-amber-300 bg-amber-50 text-amber-950";
}

type Props = {
  assembly: SurveyConstructionAssembly;
  result: EnergyAssemblyThermalResult | null;
  onUpdate: (patch: Partial<SurveyConstructionAssembly>) => void;
};

export function EnergyAssemblySettingsPanel({ assembly, result, onUpdate }: Props) {
  function updateCorrections(patch: Partial<SurveyConstructionAssembly["corrections"]>) {
    onUpdate({ corrections: { ...assembly.corrections, ...patch } });
  }
  function updateFastener(patch: Partial<SurveyConstructionAssembly["corrections"]["mechanicalFastener"]>) {
    updateCorrections({ mechanicalFastener: { ...assembly.corrections.mechanicalFastener, ...patch } });
  }

  return <section className="grid gap-3" data-energy-assembly-settings={assembly.id}>
    {result ? <div className={`rounded-2xl border p-3 ${result.blocked ? "border-rose-300 bg-rose-50 text-rose-950" : "border-cyan-300 bg-cyan-50 text-cyan-950"}`} data-assembly-result-card={assembly.id}>
      <div className="flex items-start gap-3">{result.blocked ? <AlertTriangle size={20} className="mt-0.5 shrink-0" /> : <ShieldCheck size={20} className="mt-0.5 shrink-0" />}<div className="min-w-0 flex-1"><div className="text-sm font-black">{result.blocked ? "A rétegrendi eredmény blokkolt" : `${format(result.effectiveUValueWm2K)} W/m²K`}</div><div className="mt-1 text-[10px] font-semibold leading-5">Rtot: {format(result.totalResistanceM2KPerW)} m²K/W · U₀: {format(result.baseUValueWm2K)} W/m²K · ΔU: {format(result.correction.appliedDeltaUWm2K, 4)} W/m²K</div></div></div>
      <div className={`mt-3 rounded-xl border px-3 py-2 text-[10px] font-black ${complianceTone(result.compliance)}`} data-assembly-compliance={result.compliance}>{complianceLabel(result.compliance)}{result.requirementMaximumUValueWm2K !== null ? ` · határérték ${format(result.requirementMaximumUValueWm2K)} W/m²K` : ""}</div>
    </div> : null}

    <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 sm:grid-cols-2">
      <label><span className={labelClass}>Hőáram iránya</span><select data-assembly-field="heatFlowDirection" className={inputClass} value={assembly.heatFlowDirection} onChange={(event) => onUpdate({ heatFlowDirection: event.target.value as SurveyConstructionAssembly["heatFlowDirection"] })}><option value="horizontal">Vízszintes</option><option value="upward">Felfelé</option><option value="downward">Lefelé</option></select></label>
      <label><span className={labelClass}>Határolási mód</span><select data-assembly-field="boundaryMode" className={inputClass} value={assembly.boundaryMode} onChange={(event) => onUpdate({ boundaryMode: event.target.value as SurveyConstructionAssembly["boundaryMode"] })}><option value="externalAir">Külső levegő felé</option><option value="internalUnheated">Belső, fűtetlen tér felé</option><option value="groundEquivalentRequired">Talajjal érintkező – egyenértékű számítás kell</option></select></label>
      <label><span className={labelClass}>Eredmény módja</span><select data-assembly-field="calculationMode" className={inputClass} value={assembly.calculationMode} onChange={(event) => onUpdate({ calculationMode: event.target.value as SurveyConstructionAssembly["calculationMode"] })}><option value="calculated">Számított U-érték</option><option value="declared">Deklarált U-érték használata</option></select></label>
      <label><span className={labelClass}>Szerkezeti összetettség</span><select data-assembly-field="complexity" className={inputClass} value={assembly.complexity} onChange={(event) => onUpdate({ complexity: event.target.value as SurveyConstructionAssembly["complexity"] })}><option value="homogeneous">Homogén rétegek</option><option value="variableThicknessAverage">Változó vastagság – átlaggal</option><option value="inhomogeneous">Inhomogén – részletes módszer kell</option></select></label>
      <label className="sm:col-span-2"><span className={labelClass}>Követelménytípus</span><select data-assembly-field="requirementType" className={inputClass} value={assembly.requirementType} onChange={(event) => onUpdate({ requirementType: event.target.value as SurveyConstructionAssembly["requirementType"] })}>{Object.values(huEkm20231101AssemblyRequirements).map((requirement) => <option key={requirement.type} value={requirement.type}>{requirement.label}{requirement.maximumUValueWm2K !== null ? ` · ${requirement.maximumUValueWm2K} W/m²K` : ""}</option>)}</select></label>
      {assembly.requirementType === "custom" ? <label className="sm:col-span-2"><span className={labelClass}>Egyedi U-határérték W/m²K</span><DecimalField dataTest="customRequirementUValueWm2K" value={assembly.customRequirementUValueWm2K || ""} onCommit={(value) => onUpdate({ customRequirementUValueWm2K: value })} placeholder="0,24" /></label> : null}
      {assembly.calculationMode === "declared" ? <><label><span className={labelClass}>Deklarált U-érték W/m²K</span><DecimalField dataTest="declaredUValueWm2K" value={assembly.declaredUValueWm2K || ""} onCommit={(value) => onUpdate({ declaredUValueWm2K: value })} placeholder="0,24" /></label><label><span className={labelClass}>Deklarált érték forrása</span><input data-assembly-field="declaredUValueSource" className={inputClass} value={assembly.declaredUValueSource || ""} onChange={(event) => onUpdate({ declaredUValueSource: event.target.value })} placeholder="Gyártói adatlap / számítás / terv" /></label></> : null}
    </div>

    <details className="group rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)]" data-assembly-surface-settings>
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-black text-[var(--survey-text)]"><ChevronRight size={16} className="transition group-open:rotate-90" /> Felületi ellenállások</summary>
      <div className="grid gap-3 border-t border-[var(--survey-border)] p-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={labelClass}>Forrás</span><select data-assembly-field="surfaceResistanceMode" className={inputClass} value={assembly.surfaceResistanceMode} onChange={(event) => onUpdate({ surfaceResistanceMode: event.target.value as SurveyConstructionAssembly["surfaceResistanceMode"] })}><option value="ruleSetDefault">Szabálycsomag – hivatalos Rsi/Rse</option><option value="custom">Egyedi, dokumentált érték</option></select></label>
        {assembly.surfaceResistanceMode === "custom" ? <><label><span className={labelClass}>Rsi m²K/W</span><DecimalField dataTest="customRsiM2KPerW" value={assembly.customRsiM2KPerW || ""} onCommit={(value) => onUpdate({ customRsiM2KPerW: value })} placeholder="0,13" /></label><label><span className={labelClass}>Rse / másik oldali Rsi m²K/W</span><DecimalField dataTest="customRseM2KPerW" value={assembly.customRseM2KPerW || ""} onCommit={(value) => onUpdate({ customRseM2KPerW: value })} placeholder="0,04" /></label></> : <div className="sm:col-span-2 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-[10px] font-bold leading-5 text-cyan-950">Felfelé: Rsi 0,10 · vízszintesen: 0,13 · lefelé: 0,17 m²K/W. Külső levegő felé Rse 0,04 m²K/W; belső válaszfalnál mindkét oldalon Rsi használatos.</div>}
      </div>
    </details>

    <details className="group rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)]" data-assembly-corrections>
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-black text-[var(--survey-text)]"><ChevronRight size={16} className="transition group-open:rotate-90" /><Construction size={16} /> U-érték korrekciók</summary>
      <div className="grid gap-4 border-t border-[var(--survey-border)] p-3">
        <label><span className={labelClass}>3%-os elhagyási szabály</span><select data-assembly-field="correctionPolicy" className={inputClass} value={assembly.corrections.policy} onChange={(event) => updateCorrections({ policy: event.target.value as SurveyConstructionAssembly["corrections"]["policy"] })}><option value="applyAll">Minden korrekció alkalmazása</option><option value="omitBelowThreePercent">3% alatt elhagyható</option></select></label>
        <div className="grid gap-3 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 sm:grid-cols-2"><div className="sm:col-span-2 text-[10px] font-black uppercase text-[var(--survey-muted)]">Légüreg-korrekció</div><label><span className={labelClass}>Szint</span><select data-assembly-field="airVoidLevel" className={inputClass} value={assembly.corrections.airVoid.level} onChange={(event) => updateCorrections({ airVoid: { ...assembly.corrections.airVoid, level: event.target.value as SurveyConstructionAssembly["corrections"]["airVoid"]["level"] } })}><option value="none">Nincs</option><option value="level1">1. szint · ΔU″ = 0,01</option><option value="level2">2. szint · ΔU″ = 0,04</option></select></label><label><span className={labelClass}>Érintett hőszigetelő réteg</span><select data-assembly-field="airVoidLayer" className={inputClass} value={assembly.corrections.airVoid.insulationLayerId || ""} onChange={(event) => updateCorrections({ airVoid: { ...assembly.corrections.airVoid, insulationLayerId: event.target.value || undefined } })}><option value="">Válassz réteget</option>{assembly.layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.material || layer.id}</option>)}</select></label></div>
        <div className="grid gap-3 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 sm:grid-cols-2"><label className="sm:col-span-2 flex items-center gap-2 text-xs font-black"><input data-assembly-field="fastenerEnabled" type="checkbox" checked={assembly.corrections.mechanicalFastener.enabled} onChange={(event) => updateFastener({ enabled: event.target.checked })} /> Mechanikai rögzítő korrekció</label>{assembly.corrections.mechanicalFastener.enabled ? <><label><span className={labelClass}>Szigetelőréteg</span><select data-assembly-field="fastenerLayer" className={inputClass} value={assembly.corrections.mechanicalFastener.insulationLayerId || ""} onChange={(event) => updateFastener({ insulationLayerId: event.target.value || undefined })}><option value="">Válassz réteget</option>{assembly.layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.material || layer.id}</option>)}</select></label><label><span className={labelClass}>Rögzítő λ W/mK</span><NumericCommit value={assembly.corrections.mechanicalFastener.fastenerLambdaWmK} onCommit={(value) => updateFastener({ fastenerLambdaWmK: value })} /></label><label><span className={labelClass}>Darabszám 1/m²</span><NumericCommit value={assembly.corrections.mechanicalFastener.fastenerCountPerSquareMeter} onCommit={(value) => updateFastener({ fastenerCountPerSquareMeter: value })} /></label><label><span className={labelClass}>Keresztmetszet m²</span><NumericCommit value={assembly.corrections.mechanicalFastener.fastenerCrossSectionSquareMeters} onCommit={(value) => updateFastener({ fastenerCrossSectionSquareMeters: value })} placeholder="0,00005" /></label><label><span className={labelClass}>Szigetelésvastagság m</span><NumericCommit value={assembly.corrections.mechanicalFastener.insulationThicknessMeters} onCommit={(value) => updateFastener({ insulationThicknessMeters: value })} /></label><label><span className={labelClass}>Behatolási hossz m</span><NumericCommit value={assembly.corrections.mechanicalFastener.penetrationLengthMeters} onCommit={(value) => updateFastener({ penetrationLengthMeters: value })} /></label><label className="flex items-center gap-2 text-[10px] font-black"><input type="checkbox" checked={assembly.corrections.mechanicalFastener.embedded} onChange={(event) => updateFastener({ embedded: event.target.checked })} /> Besüllyesztett rögzítő</label><label className="flex items-center gap-2 text-[10px] font-black"><input type="checkbox" checked={assembly.corrections.mechanicalFastener.passesAirLayer} onChange={(event) => updateFastener({ passesAirLayer: event.target.checked })} /> Légrétegen halad át</label><label className="flex items-center gap-2 text-[10px] font-black"><input type="checkbox" checked={assembly.corrections.mechanicalFastener.pointFastener} onChange={(event) => updateFastener({ pointFastener: event.target.checked })} /> Pontszerű rögzítő</label></> : null}</div>
        <div className="grid gap-3 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 sm:grid-cols-2"><label><span className={labelClass}>Fordított tető ΔU W/m²K</span><NumericCommit value={assembly.corrections.invertedRoofDeltaUWm2K} onCommit={(value) => updateCorrections({ invertedRoofDeltaUWm2K: value })} /></label><label><span className={labelClass}>Számítás / forrás</span><input data-assembly-field="invertedRoofSource" className={inputClass} value={assembly.corrections.invertedRoofSource} onChange={(event) => updateCorrections({ invertedRoofSource: event.target.value })} placeholder="MSZ EN ISO 6946 F melléklet szerinti számítás" /></label></div>
      </div>
    </details>

    {result?.validationMessages.length ? <div className="grid gap-2" data-assembly-validation-list={assembly.id}>{result.validationMessages.map((message, index) => <div key={`${message.code}-${message.layerId || index}`} data-assembly-validation={message.code} className={`rounded-xl border p-3 text-[10px] font-bold leading-5 ${message.severity === "error" ? "border-rose-300 bg-rose-50 text-rose-950" : message.severity === "warning" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-blue-300 bg-blue-50 text-blue-950"}`}>{message.severity === "error" ? <AlertTriangle size={14} className="mr-2 inline" /> : <CheckCircle2 size={14} className="mr-2 inline" />}{message.message}</div>)}</div> : null}
  </section>;
}

function DecimalField({ value, onCommit, placeholder, dataTest }: { value: string; onCommit: (value: string) => void; placeholder?: string; dataTest: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input data-assembly-field={dataTest} inputMode="decimal" className={inputClass} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => onCommit(draft.trim().replace(",", "."))} placeholder={placeholder} />;
}

function NumericCommit({ value, onCommit, placeholder }: { value: number; onCommit: (value: number) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value ? String(value) : "");
  useEffect(() => setDraft(value ? String(value) : ""), [value]);
  return <input inputMode="decimal" className={inputClass} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { const parsed = Number(draft.trim().replace(",", ".")); onCommit(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0); }} placeholder={placeholder} />;
}
