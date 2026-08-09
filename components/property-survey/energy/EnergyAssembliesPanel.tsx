"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, ChevronRight, Layers3, Ruler } from "lucide-react";
import type { EnergyRequirementLevel } from "@/components/energy/domain/energyProjectTypes";
import type { EnergyAssemblyRuleData, EnergyAssemblySetResult, EnergyInsulationThicknessResult } from "@/components/energy/domain/energyAssemblyTypes";
import { calculateRequiredInsulationThickness } from "@/components/energy/calculations/assemblies/calculateInsulationRequirement";
import type { SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";

const inputClass = "h-10 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] px-3 text-xs font-bold text-[var(--survey-text)] outline-none focus:border-cyan-500";
const labelClass = "mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-[var(--survey-muted)]";

function format(value: number | null, digits = 3) {
  return value === null ? "–" : value.toLocaleString("hu-HU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function complianceLabel(value: EnergyAssemblySetResult["results"][number]["compliance"]) {
  if (value === "compliant") return "Megfelel";
  if (value === "notCompliant") return "Nem felel meg";
  if (value === "groundCalculationRequired") return "Talajszámítás szükséges";
  if (value === "notApplicable") return "Nem alkalmazandó";
  return "Nem számítható";
}

function complianceTone(value: EnergyAssemblySetResult["results"][number]["compliance"]) {
  if (value === "compliant") return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (value === "notCompliant" || value === "notCalculated") return "border-rose-300 bg-rose-50 text-rose-950";
  return "border-amber-300 bg-amber-50 text-amber-950";
}

type Props = {
  assemblies: SurveyConstructionAssembly[];
  resultSet: EnergyAssemblySetResult;
  rules: EnergyAssemblyRuleData;
  requirementLevel: EnergyRequirementLevel;
  onUpdateAssembly: (assemblyId: string, patch: Partial<SurveyConstructionAssembly>) => void;
};

export function EnergyAssembliesPanel({ assemblies, resultSet, rules, requirementLevel, onUpdateAssembly }: Props) {
  const [activeAssemblyId, setActiveAssemblyId] = useState(assemblies[0]?.id || "");
  const activeAssembly = assemblies.find((assembly) => assembly.id === activeAssemblyId) || assemblies[0] || null;
  const activeResult = resultSet.results.find((result) => result.assemblyId === activeAssembly?.id) || null;
  const solidLayers = activeAssembly?.layers.filter((layer) => layer.kind === "solid") || [];
  const [insulationLayerId, setInsulationLayerId] = useState("");
  const [targetDraft, setTargetDraft] = useState("");
  const [insulationResult, setInsulationResult] = useState<EnergyInsulationThicknessResult | null>(null);
  const selectedInsulationLayerId = solidLayers.some((layer) => layer.id === insulationLayerId) ? insulationLayerId : solidLayers[0]?.id || "";
  const targetDefault = activeResult?.requirementMaximumUValueWm2K ? String(activeResult.requirementMaximumUValueWm2K) : "";
  const displayedTarget = targetDraft || targetDefault;
  const totalTrace = useMemo(() => resultSet.results.reduce((sum, result) => sum + result.trace.length, 0), [resultSet.results]);

  function runInsulationSearch() {
    if (!activeAssembly || !selectedInsulationLayerId) return;
    const parsedTarget = Number(displayedTarget.replace(",", "."));
    setInsulationResult(calculateRequiredInsulationThickness({
      assembly: activeAssembly,
      insulationLayerId: selectedInsulationLayerId,
      rules,
      requirementLevel,
      targetUValueWm2K: Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : undefined,
    }));
  }

  function applyRecommendation() {
    if (!activeAssembly || !insulationResult?.valid || insulationResult.roundedRecommendedAdditionalThicknessMeters === null) return;
    const layer = activeAssembly.layers.find((item) => item.id === selectedInsulationLayerId);
    if (!layer) return;
    const nextThicknessCm = Math.round((layer.thicknessCm + insulationResult.roundedRecommendedAdditionalThicknessMeters * 100) * 10) / 10;
    onUpdateAssembly(activeAssembly.id, {
      layers: activeAssembly.layers.map((item) => item.id === layer.id ? { ...item, thicknessCm: nextThicknessCm } : item),
      updatedAt: new Date().toISOString(),
    });
    setInsulationResult(null);
  }

  return <section className="grid min-w-0 gap-4" data-energy-assemblies-panel="true">
    <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-cyan-950">
      <div className="flex items-start gap-3"><Layers3 size={22} className="shrink-0" /><div><div className="text-sm font-black">Rétegrend- és U-érték motor {resultSet.engineVersion}</div><p className="mt-1 text-xs font-semibold leading-5">{resultSet.totals.assemblyCount} rétegrend · {resultSet.totals.validCount} számítható · {resultSet.totals.blockedCount} blokkolt · {totalTrace} auditált képletsor.</p></div></div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Metric label="Számítható" value={resultSet.totals.validCount} tone="emerald" />
      <Metric label="Blokkolt" value={resultSet.totals.blockedCount} tone="rose" />
      <Metric label="Megfelel" value={resultSet.totals.compliantCount} tone="emerald" />
      <Metric label="Nem felel meg" value={resultSet.totals.notCompliantCount} tone="rose" />
    </div>

    {!assemblies.length ? <div className="rounded-2xl border border-dashed border-[var(--survey-border)] p-6 text-center text-xs font-bold text-[var(--survey-muted)]">Még nincs rögzített rétegrend. A Szerkezetek munkalapon hozz létre fal-, padló-, födém- vagy lábazati rétegrendet.</div> : <>
      <label><span className={labelClass}>Vizsgált rétegrend</span><select data-energy-assembly-selector className={inputClass} value={activeAssembly?.id || ""} onChange={(event) => { setActiveAssemblyId(event.target.value); setInsulationResult(null); setInsulationLayerId(""); setTargetDraft(""); }}>{assemblies.map((assembly) => <option key={assembly.id} value={assembly.id}>{assembly.name}</option>)}</select></label>

      {activeAssembly && activeResult ? <>
        <div className={`rounded-2xl border p-4 ${activeResult.blocked ? "border-rose-300 bg-rose-50 text-rose-950" : "border-emerald-300 bg-emerald-50 text-emerald-950"}`} data-energy-active-assembly-result={activeAssembly.id}>
          <div className="flex items-start gap-3">{activeResult.blocked ? <AlertTriangle size={22} className="shrink-0" /> : <CheckCircle2 size={22} className="shrink-0" />}<div className="min-w-0 flex-1"><div className="text-lg font-black">{activeResult.effectiveUValueWm2K === null ? "Nincs érvényes U-érték" : `${format(activeResult.effectiveUValueWm2K)} W/m²K`}</div><div className="mt-1 text-[10px] font-semibold leading-5">Rréteg: {format(activeResult.layerResistanceM2KPerW)} · Rsi: {format(activeResult.rsiM2KPerW)} · Rse: {format(activeResult.rseM2KPerW)} · Rtot: {format(activeResult.totalResistanceM2KPerW)} m²K/W</div></div></div>
          <div className={`mt-3 rounded-xl border p-3 text-xs font-black ${complianceTone(activeResult.compliance)}`} data-energy-active-compliance={activeResult.compliance}>{complianceLabel(activeResult.compliance)}{activeResult.requirementMaximumUValueWm2K !== null ? ` · követelmény ${format(activeResult.requirementMaximumUValueWm2K)} W/m²K` : ""}{activeResult.complianceDifferenceWm2K !== null ? ` · eltérés ${activeResult.complianceDifferenceWm2K > 0 ? "+" : ""}${format(activeResult.complianceDifferenceWm2K)} W/m²K` : ""}</div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 sm:grid-cols-3">
          <SmallMetric label="Korrigálatlan U₀" value={`${format(activeResult.baseUValueWm2K)} W/m²K`} />
          <SmallMetric label="Alkalmazott ΔU" value={`${format(activeResult.correction.appliedDeltaUWm2K, 4)} W/m²K`} />
          <SmallMetric label="Korrekciós arány" value={`${format(activeResult.correction.correctionRatioPercent, 2)}%`} />
          <SmallMetric label="Számított U" value={`${format(activeResult.calculatedUValueWm2K)} W/m²K`} />
          <SmallMetric label="Deklarált U" value={`${format(activeResult.declaredUValueWm2K)} W/m²K`} />
          <SmallMetric label="Aktív mód" value={activeResult.calculationMode === "declared" ? "Deklarált" : "Számított"} />
        </div>

        <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
          <div className="mb-3 text-sm font-black text-[var(--survey-text)]">Rétegenkénti hővezetési ellenállás</div>
          <div className="overflow-x-auto"><table className="min-w-[650px] w-full text-left text-[10px] font-semibold text-[var(--survey-text)]" data-energy-layer-result-table><thead><tr className="border-b border-[var(--survey-border)] text-[9px] uppercase text-[var(--survey-muted)]"><th className="p-2">Réteg</th><th className="p-2">Típus</th><th className="p-2 text-right">d</th><th className="p-2 text-right">λ</th><th className="p-2 text-right">R</th><th className="p-2">Forrás</th></tr></thead><tbody>{activeResult.layerResults.map((layer) => <tr key={layer.layerId} data-energy-layer-result={layer.layerId} className="border-b border-[var(--survey-border)]/70 last:border-0"><td className="p-2 font-black">{layer.layerName}</td><td className="p-2">{layer.kind}</td><td className="p-2 text-right">{layer.thicknessMeters === null ? "–" : `${format(layer.thicknessMeters, 3)} m`}</td><td className="p-2 text-right">{format(layer.lambdaWmK, 3)}</td><td className="p-2 text-right font-black">{format(layer.resistanceM2KPerW, 4)}</td><td className="p-2">{layer.resistanceSource}</td></tr>)}</tbody></table></div>
        </div>

        <div className="rounded-2xl border border-violet-300 bg-violet-50 p-4 text-violet-950" data-insulation-solver>
          <div className="flex items-start gap-3"><Ruler size={20} className="shrink-0" /><div><div className="text-sm font-black">Szükséges hőszigetelés-vastagság</div><p className="mt-1 text-[10px] font-semibold leading-5">A kiválasztott szilárd réteg vastagságát iteratívan növeli, és minden lépésben újraszámolja az U-értéket és a bekapcsolt korrekciókat.</p></div></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className={labelClass}>Hőszigetelő réteg</span><select data-insulation-layer className={inputClass} value={selectedInsulationLayerId} onChange={(event) => { setInsulationLayerId(event.target.value); setInsulationResult(null); }}><option value="">Válassz réteget</option>{solidLayers.map((layer) => <option key={layer.id} value={layer.id}>{layer.material || layer.id} · {layer.thicknessCm} cm</option>)}</select></label><label><span className={labelClass}>Cél U-érték W/m²K</span><input data-insulation-target inputMode="decimal" className={inputClass} value={displayedTarget} onChange={(event) => setTargetDraft(event.target.value)} placeholder="0,24" /></label></div>
          <button type="button" data-run-insulation-solver disabled={!selectedInsulationLayerId} onClick={runInsulationSearch} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-xs font-black text-white disabled:opacity-40"><Calculator size={16} /> Vastagság számítása</button>
          {insulationResult ? <div className={`mt-3 rounded-xl border p-3 text-xs font-bold leading-5 ${insulationResult.valid ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-rose-300 bg-rose-50 text-rose-950"}`} data-insulation-result={insulationResult.valid ? "valid" : "invalid"}><div>{insulationResult.message}</div>{insulationResult.requiredAdditionalThicknessMeters !== null ? <div className="mt-2 grid grid-cols-2 gap-2"><SmallMetric label="Minimális többlet" value={`${format(insulationResult.requiredAdditionalThicknessMeters * 100, 1)} cm`} /><SmallMetric label="Gyakorlati többlet" value={`${format((insulationResult.roundedRecommendedAdditionalThicknessMeters || 0) * 100, 0)} cm`} /></div> : null}{insulationResult.valid && (insulationResult.roundedRecommendedAdditionalThicknessMeters || 0) > 0 ? <button type="button" data-apply-insulation-recommendation onClick={applyRecommendation} className="mt-3 w-full rounded-xl bg-emerald-700 px-3 py-2 text-[10px] font-black text-white">Javasolt többlet alkalmazása a rétegen</button> : null}</div> : null}
        </div>

        {activeResult.validationMessages.length ? <div className="grid gap-2" data-energy-assembly-validation>{activeResult.validationMessages.map((message, index) => <div key={`${message.code}-${message.layerId || index}`} className={`rounded-xl border p-3 text-[10px] font-bold leading-5 ${message.severity === "error" ? "border-rose-300 bg-rose-50 text-rose-950" : message.severity === "warning" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-blue-300 bg-blue-50 text-blue-950"}`} data-energy-assembly-message={message.code}>{message.message}</div>)}</div> : null}

        <div className="grid gap-2" data-energy-assembly-trace>{activeResult.trace.map((trace) => <details key={trace.id} className="group rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)]" data-energy-assembly-trace-rule={trace.ruleId}><summary className="flex cursor-pointer list-none items-start gap-2 p-3"><ChevronRight size={15} className="mt-0.5 shrink-0 transition group-open:rotate-90" /><span className="min-w-0 flex-1"><span className="block text-xs font-black text-[var(--survey-text)]">{trace.label}</span><span className="mt-1 block text-[9px] font-bold text-[var(--survey-muted)]">{trace.ruleId} · {trace.formula}</span></span><span className="shrink-0 text-xs font-black text-[var(--survey-text)]">{format(trace.value, trace.unit === "%" ? 2 : 4)} {trace.unit.replace("m2K/W", "m²K/W").replace("W/m2K", "W/m²K")}</span></summary><div className="border-t border-[var(--survey-border)] p-3 text-[10px] font-semibold text-[var(--survey-muted)]"><div><strong className="text-[var(--survey-text)]">Kerekítetlen:</strong> {trace.unroundedValue}</div><div className="mt-2 grid gap-1">{Object.entries(trace.inputs).map(([key, value]) => <div key={key}><strong className="text-[var(--survey-text)]">{key}:</strong> {String(value)}</div>)}</div></div></details>)}</div>
      </> : null}
    </>}

    <div className="rounded-xl border border-dashed border-[var(--survey-border)] p-3 text-[10px] font-semibold leading-5 text-[var(--survey-muted)]">Forrás: {resultSet.ruleSourceReferenceId} · ellenőrzés: {resultSet.ruleCheckedAt}. Talajjal érintkező padló és fal esetén a rétegrendi U-érték önmagában nem minősíti a rendeleti egyenértékű követelményt.</div>
  </section>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "emerald" | "rose" }) {
  return <div className={`rounded-2xl border p-3 text-center ${tone === "emerald" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-rose-300 bg-rose-50 text-rose-950"}`}><div className="text-2xl font-black">{value}</div><div className="mt-1 text-[8px] font-black uppercase">{label}</div></div>;
}
function SmallMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-current/20 bg-white/60 p-2"><div className="text-[8px] font-black uppercase opacity-70">{label}</div><div className="mt-1 text-xs font-black">{value}</div></div>; }
