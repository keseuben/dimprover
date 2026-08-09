"use client";

import { ArrowDownRight, BatteryCharging, CheckCircle2, CircleAlert, Gauge, Sun } from "lucide-react";
import {
  energyRenovationComparisonStatusLabels,
  type EnergyRenovationComparisonSetResult,
  type EnergyRenovationMeasureComparisonResult,
  type EnergyRenovationScenarioComparisonResult,
} from "@/components/energy/domain/energyRenovationComparisonTypes";
import type { EnergyWorkspaceMode } from "@/components/energy/domain/energyFieldWorkflowTypes";

function formatNumber(value: number | null, digits = 2) {
  return value === null || !Number.isFinite(value) ? "–" : value.toLocaleString("hu-HU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function statusClass(status: EnergyRenovationScenarioComparisonResult["calculationStatus"] | EnergyRenovationMeasureComparisonResult["status"]) {
  if (status === "calculated" || status === "baseline") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (status === "partial") return "border-amber-300 bg-amber-50 text-amber-950";
  if (status === "blocked") return "border-rose-300 bg-rose-50 text-rose-900";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function statusLabel(status: EnergyRenovationMeasureComparisonResult["status"]) {
  if (status === "calculated") return "Számított";
  if (status === "partial") return "Részleges";
  if (status === "blocked") return "Javítandó";
  return "Még nem számítható";
}

function Metric({ label, current, projected, unit, reduction }: { label: string; current: number | null; projected: number | null; unit: string; reduction?: number | null }) {
  return <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3">
    <div className="text-[9px] font-black uppercase tracking-[0.08em] text-[var(--survey-muted)]">{label}</div>
    <div className="mt-2 flex items-end justify-between gap-3"><div><div className="text-[10px] font-bold text-[var(--survey-muted)]">M0</div><div className="text-lg font-black text-[var(--survey-text)]">{formatNumber(current)} <span className="text-[10px]">{unit}</span></div></div><ArrowDownRight size={18} className="mb-1 shrink-0 text-cyan-600" /><div className="text-right"><div className="text-[10px] font-bold text-cyan-700">Tervezett</div><div className="text-lg font-black text-cyan-800">{formatNumber(projected)} <span className="text-[10px]">{unit}</span></div></div></div>
    {reduction !== undefined && reduction !== null ? <div className={`mt-2 rounded-lg px-2 py-1 text-center text-[10px] font-black ${reduction >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{reduction >= 0 ? "Csökkenés" : "Növekedés"}: {formatNumber(Math.abs(reduction), 1)}%</div> : null}
  </div>;
}

export function EnergyRenovationComparisonPanel({ comparison, activeScenarioId, mode }: { comparison: EnergyRenovationComparisonSetResult; activeScenarioId: string; mode: EnergyWorkspaceMode }) {
  const baseline = comparison.scenarios.find((scenario) => scenario.kind === "existing") || null;
  const active = comparison.scenarios.find((scenario) => scenario.scenarioId === activeScenarioId && scenario.kind === "proposal")
    || comparison.scenarios.find((scenario) => scenario.kind === "proposal")
    || null;

  if (!active) return <div className="rounded-2xl border border-dashed border-[var(--survey-border)] p-5 text-center text-xs font-bold text-[var(--survey-muted)]">Nincs összehasonlítható tervezett változat.</div>;

  const visibleMessages = active.validationMessages.filter((message) => message.severity !== "info").slice(0, 4);
  return <section className="grid gap-4" data-renovation-comparison="true" data-renovation-comparison-status={active.calculationStatus}>
    <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 text-cyan-950">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.12em] text-cyan-800">M0 → {active.scenarioCode}</div><div className="mt-1 text-base font-black">Meglévő és tervezett állapot összehasonlítása</div><div className="mt-1 max-w-3xl text-xs font-semibold leading-5">A számított eredmény a jelenlegi geometria, U-értékek és méretezési fűtési terhelés alapján készül. Az éves energia, költség és besorolás még nem része ennek a verziónak.</div></div><span className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${statusClass(active.calculationStatus)}`}>{energyRenovationComparisonStatusLabels[active.calculationStatus]}</span></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4"><div className="rounded-xl border border-cyan-200 bg-white p-3"><div className="text-[9px] font-black uppercase text-cyan-700">Beválasztva</div><div className="mt-1 text-2xl font-black">{active.includedMeasureCount}</div></div><div className="rounded-xl border border-emerald-200 bg-white p-3"><div className="text-[9px] font-black uppercase text-emerald-700">Számított</div><div className="mt-1 text-2xl font-black">{active.calculatedMeasureCount}</div></div><div className="rounded-xl border border-amber-200 bg-white p-3"><div className="text-[9px] font-black uppercase text-amber-700">Részleges</div><div className="mt-1 text-2xl font-black">{active.partialMeasureCount}</div></div><div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[9px] font-black uppercase text-slate-600">Még nem számítható</div><div className="mt-1 text-2xl font-black">{active.unavailableMeasureCount}</div></div></div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Transzmissziós H" current={baseline?.projected.transmissionHeatLossCoefficientWK ?? null} projected={active.projected.transmissionHeatLossCoefficientWK} unit="W/K" reduction={active.change.transmissionReductionPercent} />
      <Metric label="Teljes H" current={baseline?.projected.totalHeatLossCoefficientWK ?? null} projected={active.projected.totalHeatLossCoefficientWK} unit="W/K" reduction={active.change.totalHeatLossReductionPercent} />
      <Metric label="Méretezési fűtési igény" current={baseline?.projected.designHeatingPowerKw ?? null} projected={active.projected.designHeatingPowerKw} unit="kW" reduction={active.change.designHeatingPowerReductionPercent} />
      <div className={`rounded-2xl border p-3 ${active.projected.heatingCapacityStatus === "sufficient" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : active.projected.heatingCapacityStatus === "insufficient" ? "border-rose-300 bg-rose-50 text-rose-950" : "border-slate-300 bg-slate-50 text-slate-700"}`}><div className="flex items-center gap-2"><Gauge size={17} /><div className="text-[9px] font-black uppercase">Fűtési kapacitás</div></div><div className="mt-2 text-xl font-black">{formatNumber(active.projected.plannedHeatingCapacityKw)} <span className="text-[10px]">kW</span></div><div className="mt-1 text-[10px] font-bold">{active.projected.heatingCapacityStatus === "sufficient" ? "A méretezési igényt lefedi." : active.projected.heatingCapacityStatus === "insufficient" ? "A méretezési igénynél kisebb." : "Nincs ellenőrizhető célkapacitás."}</div></div>
    </div>

    {(active.renewables.pvCapacityKwp !== null || active.renewables.solarThermalAreaSquareMeters !== null || active.renewables.batteryCapacityKwh !== null || active.renewables.evChargerPowerKw !== null) ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3"><div className="flex items-center gap-2 text-[9px] font-black uppercase text-[var(--survey-muted)]"><Sun size={15} /> Napelem</div><div className="mt-2 text-xl font-black">{formatNumber(active.renewables.pvCapacityKwp)} kWp</div><div className="mt-1 text-[10px] font-semibold text-[var(--survey-muted)]">Becsült hozam: {formatNumber(active.renewables.pvAnnualYieldKwh, 0)} kWh/év</div></div>
      <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3"><div className="flex items-center gap-2 text-[9px] font-black uppercase text-[var(--survey-muted)]"><Sun size={15} /> Napkollektor</div><div className="mt-2 text-xl font-black">{formatNumber(active.renewables.solarThermalAreaSquareMeters)} m²</div><div className="mt-1 text-[10px] font-semibold text-[var(--survey-muted)]">Becsült hozam: {formatNumber(active.renewables.solarThermalAnnualYieldKwh, 0)} kWh/év</div></div>
      <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3"><div className="flex items-center gap-2 text-[9px] font-black uppercase text-[var(--survey-muted)]"><BatteryCharging size={15} /> Akkumulátor</div><div className="mt-2 text-xl font-black">{formatNumber(active.renewables.batteryCapacityKwh)} kWh</div><div className="mt-1 text-[10px] font-semibold text-[var(--survey-muted)]">Kapacitás, nem éves megtakarítás.</div></div>
      <div className="rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3"><div className="flex items-center gap-2 text-[9px] font-black uppercase text-[var(--survey-muted)]"><CheckCircle2 size={15} /> Autótöltő</div><div className="mt-2 text-xl font-black">{formatNumber(active.renewables.evChargerPowerKw)} kW</div><div className="mt-1 text-[10px] font-semibold text-[var(--survey-muted)]">Éves otthoni töltés: {formatNumber(active.renewables.evAnnualHomeChargingEnergyKwh, 0)} kWh</div></div>
    </div> : null}

    <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4">
      <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black text-[var(--survey-text)]">Intézkedések számíthatósága</div><div className="mt-1 text-xs font-semibold text-[var(--survey-muted)]">Az eredmény nem tesz hozzá nem igazolt megtakarítást.</div></div><span className="text-[10px] font-black text-[var(--survey-muted)]">{active.measures.length} tétel</span></div>
      <div className="mt-3 grid gap-2">{active.measures.length ? active.measures.map((measure) => <div key={measure.measureId} data-renovation-comparison-measure={measure.measureId} className={`rounded-xl border p-3 ${statusClass(measure.status)}`}><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs font-black">{measure.title}</div><span className="rounded-full border border-current/20 bg-white/70 px-2 py-1 text-[9px] font-black uppercase">{statusLabel(measure.status)}</span></div><div className="mt-1 text-[10px] font-semibold leading-4">{measure.message}</div>{measure.savedHeatLossCoefficientWK !== null ? <div className="mt-2 text-[10px] font-black">H-változás: {formatNumber(measure.currentHeatLossCoefficientWK)} → {formatNumber(measure.projectedHeatLossCoefficientWK)} W/K · csökkenés {formatNumber(measure.savedHeatLossCoefficientWK)} W/K</div> : measure.projectedCapacityValue !== null ? <div className="mt-2 text-[10px] font-black">Tervezett méret: {formatNumber(measure.projectedCapacityValue)} {measure.projectedCapacityUnit}</div> : null}</div>) : <div className="rounded-xl border border-dashed border-[var(--survey-border)] p-4 text-center text-xs font-bold text-[var(--survey-muted)]">Nincs beválasztott intézkedés.</div>}</div>
    </div>

    {mode === "expert" ? <div className="overflow-x-auto rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)]" data-renovation-comparison-table><table className="min-w-[1080px] w-full border-collapse text-left text-[10px]"><thead className="bg-slate-900 text-white"><tr>{["Változat", "Állapot", "Intézkedés", "Htr M0", "Htr terv", "Htr változás", "Φ M0", "Φ terv", "Φ változás", "PV", "Napkollektor", "Akkumulátor", "Autótöltő"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2 font-black uppercase">{label}</th>)}</tr></thead><tbody>{comparison.scenarios.map((scenario) => <tr key={scenario.scenarioId} className="border-t border-[var(--survey-border)]"><td className="sticky left-0 bg-[var(--survey-panel)] px-3 py-2 font-black">{scenario.scenarioCode} · {scenario.scenarioName}</td><td className="px-3 py-2">{energyRenovationComparisonStatusLabels[scenario.calculationStatus]}</td><td className="px-3 py-2">{scenario.includedMeasureCount}</td><td className="px-3 py-2">{formatNumber(scenario.baseline.transmissionHeatLossCoefficientWK)}</td><td className="px-3 py-2">{formatNumber(scenario.projected.transmissionHeatLossCoefficientWK)}</td><td className="px-3 py-2">{formatNumber(scenario.change.transmissionReductionPercent, 1)}%</td><td className="px-3 py-2">{formatNumber(scenario.baseline.designHeatingPowerKw)}</td><td className="px-3 py-2">{formatNumber(scenario.projected.designHeatingPowerKw)}</td><td className="px-3 py-2">{formatNumber(scenario.change.designHeatingPowerReductionPercent, 1)}%</td><td className="px-3 py-2">{formatNumber(scenario.renewables.pvCapacityKwp)} kWp</td><td className="px-3 py-2">{formatNumber(scenario.renewables.solarThermalAreaSquareMeters)} m²</td><td className="px-3 py-2">{formatNumber(scenario.renewables.batteryCapacityKwh)} kWh</td><td className="px-3 py-2">{formatNumber(scenario.renewables.evChargerPowerKw)} kW</td></tr>)}</tbody></table></div> : null}

    {visibleMessages.length ? <div className="grid gap-2">{visibleMessages.map((message) => <div key={`${message.code}-${message.measureId || "scenario"}`} className={`flex items-start gap-2 rounded-xl border p-3 text-xs font-bold ${message.severity === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : "border-amber-300 bg-amber-50 text-amber-950"}`}><CircleAlert size={16} className="mt-0.5 shrink-0" /><span>{message.message}</span></div>)}</div> : null}
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">A változat-összehasonlítás méretezési hőveszteség- és kapacitás-előkészítés. Nem éves energiamegtakarítás, nem megtérülésszámítás és nem hiteles energetikai tanúsítvány.</div>
  </section>;
}
